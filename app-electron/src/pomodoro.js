// pomodoro.js — pure focus-timer state machine for the Pomodoro companion.
// main.js drives it with tick(now); the cat reacts to enter/complete events.

'use strict';

export const FOCUS_MS = 25 * 60_000;
export const BREAK_MS = 5 * 60_000;

export function createPomodoro(opts = {}) {
  const focusMs = opts.focusMs ?? FOCUS_MS;
  const breakMs = opts.breakMs ?? BREAK_MS;
  const nowFn = opts.now || null;
  let mode = 'idle';            // idle | focus | break
  let startedAt = 0;
  let endsAt = 0;
  let completedFocus = 0;       // finished focus rounds this session

  const nowNow = () => (nowFn ? nowFn() : Date.now());

  return {
    get mode() { return mode; },
    get remaining() {
      if (mode === 'idle') return 0;
      return Math.max(0, endsAt - nowNow());
    },
    get completedFocus() { return completedFocus; },
    start(kind = 'focus', now = nowNow()) {
      const dur = kind === 'break' ? breakMs : focusMs;
      mode = kind === 'break' ? 'break' : 'focus';
      startedAt = now;
      endsAt = now + dur;
      return { mode, endsAt };
    },
    stop() { mode = 'idle'; endsAt = 0; return mode; },
    // returns 'focus-done' | 'break-done' | null
    tick(now = nowNow()) {
      if (mode === 'idle' || now < endsAt) return null;
      const finished = mode;
      if (finished === 'focus') { completedFocus++; mode = 'break'; endsAt = now + breakMs; }
      else { mode = 'idle'; endsAt = 0; }
      return finished === 'focus' ? 'focus-done' : 'break-done';
    },
    snapshot(now = nowNow()) {
      return {
        mode,
        remaining: mode === 'idle' ? 0 : Math.max(0, endsAt - now),
        completedFocus,
        endsAt,
        totalMs: mode === 'focus' ? focusMs : breakMs,
      };
    },
  };
}

// label like 24:59 for the settings UI / tray tooltip
export function fmtRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
