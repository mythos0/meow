// cat-brain.js — pure state machine + movement brain. No DOM/Electron deps.
// Deterministic when seeded: tick(dt) is the only mutator.
// v3.2: open-field roaming REMOVED (user request) — the cat strolls along the
// ground edge-to-edge, jumps onto nearby window tops, strolls there, hops to
// the next window or drops back. Pandas waddle and roll forward as they roll.

'use strict';

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
];

// emote shown when entering a state
export const EMOTE_ON = {
  startle: 'exclaim', pounce: 'exclaim', dance: 'note', sleep: 'zzz',
  yawn: 'zzz', groom: 'heart', bamboo: 'heart', eat: 'fish', roll: 'laugh',
  stretch: 'star', knead: 'love',
};

const CAT_WEIGHTS = {
  walk: 20, idle: 15, sit: 6, run: 6, scratch: 5, dance: 4, eat: 3, sleep: 3, jump: 7,
  stretch: 5, groom: 5, pounce: 5, knead: 3, loaf: 4, yawn: 3, startle: 2,
};
const PANDA_WEIGHTS = {
  waddle: 24, idle: 13, sit: 6, bamboo: 10, roll: 8, sleep: 4, dance: 3,
  loaf: 5, yawn: 3, startle: 2, happy: 4,
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

    // contextual emote: { kind, t0 }
    this.emote = null;

    // action weights (tunable)
    this.weights = this.breed === 'panda' ? { ...PANDA_WEIGHTS } : { ...CAT_WEIGHTS };
  }

  _pick(weights = this.weights) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = this.rand() * total;
    for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
    return 'idle';
  }

  _enter(state, dur) {
    this.state = state;
    this.stateT = 0;
    this.stateDur = dur;
    if (state === 'walk' || state === 'run' || state === 'waddle') {
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
      case 'jump': this._enter('jump', 0.75); break;
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

  // ------------------------------------------------------------ platforms
  // platforms: [{ x, y, w, h }] — full window rects in screen coords.
  // The cat stands on the TOP border (y) between x and x+w.
  setPlatforms(list) {
    this.platforms = (Array.isArray(list) ? list : [])
      .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
                   p.w > 90 && p.h > 40 &&
                   p.y >= this.bounds.y - 40 && p.y <= this.bounds.y + this.bounds.h)
      .slice(0, 30);
    // drop reference to vanished windows
    if (this.onPlatform && !this.platforms.includes(this.onPlatform)) {
      this.onPlatform = null;
      this.baseY = this.groundY;
    }
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

  // ------------------------------------------------------------ tick
  tick(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1); // clamp to survive tab throttling
    this.t += dt;
    this.stateT += dt;

    switch (this.state) {
      case 'walk':
      case 'waddle': {
        if (this.onPlatform) {
          this.x += this.dir * this.speed * dt;
          this._tickPlatformWalk(dt);
          break;
        }
        this.x += this.dir * this.speed * dt;        // classic edge-to-edge ground stroll
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
          this.x += this.dir * this.runSpeed * dt;
          this._tickPlatformWalk(dt);
          break;
        }
        this.x += this.dir * this.runSpeed * dt;
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
      this._nextAction();
    }
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
    };
  }
}
