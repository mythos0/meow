// window-scan.js — enumerate visible top-level windows so the cat can hop
// onto their top borders. Main-process only; all parsing is pure + testable.
// On Windows it spawns PowerShell with a Win32 EnumWindows script (no native
// modules needed); elsewhere (tests/Linux) spawnFn is injectable.

'use strict';

export const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class MeowWinEnum {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
}
"@
$out = New-Object System.Collections.ArrayList
$cb = [MeowWinEnum+EnumProc]{ param($h, $l)
  if (-not [MeowWinEnum]::IsWindowVisible($h)) { return $true }
  if ([MeowWinEnum]::IsIconic($h)) { return $true }
  $cloaked = 0
  [MeowWinEnum]::DwmGetWindowAttribute($h, 14, [ref]$cloaked, 4) | Out-Null
  if ($cloaked -ne 0) { return $true }
  $sb = New-Object System.Text.StringBuilder 512
  [MeowWinEnum]::GetWindowText($h, $sb, 512) | Out-Null
  $title = $sb.ToString()
  if ($title.Length -lt 1) { return $true }
  $r = New-Object MeowWinEnum+RECT
  [MeowWinEnum]::GetWindowRect($h, [ref]$r) | Out-Null
  $w = $r.R - $r.L; $hh = $r.B - $r.T
  if ($w -lt 120 -or $hh -lt 80) { return $true }
  [void]$out.Add(@{ t = $title; x = $r.L; y = $r.T; w = $w; h = $hh })
  return $true
}
[MeowWinEnum]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
$out | ConvertTo-Json -Compress -Depth 3
`.trim();

// parse the PowerShell JSON output (ConvertTo-Json emits a bare object for 1 item)
export function parseWindowsJson(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const s = raw.trim();
  if (!s.startsWith('{') && !s.startsWith('[')) return [];
  let v;
  try { v = JSON.parse(s); } catch { return []; }
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .filter(w => w && Number.isFinite(w.x) && Number.isFinite(w.y) &&
                 Number.isFinite(w.w) && Number.isFinite(w.h) && w.w > 0 && w.h > 0)
    .map(w => ({ title: String(w.t ?? ''), x: w.x, y: w.y, w: w.w, h: w.h }));
}

// turn raw windows into platform candidates for the brain
export function toPlatforms(list, opts = {}) {
  const exclude = opts.excludeRe ||
    /meowcat|program manager|windows (input|shell experience|default lockscreen)|nvidia|geforce|msi afterburner|notification center|nexus/i;
  const minW = opts.minW ?? 150, minH = opts.minH ?? 100;
  const max = opts.max ?? 24;
  return (list || [])
    .filter(w => w.w >= minW && w.h >= minH && !exclude.test(w.title))
    .sort((a, b) => (b.w * b.h) - (a.w * a.h))
    .slice(0, max);
}

export function createWindowScanner(opts = {}) {
  const spawnFn = opts.spawnFn || null;   // main.js passes child_process.spawn
  const intervalMs = opts.intervalMs ?? 2200;
  const onResult = opts.onResult || (() => {});
  const command = opts.command || 'powershell.exe';
  let timer = null, busy = false, lastSig = '';

  function scanOnce() {
    return new Promise(resolve => {
      if (!spawnFn) { resolve(null); return; }
      let p;
      try {
        p = spawnFn(command,
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch { resolve(null); return; }
      let out = '';
      const kill = setTimeout(() => { try { p.kill(); } catch {} }, 6000);
      p.stdout.on('data', d => { out += d; });
      p.on('error', () => { clearTimeout(kill); resolve(null); });
      p.on('close', () => { clearTimeout(kill); resolve(out); });
    });
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const out = await scanOnce();
      if (out == null) return;
      const plats = toPlatforms(parseWindowsJson(out));
      const sig = JSON.stringify(plats);
      if (sig !== lastSig) { lastSig = sig; onResult(plats); }
    } catch { /* never crash the app over a scan */ }
    finally { busy = false; }
  }

  return {
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
      if (timer.unref) timer.unref();
    },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
    get running() { return !!timer; },
    scanNow: tick,
  };
}
