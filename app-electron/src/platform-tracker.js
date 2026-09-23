// platform-tracker.js — v3.9: live rect polling for the window the cat stands
// on. The 4.5s window scan left the cat glued to a STALE top border for up to
// one scan interval while the user dragged/resized its window, then the next
// scan snapped (or hopped) it back — the "float, then jump" half of the
// rendering-jump reports. This module owns ONE persistent PowerShell that
// reads retarget commands from stdin and emits one JSON line per poll:
//   stdin : "track <hwnd>" | "off"
//   stdout: {"id":123,"x":..,"y":..,"w":..,"h":..,"ok":true}
//           {"id":123,"ok":false}                       (gone / minimized)
// GetWindowRect via P/Invoke is a native call — the poll loop costs ~0% CPU,
// unlike per-sample PowerShell spawns. main.js forwards each line to the
// renderer as 'platform-rect'; the brain rides the border smoothly.
// Everything is injectable (spawnFn) so unit tests drive the lifecycle.

'use strict';

// Poll cadence: 3Hz is 3-9 samples per human drag gesture and caps the
// brain's per-update ride step (130px) at an effective ~390px/s chase — fast
// enough to read as the cat scrambling after its window, slow enough that the
// update stream never floods the renderer IPC.
export const POLL_MS = 320;

export function trackerScript(pollMs = POLL_MS, parentPid = null) {
  const ms = Math.max(120, Math.round(pollMs || POLL_MS));
  // parent-PID heartbeat: if the MeowCat main process dies without a clean
  // stop(), this loop must not become an orphan PowerShell spinning forever.
  const parentCheck = Number.isFinite(parentPid) && parentPid > 0
    ? `if (-not (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue)) { break }\n  `
    : '';
  return `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MeowTrack {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
}
"@
$reader = [Console]::In
$target = [int64]0
while ($true) {
  try {
    while ($reader.Peek() -ge 0) {
      $line = $reader.ReadLine()
      if ($null -eq $line) { break }
      if ($line.StartsWith('track ')) {
        $v = [int64]0
        if ([int64]::TryParse($line.Substring(6).Trim(), [ref]$v)) { $target = $v }
      } elseif ($line -eq 'off') { $target = [int64]0 }
    }
  } catch {}
  ${parentCheck}if ($target -ne 0) {
    $h = [IntPtr]$target
    $r = New-Object MeowTrack+RECT
    $ok = [MeowTrack]::GetWindowRect($h, [ref]$r)
    $vis = [MeowTrack]::IsWindowVisible($h)
    $min = [MeowTrack]::IsIconic($h)
    if ($ok -and $vis -and (-not $min) -and $r.L -gt -10000) {
      "{\\"id\\":$target,\\"x\\":$($r.L),\\"y\\":$($r.T),\\"w\\":$($r.R - $r.L),\\"h\\":$($r.B - $r.T),\\"ok\\":true}"
    } else {
      "{\\"id\\":$target,\\"ok\\":false}"
    }
  }
  Start-Sleep -Milliseconds ${ms}
}`.trim();
}

// tolerant parse of one tracker line (pure, unit-tested)
export function parseTrackerLine(raw) {
  try {
    const v = JSON.parse(String(raw || '').trim());
    if (!v || !Number.isFinite(v.id)) return null;
    if (v.ok === false) return { id: v.id, ok: false };
    if (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.w) && Number.isFinite(v.h) &&
        v.w > 0 && v.h > 0) {
      return { id: v.id, ok: true, x: v.x, y: v.y, w: v.w, h: v.h };
    }
    return null;
  } catch { return null; }
}

export function createPlatformTracker(opts = {}) {
  const spawnFn = opts.spawnFn || null;
  const onRect = opts.onRect || (() => {});
  const command = opts.command || 'powershell.exe';
  const pollMs = opts.pollMs ?? POLL_MS;
  const parentPid = opts.parentPid ?? process.pid;
  let proc = null, buf = '', target = null, restartTimer = null, fails = 0, stopped = true;

  function send(line) {
    if (!proc || !proc.stdin || proc.stdin.writableLength > 4096) return;
    try { proc.stdin.write(line + '\n'); } catch { /* dying stream */ }
  }

  function start() {
    if (!spawnFn || proc) return;
    stopped = false;
    let p = null;
    try {
      p = spawnFn(command, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', trackerScript(pollMs, parentPid)],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch { scheduleRestart(); return; }
    proc = p;
    buf = '';
    p.stdout.on('data', d => {
      buf += d;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        fails = 0;
        const r = parseTrackerLine(line);
        if (r) onRect(r);
      }
    });
    p.on('error', () => { if (proc === p) proc = null; scheduleRestart(); });
    p.on('close', () => { if (proc === p) { proc = null; if (!stopped) scheduleRestart(); } });
    // (re)arm the current target after a respawn
    if (target != null) send(`track ${target}`);
  }

  function scheduleRestart() {
    if (stopped || restartTimer) return;
    fails++;
    restartTimer = setTimeout(() => { restartTimer = null; if (!stopped) start(); }, Math.min(15000, 800 * fails));
    if (restartTimer.unref) restartTimer.unref();
  }

  return {
    start() { start(); },
    stop() {
      stopped = true;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      target = null;
      if (proc) { try { proc.kill(); } catch {} proc = null; }
    },
    // retarget the poller (id = hwnd number, or null to idle)
    track(id) {
      const t = Number.isFinite(id) && id > 0 ? Math.round(id) : null;
      if (t === target) return;
      target = t;
      if (t == null) send('off');
      else send(`track ${t}`);
    },
    get alive() { return !!proc; },
    get target() { return target; },
    // test hooks
    __fails: () => fails,
  };
}
