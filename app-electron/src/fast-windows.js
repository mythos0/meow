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
      // intercept the close: hide instead of destroy to keep the warm pool
      w.__allowClose = false;
      try {
        w.on('close', e => {
          if (!w.__allowClose) { e.preventDefault(); w.hide(); armIdleDestroy(w, name); }
        });
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
    isAlive(name) {
      const w = pool.get(name);
      return !!w && !(typeof w.isDestroyed === 'function' && w.isDestroyed());
    },
  };
}
