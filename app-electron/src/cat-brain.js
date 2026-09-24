// cat-brain.js — pure state machine + movement brain. No DOM/Electron deps.
// Deterministic when seeded: tick(dt) is the only mutator.
// v3.2: open-field roaming REMOVED (user request) — the cat strolls along the
// ground edge-to-edge, jumps onto nearby window tops, strolls there, hops to
// the next window or drops back. Pandas waddle and roll forward as they roll.
// v3.6: living-on-your-machine pack — stalk/bop/mope/nuzzle/investigate/sniff/
// curl states, time-of-day bias, stress mode, no-walk zones.

'use strict';

import { resolveMove, filterPlatforms as _fp, rectsIntersect } from './no-walk.js';
const filterPlatforms = _fp;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ACTIONS = [
  'walk', 'idle', 'sit', 'sleep', 'scratch', 'dance', 'run', 'eat',
  'stretch', 'groom', 'pounce', 'knead', 'loaf', 'yawn', 'startle',
  'waddle', 'bamboo', 'roll',
  // v3.5 funny pack
  'sneeze', 'hairball', 'zoomies', 'laser',
  // v3.6 living-on-your-machine pack
  'stalk', 'bop', 'mope', 'nuzzle', 'investigate', 'sniff', 'curl',
  // v3.14 the real-cat butterfly catch: rears onto the hind legs and swats
  // up with the front paws (never randomly selected — hunt-driven only)
  'rear',
];

