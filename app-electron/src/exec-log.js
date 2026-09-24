// exec-log.js — v3.14 the hidden "execution log": a real-time, ring-buffered
// record of what the cat (and its main process) is actually executing.
//
// Pure module, no DOM/Electron deps — used by BOTH the main process (app,
// window, IPC, tray, reminder, quit-gate events) and the cat renderer
// (brain state transitions, hunts, swats, drags, sounds). Entries are real:
// they are only ever appended by code that genuinely ran.
//
// Entry shape: { seq, ts, src, tag, msg, data }
//   seq  — monotonic within this buffer
//   ts   — Date.now()
//   src  — 'main' | 'cat' | 'companion' | 'sys'
//   tag  — short machine token, e.g. 'action', 'hunt', 'zone', 'window'
//   msg  — human-readable one-liner
//   data — optional small JSON-able detail object

'use strict';

export const EXEC_LOG_CAP_DEFAULT = 600;
export const EXEC_LOG_SRC = ['main', 'cat', 'companion', 'sys'];
export const EXEC_LOG_MAX_DATA = 2048;      // serialized cap for the data blob
export const EXEC_LOG_MAX_MSG = 240;

// validate + normalize an inbound entry (renderer-supplied data is untrusted;
// nothing here may throw or grow unbounded)
export function normalizeEntry(input, seq, now = Date.now()) {
  if (!input || typeof input !== 'object') return null;
  const src = EXEC_LOG_SRC.includes(input.src) ? input.src : 'sys';
  const tag = String(input.tag || 'misc').slice(0, 32).replace(/[^\w.:-]/g, '_');
  let msg = String(input.msg == null ? '' : input.msg).slice(0, EXEC_LOG_MAX_MSG);
  if (!msg) return null;
  let data = null;
  if (input.data != null) {
    try {
      const s = JSON.stringify(input.data);
      if (s && s.length <= EXEC_LOG_MAX_DATA) data = JSON.parse(s);
      else data = { truncated: true };
    } catch { data = { unserializable: true }; }
  }
  const ts = Number.isFinite(input.ts) ? input.ts : now;
  return { seq, ts, src, tag, msg, data };
}

export function createExecLog(opts = {}) {
  const cap = Number.isFinite(opts.cap) && opts.cap > 10 ? Math.floor(opts.cap) : EXEC_LOG_CAP_DEFAULT;
  const buf = [];
  let seq = 0;
  const subs = new Set();

  return {
    get size() { return buf.length; },
    push(input, now = Date.now()) {
      const entry = normalizeEntry(input, ++seq, now);
      if (!entry) return null;
      buf.push(entry);
      if (buf.length > cap) buf.splice(0, buf.length - cap);   // ring behavior
      for (const fn of subs) {
        try { fn(entry); } catch { /* a bad subscriber never breaks the log */ }
      }
      return entry;
    },
    all() { return buf.slice(); },
    since(seqAfter) {
      const s = Number.isFinite(seqAfter) ? seqAfter : 0;
      return buf.filter(e => e.seq > s);
    },
    clear() { buf.length = 0; },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
