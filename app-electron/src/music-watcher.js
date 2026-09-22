// music-watcher.js — "what's playing" for the bop-along feature.
//  * Windows: one long-lived PowerShell child polls the Modern Media
//    Transport (SMTC) via WinRT — the same session Spotify/Edge/YouTube
//    report to the volume flyout. Prints ONE JSON line per change.
//  * Linux/other: `playerctl` if present, same output shape.
//  * Nowhere: watcher simply stays silent and the cat stays unimpressed.

'use strict';

export const SMTC_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
                 $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $t) {
  $asTask = $asTaskGeneric.MakeGenericMethod($t)
  $netTask = $asTask.Invoke($null, @($op))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$last = ''
while ($true) {
  $s = $mgr.GetSessions() | Select-Object -First 1
  if ($s) {
    $prop = Await ($s.GetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $obj = @{ status = "$($s.PlaybackStatus)"; title = "$($prop.Title)"; artist = "$($prop.Artist)" }
    $line = ConvertTo-Json $obj -Compress
    if ($line -ne $last) { $last = $line; [Console]::Out.WriteLine($line) }
  } elseif ($last -ne 'none') {
    $last = 'none'
    [Console]::Out.WriteLine('{"status":"stopped","title":"","artist":""}')
  }
  Start-Sleep -Milliseconds 4000
}
`.trim() + '\n';

// linux fallback: poll playerctl metadata every 4s, print on change
export function playerctlLoop(spawnFn) {
  let last = '';
  return () => new Promise(resolve => {
    let p, out = '';
    try {
      p = spawnFn('playerctl', ['metadata', '--format', '{"status":"{{status}}","title":"{{title}}","artist":"{{artist}}"}'],
        { timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { resolve(''); return; }
    p.stdout?.on('data', d => { out += d; });
    p.on('error', () => resolve(''));
    p.on('close', code => {
      const line = (out.trim().split(/\r?\n/).filter(Boolean).pop()) || '';
      if (code !== 0 && !line) { resolve(''); return; }     // no players
      if (line !== last) { last = line; resolve(line); } else { resolve(''); }
    });
  });
}

export function createMusicWatcher(opts = {}) {
  const spawnFn = opts.spawnFn || null;
  const platform = opts.platform || process.platform;
  const onMusic = opts.onMusic || (() => {});
  let child = null;
  let timer = null;
  let stopped = false;
  let lastSent = null;

  function emit(line) {
    const parsed = parseLine(line);
    if (!parsed) return;
    const sig = JSON.stringify(parsed);
    if (sig !== lastSent) { lastSent = sig; onMusic(parsed); }
  }

  function parseLine(raw) {
    try {
      const v = JSON.parse(String(raw || '').trim());
      const st = String(v.status || '').toLowerCase();
      return {
        status: st.includes('playing') ? 'playing' : st.includes('paused') ? 'paused' : 'stopped',
        title: typeof v.title === 'string' ? v.title.slice(0, 80) : '',
        artist: typeof v.artist === 'string' ? v.artist.slice(0, 80) : '',
      };
    } catch { return null; }
  }

  function startWin() {
    try {
      child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SMTC_SCRIPT],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { return; }
    let buf = '';
    child.stdout?.on('data', d => {
      buf += d;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) emit(line);
      }
    });
    child.on('error', () => { child = null; });
  }

  function startLinux() {
    const poll = playerctlLoop(spawnFn);
    timer = setInterval(async () => {
      if (stopped) return;
      const line = await poll();
      if (line) emit(line);
    }, 4000);
    if (timer.unref) timer.unref();
  }

  return {
    start() {
      if (child || timer || !spawnFn) return;
      stopped = false;
      if (platform === 'win32') startWin(); else startLinux();
    },
    stop() {
      stopped = true;
      if (child) { try { child.kill(); } catch {} child = null; }
      if (timer) { clearInterval(timer); timer = null; }
    },
    get running() { return !!(child || timer); },
  };
}
