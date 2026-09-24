// typing-hook-child.cjs — v3.11: the global keyboard hook lives HERE, in an
// Electron utilityProcess, not in the main process.
//
// Why: uiohook-napi is native code running a low-level keyboard hook. On real
// Windows machines a hard abort inside that thread (secure desktop, UAC
// prompt, RDP reconnect, input-driver quirks) kills the ENTIRE Electron
// process instantly — uncatchable from JS. That was the last path that could
// make the cat "auto quit". In this child, the same crash destroys only a
// disposable helper: main sees 'exit', respawns with backoff, the cat keeps
// living. This file is CommonJS on purpose — utilityProcess.fork loads CJS.

'use strict';

let started = false;

function post(msg) {
  try { process.parentPort.postMessage(msg); } catch { /* parent gone */ }
}

async function main() {
  const mod = await import('uiohook-napi');   // native module — may fail headless
  mod.keyboard.addListener('keydown', () => post({ type: 'key' }));
  mod.keyboard.start();
  started = true;
  post({ type: 'ready' });
}

main().catch(err => {
  // No native hook available (dev Linux without X11 libs, sandbox, ...) —
  // report and exit quietly; the manager's backoff handles retries.
  post({ type: 'hook-unavailable', error: String(err && err.message || err) });
  if (!started) process.exit(0);
});
