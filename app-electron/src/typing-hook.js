// typing-hook.js — v3.11 manager for the isolated keyboard-hook utility
// process. Pure Node semantics (the Electron-specific fork is injected via
// spawnFn) so the state machine is unit-testable.
//
// Contract:
//   start()   — want the hook running; spawn the child, respawn on death
//               with exponential-ish backoff (2s, 5s, 15s, then 30s steady)
//   stop()    — want it gone; kill the child, cancel any pending respawn
//   onKey()   — fired for every {type:'key'} line the child sends
//   onDown()  — fired whenever the child dies unexpectedly (diagnostics)
//
// The manager NEVER throws: a broken hook degrades the typing-pounce
// feature, never the app.

'use strict';

export function createTypingHookManager({ spawnFn, onKey = () => {}, onDown = () => {} } = {}) {
  let child = null;          // live child handle (Electron utilityProcess-like)
  let wanted = false;        // start() called and stop() not yet
  let respawnTimer = null;
  let attempt = 0;
  const BACKOFFS = [2000, 5000, 15000, 30000];

  function clearTimer() {
    if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
  }

  function killChild() {
    if (!child) return;
    try { child.kill(); } catch { /* already gone */ }
    child = null;
  }

  function spawnChild() {
    if (!wanted || child) return;
    try {
      const c = spawnFn();
      if (!c || typeof c.on !== 'function') { child = null; scheduleRespawn(); return; }
      child = c;
      c.on('message', msg => {
        if (msg && msg.type === 'key') {
          try { onKey(); } catch { /* meter never breaks us */ }
        }
        // 'ready' / 'hook-unavailable' are informational
      });
      c.on('exit', () => {
        const wasLive = child === c;
        child = null;
        if (!wanted) return;                 // intentional stop — stay dead
        if (wasLive) { try { onDown(); } catch {} }
        scheduleRespawn();
      });
    } catch {
      child = null;
      scheduleRespawn();                     // fork failed (packaging, no electron API) — retry gently
    }
  }

  function scheduleRespawn() {
    if (!wanted || respawnTimer) return;
    const delay = BACKOFFS[Math.min(attempt, BACKOFFS.length - 1)];
    attempt++;
    respawnTimer = setTimeout(() => {
      respawnTimer = null;
      spawnChild();
    }, delay);
    if (typeof respawnTimer.unref === 'function') respawnTimer.unref();
  }

  return {
    start() {
      if (wanted) return;
      wanted = true;
      attempt = 0;
      clearTimer();
      spawnChild();
    },
    stop() {
      wanted = false;
      clearTimer();
      killChild();
    },
    get running() { return wanted && !!child; },
  };
}