// v3.8: is platform `b` (from the newest scan) the same physical window as
// `a` (the one the cat stands on)? Pure geometry — the window may have been
// dragged/resized between scans, so we compare top-border overlap instead of
// object identity. Returns the best candidate or null.
export function matchPlatform(a, candidates, opts = {}) {
  const maxDy = opts.maxDy ?? 260;      // border drifted further than this => treat as gone
  let best = null, bestScore = 0;
  for (const b of candidates || []) {
    if (Math.abs(b.y - a.y) > maxDy) continue;
    const ovL = Math.max(a.x, b.x);
    const ovR = Math.min(a.x + a.w, b.x + b.w);
    const overlap = Math.max(0, ovR - ovL);
    if (overlap <= 0) continue;
    const score = overlap / Math.min(a.w, b.w);   // ≥1 when one span contains the other
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return bestScore >= (opts.minOverlap ?? 0.5) ? best : null;
}

// emote shown when entering a state
export const EMOTE_ON = {
  startle: 'exclaim', pounce: 'exclaim', dance: 'note', sleep: 'zzz',
  yawn: 'zzz', groom: 'heart', bamboo: 'heart', eat: 'fish', roll: 'laugh',
  stretch: 'star', knead: 'love',
  // v3.5 funny pack
  zoomies: 'exclaim', hairball: 'sweat', loaf: 'bread',
  // v3.6
  bop: 'note', investigate: 'question', sniff: 'question', nuzzle: 'heart',
  curl: 'zzz', mope: 'sad', stalk: null, rear: null,
};

const CAT_WEIGHTS = {
  walk: 20, idle: 15, sit: 6, run: 6, scratch: 5, dance: 4, eat: 3, sleep: 3, jump: 7,
  stretch: 5, groom: 5, pounce: 5, knead: 3, loaf: 4, yawn: 3, startle: 2,
  // v3.5 funny pack — rare but delightful gags
  sneeze: 2, hairball: 2, zoomies: 2,
};
// v3.6 mood multipliers: time-of-day bias + system-stress panic.
export const BIAS_MULT = {
  night: { sleep: 3, yawn: 4, loaf: 2, run: 0.3, zoomies: 0.25, dance: 0.4, pounce: 0.6, walk: 0.8 },
  day: { pounce: 1.3, zoomies: 1.3, run: 1.2 },
};
export const STRESS_MULT = { run: 3, startle: 5, zoomies: 2, walk: 1.4, dance: 0.2, groom: 0.3 };

const PANDA_WEIGHTS = {
  waddle: 24, idle: 13, sit: 6, bamboo: 10, roll: 8, sleep: 4, dance: 3,
  loaf: 5, yawn: 3, startle: 2, happy: 4,
  // v3.5: pandas sneeze too, and get the post-snack zoomies
  sneeze: 2, hairball: 0, zoomies: 2,
};

export class CatBrain {
  constructor(opts = {}) {
    this.bounds = opts.bounds || { x: 0, y: 0, w: 1920, h: 1080 };
    this.groundY = opts.groundY ?? this.bounds.y + this.bounds.h - 40;
    this.speed = opts.speed ?? 55;          // px/s walk
    this.runSpeed = opts.runSpeed ?? 150;   // px/s run
    this.rand = opts.rand || Math.random;
    this.onEvent = opts.onEvent || (() => {});
    this.breed = opts.breed || 'grey_tabby';
    this.maxX = opts.maxX ?? this.bounds.x + this.bounds.w;
    this.minX = opts.minX ?? this.bounds.x;

    this.t = 0;             // animation clock
    this.x = opts.x ?? this.bounds.x + this.bounds.w / 2;
    this.baseY = this.groundY;  // feet baseline (ground or window top)
    this.jumpY = 0;
    this.dir = this.rand() < 0.5 ? -1 : 1;
    this.state = 'idle';
    this.stateT = 0;        // time in current state
    this.stateDur = 1.2;
    this.jumpP = 0;
    this.idleStreak = 0;
    this.sleepy = false;

    // window-top platforms (title bars of visible windows)
    this.platforms = [];
    this.onPlatform = null;     // platform the cat currently stands on
    this._jump = null;          // { x0, x1, y0, y1, pl } during a directed jump
    this._platformCd = 0;       // seconds until next platform scan
    this.platformT = 0;         // time spent on current platform
    // v3.9 live platform tracking (see updateTrackedPlatform)
    this._trackMiss = 0;        // consecutive "window gone" reports from the tracker
    this._trackAlive = false;   // tracker currently confirming our platform

    // contextual emote: { kind, t0 }
    this.emote = null;

    // v3.5 laser-pointer toy (cat.html owns the dot, brain chases it)
    this.laser = null;          // { x, y } target while a laser chase is live
    this._laserAge = 0;         // seconds since laser chase started
    this._laserCd = 0;          // pounce cooldown inside a laser chase

    // action weights (tunable)
    this.weights = this.breed === 'panda' ? { ...PANDA_WEIGHTS } : { ...CAT_WEIGHTS };

    // ---- v3.6 living-on-your-machine state ----
    this.timeBiasMode = 'day';    // 'day' | 'night'
    this.stressUntil = 0;         // timestamp while a CPU/RAM scare lasts
    this.musicOn = false;         // music playing -> bop
    this.stalk = null;            // { x, y, kind } cursor/butterfly being stalked
    this.stalkBoost = 1;          // v3.13: creep-speed multiplier for butterfly hunts
    this._rearSwats = 0;          // v3.14: swats fired in the current rear-up
    this._inv = null;             // { x } new-window investigation target
    this._batteryLow = false;     // low battery -> curl up to save energy
    this._zones = [];             // no-walk zones (screen coords)
    this._scale = 1;
  }

  // ---------- v3.6 tuning API (called by cat.html via IPC events) ----------
  setScale(s) { if (Number.isFinite(s) && s > 0) this._scale = s; }
  // v3.14: proper event-handler registration. Callers used to "register" via
  // brain.onEvent(fn) — which CALLS the (no-op) property instead of setting
  // it, so no brain event ever reached the renderer. This method is the fix.
  setEventHandler(fn) { if (typeof fn === 'function') this.onEvent = fn; }
  setTimeBias(mode) { this.timeBiasMode = mode === 'night' ? 'night' : 'day'; }
  setStress(on, ms = 12000) {
    this.stressUntil = on ? this.t + ms / 1000 : 0;
    if (on) this._enter('startle', 0.7);   // immediate jump
    this.onEvent(on ? 'stress:on' : 'stress:off');
  }
  get stressed() { return this.stressUntil > this.t; }
  setMusic(on) {
    this.musicOn = !!on;
    if (on && !['bop', 'laser', 'pounce', 'stalk'].includes(this.state)) this._enter('bop', 3);
  }
  setBatteryLow(on) {
    this._batteryLow = !!on;
    if (on) this._enter('curl', 30 + this.rand() * 20);
    else if (this.state === 'curl') {
      // v3.6.1: plugged back in — wake up promptly instead of finishing the
      // full 30–50s nap ("ok, energy saved, back to chaos")
      this._enter('yawn', 2.4);
      this.onEvent('battery:restored');
    }
  }
  // v3.13: kind tags the prey — 'cursor' (default) or 'butterfly'. cat.html
  // gates the cursor-idle/busy handlers on the tag so a butterfly hunt cannot
  // be stolen mid-stalk by a stale cursor event.
  startStalk(x, y, kind = 'cursor') {
    // v3.6.1: stalking from a window top would walk off the edge and float —
    // ground-level behaviour only.
    if (this.onPlatform) return false;
    this.stalk = { x, y, kind: kind === 'butterfly' ? 'butterfly' : 'cursor' };
    this._stalkWig = 0;
    this.stalkBoost = 1;
    this._enter('stalk', 7);      // hard cap like the laser chase
    this.onEvent('stalk:start');
    return true;
  }
  moveStalk(x, y) { if (this.stalk) { this.stalk.x = x; this.stalk.y = y; } }
  stopStalk() {
    const had = !!this.stalk;
    this.stalk = null;
    if (had) this.onEvent('stalk:stop');
  }
  investigate(x) {
    // only curious-ish cats stop to sniff the new arrival
    if (!['walk', 'idle', 'sit', 'loaf', 'groom', 'investigate', 'sniff'].includes(this.state)) return false;
    // v3.6.1: investigating from a window top would float off the edge
    if (this.onPlatform) return false;
    this._inv = { x: Math.max(this.minX + 40, Math.min(this.maxX - 40, x)) };
    // enough time to actually walk there at the current speed (capped)
    const dist = Math.abs(this._inv.x - this.x);
    const dur = Math.min(14, 2.5 + (dist / Math.max(20, this.speed)) * 1.7);
    this._enter('investigate', dur);
    this.onEvent('investigate:start');
    return true;
  }
  curlUp() { this.setBatteryLow(true); }
  mopeNow() { this._enter('mope', 6 + this.rand() * 2); this.onEvent('mope'); }
  nuzzleNow(dir) {
    if (dir) this.dir = dir >= 0 ? 1 : -1;
    this._enter('nuzzle', 2.8);
    this.onEvent('nuzzle');
  }
  celebrate() {
    this._enter('happy', 2.6);
    this.emote = { kind: 'star', t0: this.t };
    this.onEvent('celebrate');
  }
  greet() {
    this._enter('happy', 2.2);
    this.emote = { kind: 'heart', t0: this.t };
    this.onEvent('greet');
  }
  setNoWalkZones(screenZones) {
    this._zones = Array.isArray(screenZones) ? screenZones.filter(z => z && Number.isFinite(z.x)) : [];
  }

  // v3.6: "go curl up on that window" — used for editor nap reactions.
  // rect: {x,y,w,h} of the window. Returns false when unreachable.
  goToPlatform(rect) {
    const pl = this.platforms.find(p =>
      Math.abs(p.x - rect.x) < 12 && Math.abs(p.y - rect.y) < 12 && p.w === rect.w);
    if (!pl || pl === this.onPlatform) return false;
    this._napRequested = true;
    this._jumpTo(pl, 0.6 + Math.min(0.85, Math.abs(this.baseY - pl.y) / 460));
    return true;
  }
  // while true, the brain favours cozy states whenever it stands on a window
  get napRequested() { return !!this._napRequested; }
  set napRequested(v) { this._napRequested = !!v; }

  // effective weights = base × time-of-day × stress
  _effWeights() {
    const base = this.breed === 'panda' ? PANDA_WEIGHTS : CAT_WEIGHTS;
    const bias = BIAS_MULT[this.timeBiasMode] || {};
    const stress = this.stressed ? STRESS_MULT : {};
    const out = {};
    for (const k in base) {
      let v = base[k];
      if (bias[k] != null) v *= bias[k];
      if (stress[k] != null) v *= stress[k];
      if (v > 0) out[k] = v;
    }
    return out;
  }
  _speedFactor() {
    let f = 1;
    if (this.timeBiasMode === 'night') f *= 0.85;
    if (this.stressed) f *= 1.3;
    return f;
  }

  _pick(weights = this._effWeights()) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = this.rand() * total;
    for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
    return 'idle';
  }

  _enter(state, dur) {
    // v3.13: an interrupted flight must never strand the cat mid-air. A jump
    // cancelled by an interaction (pet, dance, nuzzle, play-fight…) used to
    // freeze the feet at a suspended baseY — the cat then walked on invisible
    // air — and left a STALE _jump arc behind, which blocked the companion's
    // join/run guards forever ("the companion cat is not showing"). Internal
    // jump callers (_jumpTo, _borderHop, falls) always assign _jump BEFORE
    // _enter('jump'), so this landing snap is safe for every call site.
    if (state !== 'jump' && (this._jump || this.jumpY || this.jumpP)) {
      if (this._jump) {
        this.baseY = this._jump.y1;              // land at the arc's destination
        this.onPlatform = this._jump.pl || null;
        if (this.onPlatform) this.platformT = 0;
        this._jump = null;
      }
      this.jumpY = 0;
      this.jumpP = 0;
    }
    this.state = state;
    this.stateT = 0;
    this.stateDur = dur;
    if (state === 'walk' || state === 'run' || state === 'waddle' || state === 'zoomies') {
      this.dir = this.rand() < 0.5 ? -1 : 1;
      // bias toward screen center when near edges
      const cx = this.bounds.x + this.bounds.w / 2;
      if (Math.abs(this.x - cx) > this.bounds.w * 0.35) this.dir = this.x < cx ? 1 : -1;
    }
    if (state === 'jump') this.jumpP = 0;
    if (state === 'sleep') this.sleepy = false;
    const em = EMOTE_ON[state];
    if (em) this.emote = { kind: em, t0: this.t };
    this.onEvent('enter:' + state);
  }

  _nextAction() {
    // v3.5: resume an active laser chase after any interruption (pounce etc.)
    // — but the TOTAL chase time (this._laserAge, pounces included) is capped,
    // so a lucky dot can't keep the cat chasing forever.
    if (this.laser && this.state !== 'laser') {
      const remain = 8 - this._laserAge;
      if (remain <= 0.3) this.stopLaser();
      else { this._enter('laser', remain); return; }
    }
    // v3.6: low battery overrides everything except a live laser chase —
    // the cat is "saving energy" and stays curled until plugged in.
    if (this._batteryLow && this.state !== 'curl') { this._enter('curl', 25); return; }
    // v3.6: music -> keep bopping until it stops
    if (this.musicOn && !['bop', 'laser', 'pounce', 'stalk'].includes(this.state)) {
      this._enter('bop', 3); return;
    }
    // v3.6: cozy bias while napping on a window top (editor-curl feature)
    if (this._napRequested && this.onPlatform) {
      this._enter(this.rand() < 0.6 ? 'loaf' : 'sit', 6 + this.rand() * 6);
      return;
    }
    if (this._napRequested && !this.onPlatform) this._napRequested = false;
    // v3.5: post-meal zoomies — a real cat thing ("snack raccs"). The gag lands
    // because it fires right after eating, never at random.
    if ((this.state === 'eat' || this.state === 'bamboo') && this.rand() < 0.45) {
      this._enter('zoomies', 1.8 + this.rand() * 1.4);
      return;
    }
    if (this.state === 'idle') {
      this.idleStreak++;
      // long idle -> sleep chance grows
      if (this.idleStreak >= 3 && this.rand() < 0.35) { this._enter('sleep', 8 + this.rand() * 8); return; }
    } else this.idleStreak = 0;
    const panda = this.breed === 'panda';
    const act = this._pick();
    switch (act) {
      case 'walk': this._enter(panda ? 'waddle' : 'walk', 2.5 + this.rand() * 4); break;
      case 'run': this._enter('run', 1.4 + this.rand() * 1.8); break;
      case 'idle': this._enter('idle', 1.2 + this.rand() * 2.5); break;
      case 'sit': this._enter('sit', 4 + this.rand() * 5); break;
      case 'scratch': this._enter('scratch', 2.2 + this.rand() * 1.5); break;
      case 'dance': this._enter('dance', 2.6 + this.rand() * 2); break;
      case 'eat': this._enter('eat', 4.9); break;   // 3 bite+chew cycles (1.4s each) + gulp
      case 'sleep': this._enter('sleep', 7 + this.rand() * 6); break;
      case 'jump': if (this.onPlatform) this._borderHop(); else this._enter('jump', 0.75); break;
      case 'stretch': this._enter('stretch', 2.6 + this.rand() * 1.2); break;
      case 'groom': this._enter('groom', 3 + this.rand() * 1.5); break;
      case 'pounce': this._enter('pounce', 1.9); break;
      case 'knead': this._enter('knead', 3 + this.rand() * 2); break;
      case 'loaf': this._enter('loaf', 4 + this.rand() * 4); break;
      case 'yawn': this._enter('yawn', 2.4); break;
      case 'startle': this._enter('startle', 0.7); break;
      case 'waddle': this._enter('waddle', 3 + this.rand() * 4); break;
      case 'bamboo': this._enter('bamboo', 4 + this.rand() * 2); break;
      case 'roll': this._enter('roll', 1.5 * (2 + Math.floor(this.rand() * 2))); break;
      case 'happy': this._enter('happy', 1.8 + this.rand() * 1.2); break;
      // ---- v3.5 funny pack ----
      case 'sneeze': this._enter('sneeze', 1.6); break;
      case 'hairball': this._enter('hairball', 2.8); break;
      case 'zoomies': this._enter('zoomies', 1.6 + this.rand() * 1.2); break;
      // ---- v3.6 ----
      case 'mope': this._enter('mope', 6 + this.rand() * 2); break;
      default: this._enter('idle', 2);
    }
  }

  // ------------------------------------------------------------ interactions
  pet() {
    this._enter('happy', 2.2);
    this.emote = { kind: 'love', t0: this.t };
    this.onEvent('pet');
  }
  poke() { this._enter('startle', 0.7); this.onEvent('poke'); }
  feed() { this._enter(this.breed === 'panda' ? 'bamboo' : 'eat', this.breed === 'panda' ? 5.5 : 4.9); this.onEvent('feed'); }
  dance() { this._enter('dance', 4); this.onEvent('dance'); }
  sleepNow() { this._enter('sleep', 10); }

  // v3.5: laser-pointer toy. cat.html owns the red dot (spawns it, drifts it,
  // decides catch/escape) — the brain only chases the coordinates it is fed.
  startLaser(x, y) {
    this.stopStalk();             // a laser overrides any cursor stalking
    this.laser = { x, y };
    this._laserAge = 0;
    this._laserCd = 0;
    this._enter('laser', 8);       // hard cap: a chase never outlives ~8s
    this.onEvent('laser:start');
  }
  moveLaser(x, y) {
    if (!this.laser) return;
    this.laser.x = x; this.laser.y = y;
  }
  stopLaser() {
    const had = !!this.laser;
    this.laser = null;
    if (had) this.onEvent('laser:stop');
  }

  // ------------------------------------------------------------ platforms
  // platforms: [{ x, y, w, h }] — full window rects in screen coords.
  // The cat stands on the TOP border (y) between x and x+w.
  //
  // v3.8: windows MOVE and RESIZE between scans. The old code compared by
  // object identity, so the moment the user dragged/resized a window the cat
  // lost its platform and TELEPORTED to the ground ("rendering jump from one
  // place to another"). Now: platforms are re-bound by geometry — the same
  // physical window keeps the cat on its (new) top border, a moved border is
  // followed with a visible hop, and a vanished window gets an animated fall.
  setPlatforms(list) {
    let fresh = (Array.isArray(list) ? list : [])
      .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
                   p.w > 90 && p.h > 40 &&
                   p.y >= this.bounds.y - 40 && p.y <= this.bounds.y + this.bounds.h)
      .slice(0, 30);
    // v3.6: drop window tops that intersect a no-walk zone (top-strip test —
    // a zone pinned low should not veto a tall window far above it)
    if (this._zones.length) {
      fresh = fresh.filter(pl =>
        !this._zones.some(z => rectsIntersect({ x: pl.x, y: pl.y, w: pl.w, h: Math.min(pl.h, 24) }, z, 4)));
    }

    const cur = this.onPlatform;
    if (cur) {
      // v3.9: when the live tracker is confirming the platform we stand on, it
      // OWNS the geometry (it updates the rect in place ~3Hz with smooth
      // rides). The 4.5s scan must then neither re-bind/snap us (its rect can
      // be staler than the tracker's) nor declare the window vanished on one
      // flaky scan (cloaked-during-drag, title blip) — that scan-flicker used
      // to drop the cat off a perfectly healthy window.
      const trackerLive = this._trackAlive && Number.isFinite(cur.id);
      const match = trackerLive ? cur : matchPlatform(cur, fresh);
      if (match) {
        if (trackerLive) {
          // tracker owns it — nothing to do here except keep the platform
          // listed as a hop target. No snaps, no rides, no teleports.
        } else {
          // same physical window (it may have been dragged/resized): re-bind
          // and keep the cat ON its top border at the same relative spot.
          const rel = cur.w > 0 ? (this.x - cur.x) / cur.w : 0.5;
          const pad = 30;
          let nx = match.x + Math.max(0, Math.min(1, rel)) * match.w;
          nx = Math.max(match.x + pad, Math.min(match.x + match.w - pad, nx));
          nx = Math.max(this.minX + pad, Math.min(this.maxX - pad, nx));
          const dy = match.y - cur.y;
          this.onPlatform = match;
          if (!this._jump) {
            if (Math.abs(dy) <= 60) {
              // border nudged (small resize) — ride along, imperceptible
              this.x = nx;
              this.baseY = match.y;
            } else {
              // border moved far (drag / resize-from-top): hop back onto it
              // visibly instead of silently teleporting
              this._jumpTo(match, 0.6);
            }
          }
        }
      } else if (!trackerLive) {
        // window vanished (closed / minimized / excluded): fall with a little
        // forward arc — never the old instant drop to the ground
        this.onPlatform = null;
        const dir = this.dir;
        this._jump = { x0: this.x, x1: this.x + dir * 46, y0: this.baseY, y1: this.groundY, pl: null };
        this._enter('jump', 0.5);
      }
      // trackerLive && !match: scan lost the window but the tracker still sees
      // it — ghost grace, keep standing (the tracker's own ok:false ×2 rules
      // the real vanish case).
    }
    this.platforms = fresh;
  }

  // v3.9 THE PLATFORM TRACKER — the other half of the "rendering jump" fix.
  // The 4.5s scan left the cat standing on a STALE border for up to one scan
  // interval while the user dragged/resized its window, then the next scan
  // snapped/hopped it back — float, then jump. main now polls the tracked
  // hwnd with user32 GetWindowRect ~3Hz (one persistent PowerShell, no
  // spawns) and pushes rects here. The platform rect is updated IN PLACE and
  // the ride is rate-capped, so a dragged border reads as the cat scrambling
  // along it — continuous motion, never a teleport.
  //   r: { id, x, y, w, h, ok:true } live rect, or { id, ok:false } gone.
  updateTrackedPlatform(r) {
    if (!r || !Number.isFinite(r.id)) return;
    const pl = this.onPlatform;
    if (!pl || pl.id !== r.id) return;               // stale line / not standing
    if (r.ok === false) {
      this._trackMiss++;
      if (this._trackMiss >= 2) {
        // really gone (closed / minimized): animated fall, same as a scan vanish
        this._trackAlive = false;
        this.onPlatform = null;
        const dir = this.dir;
        this._jump = { x0: this.x, x1: this.x + dir * 46, y0: this.baseY, y1: this.groundY, pl: null };
        this._enter('jump', 0.5);
      }
      return;
    }
    if (!(Number.isFinite(r.x) && Number.isFinite(r.y) && r.w > 0 && r.h > 0)) return;
    this._trackMiss = 0;
    this._trackAlive = true;
    // Store the tracker's truth as SMOOTHED TARGETS, not hard positions: the
    // tracker samples at ~3Hz, so adopting its rect directly would move the
    // cat in ≤130px steps every 320ms — another visible jump. Instead tick()
    // glides pl.y/pl.x (and the cat) toward the targets continuously at
    // ≤700/900 px/s, which reads as the cat being CARRIED by its window.
    // While airborne the border adopts the TRUE y immediately — the cat is
    // not touching it, and the in-flight landing must target where the border
    // WILL be, not where it was when the jump started.
    if (this._jump) {
      pl.y = r.y;
      if (this._jump.pl === pl) this._jump.y1 = pl.y;   // landing follows the CURRENT border
      pl._ty = null;
    } else {
      pl._ty = r.y;
    }
    pl._tx = r.x;
    pl.w = r.w; pl.h = r.h;
  }

  // v3.9: per-frame glide toward the tracker's target rect (see
  // updateTrackedPlatform). Runs while standing, in ANY state — the cat is
  // glued to a moving border and must be carried even while sitting/sleeping.
  _tickTrackerRide(dt) {
    const pl = this.onPlatform;
    if (!pl || this._jump) return;
    if (Number.isFinite(pl._ty) && pl.y !== pl._ty) {
      const dy = pl._ty - pl.y;
      pl.y += Math.sign(dy) * Math.min(Math.abs(dy), 700 * dt);   // ≈11.7px/frame
      this.baseY = pl.y;                                          // feet glued to the border
      if (pl.y === pl._ty) pl._ty = null;
    }
    if (Number.isFinite(pl._tx)) {
      const dxp = pl._tx - pl.x;
      if (dxp !== 0) {
        const step = Math.sign(dxp) * Math.min(Math.abs(dxp), 900 * dt);   // ≈15px/frame
        pl.x += step;
        this.x += step;             // the cat is CARRIED with its window (same spot on the border)
      }
      // pad correction for a shrunk/resized border (glide, never snap)
      const pad = 30;
      const lo = Math.max(pl.x + pad, this.minX + pad);
      const hi = Math.min(pl.x + pl.w - pad, this.maxX - pad);
      if (this.x < lo) this.x = Math.min(lo, this.x + 900 * dt);
      else if (this.x > hi) this.x = Math.max(hi, this.x - 900 * dt);
      // clear the target only when the border AND the cat are both settled
      if (pl.x === pl._tx && this.x >= lo && this.x <= hi) pl._tx = null;
    }
  }

  // v3.8: hop ALONG the top border of the window we are standing on —
  // "the cat walks AND jumps on the top border". Lands back on the border.
  _borderHop() {
    const pl = this.onPlatform;
    if (!pl) { this._enter('jump', 0.75); return; }
    const pad = 34;
    const lo = Math.max(pl.x + pad, this.minX + pad);
    const hi = Math.min(pl.x + pl.w - pad, this.maxX - pad);
    if (hi - lo < 44) { this._enter('jump', 0.75); return; }   // border too short: in-place hop
    const reach = 90 + this.rand() * 110;
    let x1 = this.x + this.dir * reach;
    if (x1 < lo || x1 > hi) { this.dir *= -1; x1 = this.x + this.dir * reach; }   // bounce off the edge
    x1 = Math.max(lo, Math.min(hi, x1));
    this.onPlatform = null;   // airborne; re-bound on landing via _jump.pl
    this._jump = { x0: this.x, x1, y0: this.baseY, y1: pl.y, pl };
    this._enter('jump', 0.55);
  }

  // best window to jump onto from the current spot, or null
  // dirOverride: search in this direction instead of the current facing
  // reach: how far ahead (px) a window counts as "approachable"
  _findPlatformAhead(dirOverride, reach = 240) {
    const dir = dirOverride ?? this.dir;
    let best = null, bestD = Infinity;
    for (const pl of this.platforms) {
      if (pl === this.onPlatform) continue;
      const rise = this.baseY - pl.y;          // >0 => its top is above our feet
      const minRise = this.onPlatform ? -70 : 30; // sideways hops allowed between window tops
      if (rise < minRise || rise > 420) continue; // must be within reach
      const inFront = dir > 0 ? pl.x + pl.w > this.x - 40 : pl.x < this.x + 40;
      if (!inFront) continue;
      const nearEdge = this.x > pl.x - 100 && this.x < pl.x + pl.w + 100;
      const ahead = dir > 0 ? pl.x - this.x : this.x - (pl.x + pl.w);
      const approaching = ahead > -80 && ahead < reach;
      if (!nearEdge && !approaching) continue;
      const d = Math.abs(this.x - (pl.x + pl.w / 2)) + rise * 0.5;
      if (d < bestD) { bestD = d; best = pl; }
    }
    return best;
  }

  _jumpTo(pl, dur, dirOverride) {
    const pad = 34;
    let x1 = Math.max(pl.x + pad, Math.min(pl.x + pl.w - pad, this.x));
    x1 = Math.max(this.minX + pad, Math.min(this.maxX - pad, x1));
    if (dirOverride) this.dir = dirOverride;
    this.onPlatform = null;   // airborne — not on any surface mid-jump
    this._jump = { x0: this.x, x1, y0: this.baseY, y1: pl.y, pl };
    this._enter('jump', dur);
  }

  _leavePlatform(outwardDir = 0) {
    const pl = this.onPlatform;
    if (!pl) return;
    const dir = outwardDir || this.dir;
    // try a hop to a neighbouring window first (wider reach when leaving an edge)
    if (this.rand() < 0.6) {
      const next = this._findPlatformAhead(dir, 560);
      if (next && next !== pl) { this._jumpTo(next, 0.55 + Math.min(0.85, Math.abs(this.baseY - next.y) / 460), dir); return; }
    }
    // drop back to the ground with a little forward arc
    this.onPlatform = null;
    this.dir = dir;
    this._jump = { x0: this.x, x1: this.x + dir * 46, y0: pl.y, y1: this.groundY, pl: null };
    this._enter('jump', 0.5);
  }

  // snap to the best surface under (x, y) — used after a drag
  dropAt(x, y) {
    this.x = x;
    this.jumpY = 0; this.jumpP = 0; this._jump = null;
    let best = null;
    for (const pl of this.platforms) {
      if (Math.abs(pl.y - y) < 28 && x > pl.x - 12 && x < pl.x + pl.w + 12) { best = pl; break; }
    }
    // v3.13: released in mid-air with no window top under the cat — a real
    // cat FALLS. The old code froze the cat at the release height forever
    // (walking on invisible air until the next platform jump). Releases
    // within 60px of the ground still snap exactly where the user let go.
    if (!best && y < this.groundY - 60) {
      this.onPlatform = null;
      this._jump = { x0: x, x1: x + this.dir * 30, y0: y, y1: this.groundY, pl: null };
      this._enter('jump', 0.5);
      return;
    }
    this.onPlatform = best;
    this.baseY = best ? best.y : y;
  }

  _tickPlatformWalk(dt) {
    const pl = this.onPlatform;
    const pad = 30;
    let outward = 0;
    if (this.x <= pl.x + pad) { this.x = pl.x + pad; this.dir = 1; outward = -1; }
    else if (this.x >= pl.x + pl.w - pad) { this.x = pl.x + pl.w - pad; this.dir = -1; outward = 1; }
    this.platformT += dt;
    if (outward || this.platformT > 7 + this.rand() * 7) this._leavePlatform(outward);
  }

  // zone-aware horizontal move: returns true when the move was blocked and
  // the cat turned around (used by ground strolls)
  _moveX(dx) {
    const nx = this.x + dx;
    let fx = null;
    if (this._zones.length) {
      fx = resolveMove(this._zones, this.x, nx, this.baseY, this._scale);
    }
    if (fx != null) {
      this.x = Math.max(this.minX + 20, Math.min(this.maxX - 20, fx));
      this.dir *= -1;
      return true;
    }
    this.x = nx;
    return false;
  }

  // ------------------------------------------------------------ tick
  tick(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1); // clamp to survive tab throttling
    this.t += dt;
    this.stateT += dt;
    if (this.laser) this._laserAge += dt;   // v3.5: total chase time (incl. pounces)
    const sf = this._speedFactor();         // v3.6: night slows down, stress speeds up
    this._tickTrackerRide(dt);              // v3.9: smooth carry toward the tracked border

    switch (this.state) {
      case 'walk':
      case 'waddle': {
        if (this.onPlatform) {
          this.x += this.dir * this.speed * sf * dt;
          this._tickPlatformWalk(dt);
          break;
        }
        this._moveX(this.dir * this.speed * sf * dt); // v3.6: zone-aware stroll
        this._clampAndTurn();
        this._platformCd -= dt;
        if (this._platformCd <= 0) {
          const pl = this._findPlatformAhead();
          if (pl && this.rand() < 0.85) {
            this._platformCd = 4;
            this._jumpTo(pl, 0.5 + Math.min(0.85, (this.baseY - pl.y) / 460));
            break;
          }
          this._platformCd = 0.9;
        }
        break;
      }
      case 'run': {
        if (this.onPlatform) {
          this.x += this.dir * this.runSpeed * sf * dt;
          this._tickPlatformWalk(dt);
          break;
        }
        this._moveX(this.dir * this.runSpeed * sf * dt);
        this._clampAndTurn(true);
        break;
      }
      case 'roll': {
        // pandas really roll: forward/backward somersaults (research, 2025).
        // give the somersault a little travel so it reads as a tumble, not a spin.
        this.x += this.dir * 30 * dt;
        this._clampAndTurn();
        break;
      }
      case 'zoomies': {
        // v3.5 funny pack: the mad after-meal sprint — gallop bounce + dust
        this._moveX(this.dir * this.runSpeed * 1.7 * sf * dt);
        this.jumpY = -Math.abs(Math.sin(this.t * 14)) * 9;
        this._clampAndTurn();
        break;
      }
      // ---------------- v3.6 living-on-your-machine states ----------------
      case 'stalk': {
        // crouch-wiggle, then creep toward the idle cursor and pounce it.
        if (!this.stalk) { this._nextAction(); break; }
        const dxs = this.stalk.x - this.x;
        if (Math.abs(dxs) > 480) { this.stopStalk(); this._nextAction(); break; } // lost interest
        if (dxs !== 0) this.dir = dxs > 0 ? 1 : -1;
        if (this.stateT < 0.8) {
          // butt-wiggle aim phase (renderer shows the crouch)
          this.jumpY = 0;
        } else if (Math.abs(dxs) > 55) {
          // v3.13: stalkBoost lets a butterfly hunt creep faster than the
          // sleepy cursor-stalk (a butterfly will not wait all day)
          this._moveX(Math.sign(dxs) * Math.min(Math.abs(dxs), this.speed * 0.55 * (this.stalkBoost || 1) * sf * dt));
          this.jumpY = -Math.abs(Math.sin(this.t * 8)) * 1.5;   // slinky low bob
        } else if (this.stalk.kind === 'butterfly') {
          // v3.14 THE REAL-CAT CATCH: in paw reach — the cat rears up onto
          // its HIND legs and tries to grab the butterfly with its FRONT
          // paws (cat.html resolves each swat: catch vs dodge).
          this._rearSwats = 0;
          this.jumpY = 0;
          this._enter('rear', 1.7);
          this.onEvent('butterfly:rear');
        } else {
          this._enter('pounce', 1.9);   // cat.html resolves the "catch"
        }
        break;
      }
      case 'rear': {
        // v3.14: standing on the hind legs, swiping up with the front paws.
        // The renderer draws the reared pose from stateT; here we only face
        // the prey and fire the two swat events the caller resolves.
        if (!this.stalk) {
          // v3.14: the hunt ended mid-rear (a swat CONNECTED!) — hold the
          // pose through the drop phase instead of snapping out mid-air
          if (this.stateT < 1.35) break;
          this._nextAction();
          break;
        }
        const dxr = this.stalk.x - this.x;
        if (dxr !== 0) this.dir = dxr > 0 ? 1 : -1;
        if (Math.abs(dxr) > 150) {
          // the prey escaped the paw zone — drop to all fours and chase
          this._rearSwats = 0;
          this._enter('stalk', 6);
          break;
        }
        const swatAt = [0.55, 1.05];   // matches the pose's paw apexes
        while (this._rearSwats < swatAt.length && this.stateT >= swatAt[this._rearSwats]) {
          this._rearSwats++;
          this.onEvent('rear:swat', this._rearSwats);
        }
        break;
      }
      case 'bop': {
        // music playing: sway in place to the beat (renderer adds the notes)
        this.jumpY = -Math.abs(Math.sin(this.t * 4.6)) * 4;
        break;
      }
      case 'investigate': {
        // walk over to the new window and sniff it
        if (!this._inv) { this._nextAction(); break; }
        const dxi = this._inv.x - this.x;
        if (Math.abs(dxi) <= 42) {
          this._inv = null;
          this._enter('sniff', 2.4);
          this.emote = { kind: 'question', t0: this.t };
        } else {
          this.dir = dxi > 0 ? 1 : -1;
          this._moveX(this.dir * this.speed * sf * dt);
          this._clampAndTurn();
        }
        break;
      }
      case 'sniff': case 'mope': case 'nuzzle': case 'curl':
        // stationary poses — renderer does the work
        break;
      case 'laser': {
        // v3.5 funny pack: chase the red dot (cat.html feeds its coords).
        // Stalk/run toward it; when close, pounce — cat.html decides catch vs
        // escape and either ends the chase (stopLaser) or moves the dot away.
        if (!this.laser) { this._nextAction(); break; }
        this._laserCd -= dt;
        const dx = this.laser.x - this.x;
        const feet = this.baseY + this.jumpY;
        const dy = this.laser.y - feet;
        const dist = Math.hypot(dx, dy);
        if (dx !== 0) this.dir = dx > 0 ? 1 : -1;
        const sp = this.runSpeed * 0.85;
        if (dist > 46) {
          this.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
          if (Math.abs(dy) > 90) {
            this.baseY += Math.sign(dy) * Math.min(Math.abs(dy), sp * 0.6 * dt);
            this.baseY = Math.max(this.bounds.y + 120, Math.min(this.groundY, this.baseY));
          }
          this.jumpY = -Math.abs(Math.sin(this.t * 12)) * 7;
        } else if (this._laserCd <= 0 && this.stateT < this.stateDur - 1.2) {
          this._laserCd = 1.4;
          this._enter('pounce', 1.9);   // _nextAction resumes the chase (this.laser)
        }
        break;
      }
      case 'jump': {
        const J = this._jump;
        if (J) {
          const p = Math.min(1, this.stateT / this.stateDur);
          const going = J.y1 - J.y0;                      // negative = upward
          const k = going < 0 ? (1 - (1 - p) * (1 - p))   // ease-out ascent
                              : (p * p);                   // ease-in fall
          this.x = J.x0 + (J.x1 - J.x0) * p;
          this.jumpY = going * k;
          this.jumpP = p;
        } else {
          // plain in-place hop
          const p = this.stateT / this.stateDur;
          this.jumpP = Math.min(1, Math.max(0, p));
          this.jumpY = -Math.sin(Math.min(1, p) * Math.PI) * 70;
        }
        break;
      }
      default: break;
    }

    if (this.stateT >= this.stateDur) {
      if (this.state === 'jump') {
        if (this._jump) {
          this.baseY = this._jump.y1;
          this.onPlatform = this._jump.pl || null;
          this._jump = null;
          if (this.onPlatform) this.platformT = 0;
        }
        this.jumpY = 0; this.jumpP = 0;
      }
      if (this.state === 'zoomies') this.jumpY = 0;
      if (this.state === 'bop') this.jumpY = 0;
      if (this.state === 'laser') this.stopLaser();   // chase timed out — dot vanishes
      if (this.state === 'stalk') this.stopStalk();   // cursor moved off — interest lost
      if (this.state === 'pounce' && this.stalk) this.stopStalk();   // cursor pounce resolved
      if (this.state === 'investigate') this._inv = null;
      // v3.6.1: during a battery crisis the cat stays curled — it used to wake
      // up after each curl and randomly stroll around while "saving energy"
      if (this.state === 'curl' && this._batteryLow) { this._enter('curl', 20 + this.rand() * 15); return; }
      // v3.14: the rear ended without a catch and the butterfly is still
      // live — back on all fours and after it (the chase continues)
      if (this.state === 'rear' && this.stalk && this.stalk.kind === 'butterfly') {
        this._rearSwats = 0;
        this._enter('stalk', 6);
      }
      else if (this.state === 'bop' && this.musicOn) this._enter('bop', 3);   // keep the beat
      else this._nextAction();
    }
  }

  // v3.5: a butterfly drifted close — only idle-ish cats give chase, and the
  // caller (cat.html) gates frequency. Returns true if the cat noticed it.
  noticeButterfly(x, y) {
    if (!['idle', 'sit', 'loaf', 'groom'].includes(this.state)) return false;
    this.dir = x >= this.x ? 1 : -1;
    this._enter('pounce', 1.9);
    this.onEvent('butterfly:pounce');
    return true;
  }

  _clampAndTurn(forceTurn = false) {
    const pad = 60;
    if (this.x <= this.minX + pad) { this.x = this.minX + pad; this.dir = 1; if (forceTurn) this._enter('walk', 2 + this.rand() * 3); }
    else if (this.x >= this.maxX - pad) { this.x = this.maxX - pad; this.dir = -1; if (forceTurn) this._enter('walk', 2 + this.rand() * 3); }
  }

  get y() { return this.baseY; }
  set y(v) { this.baseY = v; }

  get pose() {
    return {
      x: Math.round(this.x), y: Math.round(this.baseY + this.jumpY),
      state: this.state, dir: this.dir, t: this.t, jumpP: this.jumpP,
      stateT: this.stateT, stateDur: this.stateDur,   // v3.14: rear/swat phase
    };
  }
}
