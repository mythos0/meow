// sys-monitor.js — main-process sampler for the "living on your machine" pack.
//  * CPU/RAM: Linux reads /proc (no subprocess); Windows uses one short
//    PowerShell one-shot per sample (CIM LoadPercentage + memory).
//  * Processes: `ps -eo comm=` (Linux) / `tasklist /fo csv /nh` (Windows).
// Everything heavy is behind injectable fs/spawn so unit tests drive it.

'use strict';

// ----------------------------- /proc parsing (pure) -----------------------------
export function parseProcStat(text) {
  const line = String(text || '').split('\n')[0] || '';
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  if (parts.length < 4 || parts.some(v => !Number.isFinite(v))) return null;
  // user nice system idle iowait irq softirq steal ...
  const idle = parts[3] + (parts[4] || 0);           // idle + iowait
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

export function cpuPercentBetween(prev, cur) {
  if (!prev || !cur) return null;
  const dTotal = cur.total - prev.total;
  const dIdle = cur.idle - prev.idle;
  if (dTotal <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - dIdle / dTotal) * 100)));
}

export function memUsedPercent(text) {
  const m = String(text || '');
  const total = Number((m.match(/^MemTotal:\s+(\d+)/m) || [])[1]);
  const avail = Number((m.match(/^MemAvailable:\s+(\d+)/m) || [])[1]);
  if (!total || !Number.isFinite(avail)) return null;
  return Math.round(100 * (1 - avail / total));
}

// PowerShell one-shot output: {"cpu":12,"ram":48,"battery":87,"charging":true} (tolerant parse)
export function parseWinStats(raw) {
  try {
    const v = JSON.parse(String(raw || '').trim().split(/\r?\n/).filter(Boolean).pop() || '');
    const cpu = Number.isFinite(+v.cpu) ? Math.max(0, Math.min(100, Math.round(+v.cpu))) : null;
    const ram = Number.isFinite(+v.ram) ? Math.max(0, Math.min(100, Math.round(+v.ram))) : null;
    // battery: percent 0..100 (null when no battery), charging bool (null unknown)
    let battery = null, charging = null;
    if (v.battery != null && Number.isFinite(+v.battery)) battery = Math.max(0, Math.min(100, Math.round(+v.battery)));
    if (typeof v.charging === 'boolean') charging = v.charging;
    return { cpu, ram, battery, charging };
  } catch { return { cpu: null, ram: null, battery: null, charging: null }; }
}

// linux battery sysfs (pure): /sys/class/power_supply/BAT0/capacity -> "87"
export function parseBatteryCapacity(text) {
  const v = parseInt(String(text || '').trim(), 10);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
}

// /sys/class/power_supply/BAT0/status -> "Charging"|"Discharging"|"Full"|"Unknown"
export function parseBatteryStatus(text) {
  const t = String(text || '').trim().toLowerCase();
  if (t.includes('charging') && !t.includes('discharging')) return true;   // charging
  if (t === 'full') return true;                                           // plugged, full
  if (t.includes('discharging')) return false;
  return null;                                                             // unknown
}

// win32 PS script: one JSON line with CPU% + RAM used % + battery (if present)
export const WIN_STATS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$ram = [math]::Round(100 * (1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize))
$bat = Get-CimInstance Win32_Battery | Select-Object -First 1
$bl = $null; $bc = $null
if ($bat) {
  $bl = [int]$bat.EstimatedChargeRemaining
  $bc = ($bat.BatteryStatus -ne 1)   # 1 = discharging/on battery, 2 = on AC/charging
}
"{\\"cpu\\":$([int]$cpu),\\"ram\\":$([int]$ram),\\"battery\\":$(if ($null -ne $bl) {[int]$bl} else {'null'}),\\"charging\\":$(if ($null -ne $bc) {$bc.ToString().ToLower()} else {'null'})}"
`.trim();

// v3.7: the STREAMING variant — one persistent PowerShell that emits a JSON
// line every N seconds. A fresh one-shot per sample cost a full PowerShell
// startup (~0.3 CPU-s) every 5s, which users felt as constant CPU burn.
export function winStatsStreamScript(seconds) {
  const s = Math.max(1, Math.round(seconds || 5));
  return `
