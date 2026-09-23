// topmost.js — always-on-top enforcer. Pure-ish: works with any window-like object.

'use strict';

export function createTopmostEnforcer(win, opts = {}) {
  const level = opts.level || 'screen-saver';   // beats most fullscreen apps on Windows
  const intervalMs = opts.intervalMs ?? 3000;
  let timer = null;
  let count = 0;

  function enforce() {
    try {
      // v3.7: skip the native poke when the flag is already set — re-calling
      // setAlwaysOnTop every few seconds raises pointless window-manager churn
      if (typeof win.isAlwaysOnTop === 'function' && win.isAlwaysOnTop()) return;
      win.setAlwaysOnTop(true, level); count++;
    } catch { /* window gone */ }
  }

  return {
    start() {
      if (timer) return;
      enforce();
      try {
        win.on('show', enforce);
        win.on('restore', enforce);
        win.on('focus', enforce);
      } catch { /* fake window in tests may lack .on */ }
      timer = setInterval(enforce, intervalMs);
      if (timer.unref) timer.unref();
    },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
    get enforceCount() { return count; },
    get running() { return !!timer; },
  };
}
