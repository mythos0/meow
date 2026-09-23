// system-reactions.js — pure, testable decision logic for the v3.6
// "living on your machine" feature pack. No Electron/DOM/timer deps:
// every function takes the world as an argument and returns a decision.
// main.js feeds samples in; this module decides what the cat should feel.

'use strict';

// ---------------------------------------------------------------- CPU/RAM spikes
// Two consecutive hot samples trigger a "stress" pulse; a cooldown keeps the
// cat from living in permanent panic on a busy machine.
export function createSpikeDetector(opts = {}) {
  const cpuAt = opts.cpuAt ?? 85;          // percent
  const ramAt = opts.ramAt ?? 90;          // percent
  const needHot = opts.needHot ?? 2;       // consecutive hot samples
  const cooldownMs = opts.cooldownMs ?? 90_000;
  let hot = 0, lastFire = 0;
  return {
    push({ cpu, ram, now = Date.now() }) {
      const isHot = (Number.isFinite(cpu) && cpu >= cpuAt) ||
                    (Number.isFinite(ram) && ram >= ramAt);
      hot = isHot ? hot + 1 : 0;
      if (hot >= needHot) {
        if (now - lastFire >= cooldownMs) { lastFire = now; hot = 0; return 'stress'; }
        hot = needHot;   // stay saturated: first hot sample after cooldown fires
        return null;
      }
      return null;
    },
    reset() { hot = 0; lastFire = 0; },
  };
}

// ---------------------------------------------------------------- battery
// level: 0..1, charging: bool → the cat curls up "to save energy"
export function batteryCrisis(level, charging, opts = {}) {
  const at = opts.at ?? 0.2;
  if (level == null || !Number.isFinite(level)) return false;
  return !charging && level <= at;
}

// ---------------------------------------------------------------- time of day
// night: yawns & naps bias; day: playful bias. hour is 0..23 (local).
export function timeBias(hour, opts = {}) {
  const nightStart = opts.nightStart ?? 22;
  const nightEnd = opts.nightEnd ?? 7;
  const h = ((hour % 24) + 24) % 24;
  const night = nightStart > nightEnd
    ? (h >= nightStart || h < nightEnd)
    : (h >= nightStart && h < nightEnd);
  return night ? 'night' : 'day';
}

// ---------------------------------------------------------------- typing meter
// Rolling keystroke window -> WPM. A fast burst makes the cat pounce at the
// keyboard; a long idle gap makes it fall asleep near it instead.
export function createTypingMeter(opts = {}) {
  const windowMs = opts.windowMs ?? 5_000;      // WPM window
  const pounceAt = opts.pounceAt ?? 62;         // WPM that excites the cat
  const pounceCooldownMs = opts.pounceCooldownMs ?? 45_000;
  const napAfterMs = opts.napAfterMs ?? 12 * 60_000;
  const napCooldownMs = opts.napCooldownMs ?? 30 * 60_000;
  let keys = [];                 // timestamps of recent keystrokes
  let lastKey = 0, lastPounce = -Infinity, lastNap = -Infinity;
  return {
    key(now = Date.now()) {
      keys.push(now);
      if (keys.length > 400) keys = keys.slice(-200);
      lastKey = now;
    },
    wpm(now = Date.now()) {
      // keystrokes in window, /5 chars per word, scaled to a minute
      keys = keys.filter(t => now - t <= windowMs);
      return Math.round((keys.length / 5) * (60_000 / windowMs));
    },
    // called periodically by main; returns 'pounce' | 'nap' | null
    tick(now = Date.now()) {
      const idleFor = lastKey ? now - lastKey : Infinity;
      if (idleFor > napAfterMs && now - lastNap >= napCooldownMs) {
        lastNap = now; keys = [];
        return 'nap';
      }
      if (this.wpm(now) >= pounceAt && now - lastPounce >= pounceCooldownMs) {
        lastPounce = now; keys = [];
        return 'pounce';
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------- idle dance party
// Long inactivity -> a few extra cats show up and party (screensaver mode).
export function shouldDanceParty(idleSec, opts = {}) {
  const after = opts.afterSec ?? 600;           // 10 idle minutes
  const oncePer = opts.oncePerSec ?? 1800;      // don't loop it all night
  return Number.isFinite(idleSec) && idleSec >= after &&
         (opts.lastPartyAgeSec == null || opts.lastPartyAgeSec >= oncePer);
}

// v3.10: fullscreen auto-hide and call-app detection were REMOVED entirely.
// The cat never hides itself — only an explicit user action (tray / hotkey)
// may hide it, and only the explicit Quit may stop its process.

// ---------------------------------------------------------------- new-window diff
// Platform lists from the window scanner — which windows just appeared?
export function diffWindows(previous, current, opts = {}) {
  const minW = opts.minW ?? 220, minH = opts.minH ?? 140;  // real apps, not popups
  const key = w => `${w.x}|${w.y}|${w.w}|${w.h}`;
  const oldSet = new Set((previous || []).map(key));
  return (current || []).filter(w => w.w >= minW && w.h >= minH && !oldSet.has(key(w)));
}

// ---------------------------------------------------------------- processes
// Editors & IDEs: the cat curls up on top of them while you code.
// (v3.10: call/record-app detection was removed — the cat ignores your calls.)
export const EDITOR_APP_RE = /^(Code|code|notepad\+\+|notepad|sublime_text|idea|idea64|pycharm|webstorm|goland|clion|rider|vim|nvim|emacs|devenv|studio64|zed|cursor|windsurf)(\.exe)?$/i;

export function findEditorApp(names) {
  for (const n of names || []) if (EDITOR_APP_RE.test(n)) return n;
  return null;
}

// ---------------------------------------------------------------- music (SMTC)
// The Windows watcher child prints one JSON line per change:
//   {"status":"playing","title":"...","artist":"..."}
// Linux fallback prints the same shape (playerctl). Parse tolerantly.
export function parseMusicLine(raw) {
  if (!raw) return null;
  const line = String(raw).trim().split(/\r?\n/).filter(Boolean).pop();
  if (!line) return null;
  try {
    const v = JSON.parse(line);
    if (!v || typeof v !== 'object') return null;
    const st = String(v.status || '').toLowerCase();
    return {
      status: st.includes('playing') ? 'playing' : st.includes('paused') ? 'paused' : 'stopped',
      title: typeof v.title === 'string' ? v.title : '',
      artist: typeof v.artist === 'string' ? v.artist : '',
    };
  } catch { return null; }
}

// what should the cat do about music? 'bop' | 'excited' | 'stop' | null
export function musicReaction(prev, next) {
  if (!next) return null;
  const wasPlaying = prev?.status === 'playing';
  const isPlaying = next.status === 'playing';
  const trackChanged = next.title !== prev?.title || next.artist !== prev?.artist;
  if (isPlaying && !wasPlaying) return 'bop';
  if (isPlaying && trackChanged) return 'excited';
  if (!isPlaying && wasPlaying) return 'stop';
  return null;
}

// ---------------------------------------------------------------- status file
// Build/test watcher: green content → celebrate, red content → mope.
export function parseStatusFile(text) {
  const t = String(text || '').slice(0, 4096).toLowerCase();
  if (!t.trim()) return null;
  const bad = /\b(fail|failed|failing|error|errors|red|fuchsia)\b|✗|exit code [1-9]/.test(t);
  const good = /\b(pass|passed|ok|okay|success|succeed|green|done|✓)\b/.test(t);
  if (bad) return 'bad';
  if (good) return 'good';
  return null;
}