$ErrorActionPreference = 'SilentlyContinue'
$interval = ${s}
while ($true) {
  $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
  $os = Get-CimInstance Win32_OperatingSystem
  $ram = [math]::Round(100 * (1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize))
  $bat = Get-CimInstance Win32_Battery | Select-Object -First 1
  $bl = $null; $bc = $null
  if ($bat) {
    $bl = [int]$bat.EstimatedChargeRemaining
    $bc = ($bat.BatteryStatus -ne 1)
  }
  "{\\"cpu\\":$([int]$cpu),\\"ram\\":$([int]$ram),\\"battery\\":$(if ($null -ne $bl) {[int]$bl} else {'null'}),\\"charging\\":$(if ($null -ne $bc) {$bc.ToString().ToLower()} else {'null'})}"
  Start-Sleep -Seconds $interval
}`.trim();
}

// ----------------------------- poller -------------------------------------
// v3.7 architecture:
//   win32: ONE persistent PowerShell streams CPU/RAM/battery JSON lines
//          (startStream); a watchdog restarts it with backoff if it dies or
//          goes quiet, and after 4 failures we fall back to the legacy
//          one-shot timer. The process list stays a one-shot `tasklist` on
//          its own slower timer (procEvery samples).
//   linux: unchanged — /proc reads in-process (no subprocess at all).
export function createSysMonitor(opts = {}) {
  const spawnFn = opts.spawnFn || null;             // child_process.spawn
  const readFn = opts.readFn || (() => null);       // fs.readFileSync
  const platform = opts.platform || process.platform;
  const intervalMs = opts.intervalMs ?? 5000;
  const procEvery = opts.procEvery ?? 2;            // process list every Nth sample
  const onSample = opts.onSample || (() => {});
  const onProcesses = opts.onProcesses || (() => {});
  const wantStream = opts.streamWin !== false;      // v3.7 default: streaming on win32
  const MAX_STREAM_FAILS = 4;

  let running = false;
  let timer = null, procTimer = null, tickN = 0, prevStat = null, busy = false;
  // streaming sampler state
  let streamProc = null, streamBuf = '', streamFails = 0;
  let streamRestart = null, streamWatchdog = null;
  const useStream = () => wantStream && platform === 'win32' && !!spawnFn && streamFails < MAX_STREAM_FAILS;

  function handleSample(s) {
    if (s && (s.cpu != null || s.ram != null || s.battery != null)) onSample(s);
  }

  function clearStreamTimers() {
    if (streamRestart) { clearTimeout(streamRestart); streamRestart = null; }
    if (streamWatchdog) { clearTimeout(streamWatchdog); streamWatchdog = null; }
  }
  function killStream() {
    if (streamProc) { try { streamProc.kill(); } catch {} streamProc = null; }
  }
  function armWatchdog() {
    if (streamWatchdog) clearTimeout(streamWatchdog);
    streamWatchdog = setTimeout(() => {
      // no line for 2.5 intervals — PowerShell hung: kill and respawn
      if (running && streamProc) { streamFails++; killStream(); scheduleStreamRestart(); }
    }, intervalMs * 2.5 + 1500);
    if (streamWatchdog.unref) streamWatchdog.unref();
  }
  function scheduleStreamRestart() {
    if (!running) return;
    if (streamFails >= MAX_STREAM_FAILS) { fallbackToTimer(); return; }
    streamRestart = setTimeout(() => {
      streamRestart = null;
      if (running && useStream()) startStream();
    }, Math.min(30000, 2000 * Math.max(1, streamFails)));
    if (streamRestart.unref) streamRestart.unref();
  }
  function startStream() {
    let p = null;
    try {
      p = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', winStatsStreamScript(intervalMs / 1000)],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { scheduleStreamRestart(); return; }
    streamProc = p;
    streamBuf = '';
    p.stdout.on('data', d => {
      streamBuf += d;
      let idx;
      while ((idx = streamBuf.indexOf('\n')) >= 0) {
        const line = streamBuf.slice(0, idx).trim();
        streamBuf = streamBuf.slice(idx + 1);
        if (!line) continue;
        streamFails = 0;                       // healthy
        handleSample(parseWinStats(line));
      }
    });
    p.on('error', () => { streamFails++; if (streamProc === p) streamProc = null; scheduleStreamRestart(); });
    p.on('close', () => {
      if (streamProc === p) {
        streamProc = null;
        if (running) streamFails++;   // v3.7: a stream that died mid-run is a failure
        scheduleStreamRestart();
      }
    });
    armWatchdog();
  }
  function fallbackToTimer() {
    if (timer) return;
    sample();
    timer = setInterval(sample, intervalMs);
    if (timer.unref) timer.unref();
  }

  async function sample() {
    if (busy) return;
    busy = true;
    try {
      let cpu = null, ram = null, battery = null, charging = null;
      if (platform === 'linux') {
        const cur = parseProcStat(readFn('/proc/stat'));
        cpu = cpuPercentBetween(prevStat, cur);
        prevStat = cur || prevStat;
        ram = memUsedPercent(readFn('/proc/meminfo'));
        // battery via sysfs (first BAT* device) — null when none (desktop)
        const cap = readFn('/sys/class/power_supply/BAT0/capacity') || readFn('/sys/class/power_supply/BAT1/capacity');
        battery = parseBatteryCapacity(cap);
        const bst = readFn('/sys/class/power_supply/BAT0/status') || readFn('/sys/class/power_supply/BAT1/status');
        charging = parseBatteryStatus(bst);
      } else if (platform === 'win32' && spawnFn) {
        const out = await new Promise(resolve => {
          let p, out2 = '';
          try {
            p = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_STATS_SCRIPT],
              { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
          } catch { resolve(''); return; }
          const kill = setTimeout(() => { try { p.kill(); } catch {} }, 6000);
          p.stdout.on('data', d => { out2 += d; });
          p.on('error', () => { clearTimeout(kill); resolve(''); });
          p.on('close', () => { clearTimeout(kill); resolve(out2); });
        });
        ({ cpu, ram, battery, charging } = parseWinStats(out));
      }
      handleSample({ cpu, ram, battery, charging });
      tickN++;
    } catch { /* never kill the app over telemetry */ }
    finally { busy = false; }
  }

  async function sampleProcs() {
    if (!spawnFn) return;
    const isWin = platform === 'win32';
    const names = await new Promise(resolve => {
      let p, out = '';
      try {
        p = spawnFn(isWin ? 'tasklist' : 'ps',
          isWin ? ['/fo', 'csv', '/nh'] : ['-eo', 'comm='],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch { resolve(''); return; }
      const kill = setTimeout(() => { try { p.kill(); } catch {} }, 8000);
      p.stdout.on('data', d => { out += d; });
      p.on('error', () => { clearTimeout(kill); resolve(''); });
      p.on('close', () => { clearTimeout(kill); resolve(out); });
    });
    if (names) onProcesses(names);
  }

  return {
    start() {
      if (running) return;
      running = true;
      if (useStream()) { startStream(); }
      if (!streamProc && !timer) fallbackToTimer();      // linux, or stream failed to spawn
      if (spawnFn) {
        sampleProcs();
        if (!procTimer) {
          procTimer = setInterval(sampleProcs, intervalMs * procEvery);
          if (procTimer.unref) procTimer.unref();
        }
      }
    },
    stop() {
      running = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (procTimer) { clearInterval(procTimer); procTimer = null; }
      clearStreamTimers();
      killStream();
    },
    get running() { return running || !!timer; },
    sampleNow: sample,
    // v3.7 test hooks
    __streamAlive: () => !!streamProc,
    __streamFails: () => streamFails,
    __kickStream: () => { if (streamProc) { try { streamProc.kill(); } catch {} } },
  };
}
