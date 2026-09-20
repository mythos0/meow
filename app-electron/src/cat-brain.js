// cat-brain.js — pure state machine + movement brain. No DOM/Electron deps.
// Deterministic when seeded: tick(dt) is the only mutator.

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

export const ACTIONS = ['walk', 'idle', 'sit', 'sleep', 'scratch', 'dance', 'run', 'eat'];

export class CatBrain {
  constructor(opts = {}) {
    this.bounds = opts.bounds || { x: 0, y: 0, w: 1920, h: 1080 };
    this.groundY = opts.groundY ?? this.bounds.y + this.bounds.h - 40;
    this.speed = opts.speed ?? 55;          // px/s walk
    this.runSpeed = opts.runSpeed ?? 150;   // px/s run
    this.rand = opts.rand || Math.random;
    this.onEvent = opts.onEvent || (() => {});
    this.maxX = opts.maxX ?? this.bounds.x + this.bounds.w;
    this.minX = opts.minX ?? this.bounds.x;

    this.t = 0;             // animation clock
    this.x = opts.x ?? this.bounds.x + this.bounds.w / 2;
    this.y = this.groundY;  // feet baseline
    this.jumpY = 0;
    this.dir = this.rand() < 0.5 ? -1 : 1;
    this.state = 'idle';
    this.stateT = 0;        // time in current state
    this.stateDur = 1.2;
    this.jumpP = 0;
    this.idleStreak = 0;
    this.sleepy = false;

    // action weights (tunable)
    this.weights = {
      walk: 30, idle: 22, sit: 10, run: 8, scratch: 7, dance: 6, eat: 4, sleep: 3, jump: 10,
    };
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
    if (state === 'walk' || state === 'run') {
      this.dir = this.rand() < 0.5 ? -1 : 1;
      // bias toward screen center when near edges
      const cx = this.bounds.x + this.bounds.w / 2;
      if (Math.abs(this.x - cx) > this.bounds.w * 0.35) this.dir = this.x < cx ? 1 : -1;
    }
    if (state === 'jump') this.jumpP = 0;
    if (state === 'sleep') this.sleepy = false;
    this.onEvent('enter:' + state);
  }

  _nextAction() {
    if (this.state === 'idle') {
      this.idleStreak++;
      // long idle -> sleep chance grows
      if (this.idleStreak >= 3 && this.rand() < 0.35) { this._enter('sleep', 8 + this.rand() * 8); return; }
    } else this.idleStreak = 0;
    const act = this._pick();
    switch (act) {
      case 'walk': this._enter('walk', 2.5 + this.rand() * 4); break;
      case 'run': this._enter('run', 1.4 + this.rand() * 1.8); break;
      case 'idle': this._enter('idle', 1.2 + this.rand() * 2.5); break;
      case 'sit': this._enter('sit', 4 + this.rand() * 5); break;
      case 'scratch': this._enter('scratch', 2.2 + this.rand() * 1.5); break;
      case 'dance': this._enter('dance', 2.6 + this.rand() * 2); break;
      case 'eat': this._enter('eat', 2.4 + this.rand() * 1.6); break;
      case 'sleep': this._enter('sleep', 7 + this.rand() * 6); break;
      case 'jump': this._enter('jump', 0.75); break;
      default: this._enter('idle', 2);
    }
  }

  pet() {
    this._enter('happy', 2.2);
    this.onEvent('pet');
  }
  poke() { this.onEvent('poke'); this._enter('jump', 0.75); }
  feed() { this._enter('eat', 3.2); this.onEvent('feed'); }
  dance() { this._enter('dance', 4); this.onEvent('dance'); }
  sleepNow() { this._enter('sleep', 10); }

  tick(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1); // clamp to survive tab throttling
    this.t += dt;
    this.stateT += dt;

    switch (this.state) {
      case 'walk': {
        this.x += this.dir * this.speed * dt;
        this._clampAndTurn();
        break;
      }
      case 'run': {
        this.x += this.dir * this.runSpeed * dt;
        this._clampAndTurn(true);
        break;
      }
      case 'jump': {
        const p = this.stateT / this.stateDur;
        this.jumpP = Math.min(1, Math.max(0, p));
        this.jumpY = -Math.sin(Math.min(1, p) * Math.PI) * 70;
        break;
      }
      default: break;
    }

    if (this.stateT >= this.stateDur) {
      if (this.state === 'jump') { this.jumpY = 0; this.jumpP = 0; }
      this._nextAction();
    }
  }

  _clampAndTurn(forceTurn = false) {
    const pad = 60;
    if (this.x <= this.minX + pad) { this.x = this.minX + pad; this.dir = 1; if (forceTurn) this._enter('walk', 2 + this.rand() * 3); }
    else if (this.x >= this.maxX - pad) { this.x = this.maxX - pad; this.dir = -1; if (forceTurn) this._enter('walk', 2 + this.rand() * 3); }
  }

  get pose() {
    return {
      x: Math.round(this.x), y: Math.round(this.y + this.jumpY),
      state: this.state, dir: this.dir, t: this.t, jumpP: this.jumpP,
    };
  }
}
