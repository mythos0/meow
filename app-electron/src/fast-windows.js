// fast-windows.js — warm window pool so Settings/Reminders open instantly.
// Windows are created hidden at startup; "open" is a show()+focus() on an
// already-loaded page. Close hides (app keeps them warm) unless quitting.

'use strict';

export function createFastWindows({ factory } = {}) {
  const pool = new Map();

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
          if (!w.__allowClose) { e.preventDefault(); w.hide(); }
        });
      } catch { /* fake windows in tests may lack .on */ }
      pool.set(name, w);
    }
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
      if (w && !(typeof w.isDestroyed === 'function' && w.isDestroyed())) w.hide();
    },
    closeAll() {
      for (const [, w] of pool) {
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
