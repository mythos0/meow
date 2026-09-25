// voice.js — v3.15 pure voice-command parser. No DOM/Electron/PowerShell
// deps: given whatever the recognizer heard, decide what the cat should do.
//
// The listener (voice-listener.js) streams raw phrases from the Windows
// SAPI engine. This module turns a phrase into a command:
//
//   "hey cat play music ghum kariya nilo sokhi" → { cmd:'play_music', query:'ghum kariya nilo sokhi' }
//   "hey cat pause"                             → { cmd:'pause' }
//   "volume down"                               → { cmd:'volume_down' }   (bare control is fine)
//   "the cat sat on the mat"                    → null                    (never a command)
//
// Music controls are accepted WITHOUT the wake word (the recognizer grammar
// only fires on real command shapes), but a bare "play <query>" search only
// runs when the wake word is present — otherwise everyday talk ("I played
// football") would open YouTube. With the wake word ("hey cat play X")
// anything after "play" is the search query, exactly the flow the user
// described: hey cat + play music + <title> → Brave → youtube.com → search →
// play the first result.

'use strict';

export const WAKE_WORDS = ['hey cat', 'hey kitty', 'hey kitten', 'ok cat', 'okay cat', 'hi cat', 'yo cat'];

export const VOICE_COMMANDS = [
  'play music …', 'pause (the music)', 'resume (the music)', 'stop (the music)',
  'next song', 'previous song', 'volume up / louder', 'volume down / quieter',
  'mute', 'unmute', 'stop listening',
];

export function normalizePhrase(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]{}\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// v3.17 ENGINE GATE — both engines run in parallel; while the web engine is
// verifiably listening, offline (SAPI) phrases are ignored so the coarser
// recognizer can only add mangled duplicates. Pure + exported for unit tests.
export function acceptEnginePhrase(engine, webHealthy) {
  return engine !== 'sapi' || !webHealthy;
}

// Levenshtein edit distance, early-exit when the gap is hopeless.
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// v3.16 FUZZY WAKE: real speech engines mangle "hey cat" into "hey kat",
// "hay cat", "a cat", "eh cat"… every day. The exact-prefix match above
// never fires then and the user hears silence — the #1 "voice not working"
// report. So: when the leading 2–3 words are within 2 edits of a wake word
// AND the remainder actually parses as a command, treat the wake as heard.
// Noise like "the cat sat on the mat" fuzzy-wakes ("the cat" ≈ "hey cat")
// but "sat on the mat" is no command — it still returns null. Inertness is
// decided by the REMAINDER, not by how the wake sounded.
function fuzzyWake(text) {
  const words = text.split(' ');
  for (let take = 1; take <= Math.min(3, words.length); take++) {
    const head = words.slice(0, take).join(' ');
    for (const w of WAKE_WORDS) {
      if (w.split(' ').length !== take) continue;
      if (editDistance(head, w) <= 2) return { text: words.slice(take).join(' ').trim(), woke: true, fuzzy: true };
    }
  }
  return null;
}

function stripWake(text) {
  for (const w of WAKE_WORDS) {
    if (text === w) return { text: '', woke: true };
    if (text.startsWith(w + ' ')) return { text: text.slice(w.length).trim(), woke: true };
  }
  const fz = fuzzyWake(text);
  if (fz) return fz;
  return { text, woke: false };
}

const MUSIC_QUERY_RE = /^(?:play|put on|start playing|start)(?:\s+(?:some|the))?(?:\s+(?:music|song|songs|video|track))?(?:\s+(?:on\s+)?youtube)?(?:\s+(?:called|named|for))?\s*(.*)$/;

export function parseVoiceCommand(raw) {
  const norm = normalizePhrase(raw);
  if (!norm) return null;
  const { text, woke, fuzzy } = stripWake(norm);
  const rest = text.trim();
  if (!rest) return woke ? { cmd: 'wake_only', query: '', woke, text: norm } : null;

  // ---- stop listening (checked before "stop the music") ----
  if (/^(?:stop listening|stop the cat|stop the cat listening|thats all|that s all|go to sleep)$/.test(rest)) {
    return { cmd: 'stop_listening', query: '', woke, text: norm };
  }

  // ---- play music: "play music <query>" / "play <query>" / "put on <query>" ----
  // A bare search (no wake) only fires when the phrase names the music
  // itself: "play music …", "play song …" — plain "play football" alone
  // stays inert without the wake word.
  const pm = rest.match(MUSIC_QUERY_RE);
  if (pm) {
    // "put on"/"start playing" are unambiguous music requests; a bare
    // "play X" needs the music keyword or the wake word
    const unambiguous = /^(?:put on|start playing)\b/.test(rest);
    const looksMusic = unambiguous ||
      (/\b(?:music|song|songs|video|track|youtube)\b/.test(rest) || woke);
    const query = (pm[1] || '').replace(/\b(?:on youtube|on the youtube)\b/g, '').trim();
    if (looksMusic && query) {
      return { cmd: 'play_music', query: query.slice(0, 120), woke, text: norm };
    }
  }

  // ---- transport + volume controls (bare is fine) ----
  if (/^(?:pause|hold on|wait)(?:\s+the)?(?:\s+(?:music|song|video|playing))?$/.test(rest)) return { cmd: 'pause', query: '', woke, text: norm };
  if (/^(?:resume|continue|unpause|keep going|go on)(?:\s+the)?(?:\s+(?:music|song|video|playing))?$/.test(rest)) return { cmd: 'resume', query: '', woke, text: norm };
  if (/^(?:stop)(?:\s+the)?(?:\s+(?:music|song|video|playing))?$/.test(rest)) return { cmd: 'stop_music', query: '', woke, text: norm };
  if (/^(?:next|skip)(?:\s+(?:song|track|one|it|this))?$/.test(rest) || /^play the next (?:song|track|one)$/.test(rest)) return { cmd: 'next', query: '', woke, text: norm };
  if (/^(?:previous|prev|go back|back)(?:\s+(?:song|track|one|it|this))?$/.test(rest) || /^play the previous (?:song|track|one)$/.test(rest)) return { cmd: 'previous', query: '', woke, text: norm };
  if (/^(?:volume up|turn (?:it|the volume|the music|this) up|louder|louder please|increase the volume)$/.test(rest)) return { cmd: 'volume_up', query: '', woke, text: norm };
  if (/^(?:volume down|turn (?:it|the volume|the music|this) down|quieter|softer|decrease the volume)$/.test(rest)) return { cmd: 'volume_down', query: '', woke, text: norm };
  if (/^mute$/.test(rest) || /^(?:mute|silence)(?:\s+the)?(?:\s+(?:volume|music|sound))?$/.test(rest)) return { cmd: 'mute', query: '', woke, text: norm };
  if (/^unmute$/.test(rest) || /^unmute(?:\s+the)?(?:\s+(?:volume|music|sound))?$/.test(rest)) return { cmd: 'unmute', query: '', woke, text: norm };

  // A fuzzy wake ("hey kat", "a cat …") must land on a REAL command — a
  // mangled wake followed by chatter is just chatter, so it stays null.
  if (fuzzy) return null;
  return woke ? { cmd: 'unknown', query: '', woke, text: norm } : null;
}
