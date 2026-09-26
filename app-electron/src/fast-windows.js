// fast-windows.js — warm window pool so Settings/Reminders open instantly.
// Windows are created hidden at startup; "open" is a show()+focus() on an
// already-loaded page. Close hides (app keeps them warm) unless quitting.
// v3.4: a warm window self-destroys after 5 idle minutes hidden — the hidden
// settings renderer used to stay resident (~45MB + a process) forever; the
// pool recreates it on demand (~150ms) if the user comes back later.

'use strict';

export function createFastWindows({ factory } = {}) {
  const pool = new Map();
  // v3.7: 2.5 min instead of 5 — a hidden warm settings renderer is ~45MB +
  // a process; 2.5 min still makes a second open feel instant while halving
  // the idle footprint. MEOW_WARM_IDLE_MS still overrides (tests set 3000).
  const IDLE_MS = Number(process.env.MEOW_WARM_IDLE_MS) || 2.5 * 60 * 1000;

  function armIdleDestroy(w, name) {
    clearTimeout(w.__idleTimer);
    if (!(IDLE_MS > 0)) return;
    w.__idleTimer = setTimeout(() => {
      const cur = pool.get(name);
      if (cur !== w) return;                       // replaced meanwhile
      pool.delete(name);
      w.__allowClose = true;
      try { w.close(); } catch { /* ignore */ }
    }, IDLE_MS);
    if (typeof w.__idleTimer.unref === 'function') w.__idleTimer.unref();
  }

  function get(name) {
    let w = pool.get(name);
    if (w && typeof w.isDestroyed === 'function' && w.isDestroyed()) {
      pool.delete(name);
      w = null;
    }
    if (!w) {
      if (!factory || typeof factory[name] !== 'function') {
        throw new Error('no factory for window: ' + name);
      }
      w = factory[name]();
      // v3.18 process diet: intercept the close and DESTROY — a hidden warm
      // renderer is a whole process + ~45MB the user explicitly asked to
      // reclaim. The pool recreates the window on demand (~150ms).
      // v3.20 Windows hardening: the old interceptor re-called w.close()
      // SYNCHRONOUSLY inside the 'close' event — on win32 that re-entrant
      // native close is flaky (the window is mid-destroy) and can wedge the
      // whole app's window chain. The re-close is now deferred off the event
      // tick, the canonical Electron pattern for close-inside-close.
      w.__allowClose = false;
      try {
        w.on('close', e => {
          if (!w.__allowClose) {
            e.preventDefault();
            w.__allowClose = true;
            pool.delete(name);
            setTimeout(() => {
              try { if (!(typeof w.isDestroyed === 'function' && w.isDestroyed())) w.close(); }
              catch { /* already dying */ }
            }, 0);
          }
        });
        w.on('closed', () => { if (pool.get(name) === w) pool.delete(name); });
      } catch { /* fake windows in tests may lack .on */ }
      pool.set(name, w);
    }
    clearTimeout(w.__idleTimer);                   // in use again — not idle
    return w;
  }

  return {
    get,
    warm(...names) {
      for (const n of names) {
        try {
          const w = get(n);
          if (typeof w.hide === 'function') w.hide();
        } catch { /* factory may fail headless — non-fatal */ }
      }
    },
    show(name) {
      const w = get(name);
      w.show();
      if (typeof w.focus === 'function') w.focus();
      return w;
    },
    hide(name) {
      const w = pool.get(name);
      if (w && !(typeof w.isDestroyed === 'function' && w.isDestroyed())) {
        w.hide();
        armIdleDestroy(w, name);
      }
    },
    closeAll() {
      for (const [, w] of pool) {
        clearTimeout(w.__idleTimer);
        if (typeof w.isDestroyed === 'function' && w.isDestroyed()) continue;
        w.__allowClose = true;
        try { w.close(); } catch { /* ignore */ }
      }
    },
    // v3.20: close ONE named pool window. The 'close-window' IPC used to call
    // closeAll() for ANY renderer's close request — an indiscriminate teardown
    // path with no place in a single-window-per-name app. Closing the Cat
    // Store must never reach any other window.
    close(name) {
      const w = pool.get(name);
      if (!w) return false;
      pool.delete(name);   // the window is going away — the pool drops it now
      clearTimeout(w.__idleTimer);
      if (typeof w.isDestroyed === 'function' && w.isDestroyed()) return false;
      w.__allowClose = true;
      try { w.close(); } catch { /* ignore */ }
      return true;
    },
    isAlive(name) {
      const w = pool.get(name);
      return !!w && !(typeof w.isDestroyed === 'function' && w.isDestroyed());
    },
  };
}
