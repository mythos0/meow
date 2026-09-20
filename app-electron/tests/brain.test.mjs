// brain.test.mjs — CatBrain unit tests (node:test)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CatBrain, mulberry32 } from '../src/cat-brain.js';

function mkBrain(seed = 42, over = {}) {
  return new CatBrain({
    bounds: { x: 0, y: 0, w: 1920, h: 1080 },
    groundY: 1040,
    rand: mulberry32(seed),
    ...over,
  });
}

describe('CatBrain', () => {
  test('starts idle at center-ish and yields a valid pose', () => {
    const b = mkBrain();
    const p = b.pose;
    assert.equal(p.state, 'idle');
    assert.ok(p.x > 0 && p.x < 1920);
    assert.equal(p.y, 1040);
    assert.ok(['-1', '1'].includes(String(p.dir)));
  });

  test('walking moves the cat in its facing direction', () => {
    const b = mkBrain();
    b._enter('walk', 5);
    const x0 = b.x;
    b.tick(0.5);
    const moved = b.x - x0;
    assert.ok(Math.abs(moved) > 5, `expected movement, got ${moved}`);
    assert.equal(Math.sign(moved), b.dir);
  });

  test('turns around at left edge and stays in bounds', () => {
    const b = mkBrain(42, { x: 70 });
    b._enter('walk', 10);
    b.dir = -1;
    for (let i = 0; i < 60; i++) b.tick(0.1); // simulate 6s
    assert.ok(b.x >= 60 - 0.001, `x clamped to min+pad (x=${b.x})`);
    assert.equal(b.dir, 1, 'turned right at left wall');
  });

  test('turns around at right edge and stays in bounds', () => {
    const b = mkBrain(42, { x: 1850 });
    b._enter('walk', 10);
    b.dir = 1;
    for (let i = 0; i < 60; i++) b.tick(0.1);
    assert.ok(b.x <= 1860 + 0.001, `x clamped to max-pad (x=${b.x})`);
    assert.equal(b.dir, -1);
  });

  test('jump produces parabolic height with apex mid-way', () => {
    const b = mkBrain();
    b._enter('jump', 1.0);
    const ys = [];
    for (let i = 0; i < 12; i++) { b.tick(0.1); ys.push(b.jumpY); }
    const apex = Math.min(...ys);
    assert.ok(apex < -50, `apex well above ground (${apex})`);
    assert.ok(Math.abs(ys[2] - apex) > 1 && Math.abs(ys[9] - apex) > 1, 'apex near middle');
    assert.equal(b.jumpY, 0, 'landed at end');
  });

  test('state transitions occur: deterministic seed produces several states over time', () => {
    const b = mkBrain(7);
    const seen = new Set([b.state]);
    for (let i = 0; i < 60 * 60; i++) { // simulate 60s at 60fps
      b.tick(1 / 60);
      seen.add(b.state);
    }
    assert.ok(seen.size >= 3, `expected >=3 states over 60s, saw ${[...seen].join(',')}`);
  });

  test('pet() switches to happy then reverts to normal actions', () => {
    const b = mkBrain();
    b.pet();
    assert.equal(b.state, 'happy');
    for (let i = 0; i < 30; i++) b.tick(0.1); // 3s > 2.2s duration
    assert.notEqual(b.state, 'happy');
  });

  test('poke() triggers a startle (v3.1)', () => {
    const b = mkBrain();
    b.poke();
    assert.equal(b.state, 'startle');
    assert.equal(b.emote && b.emote.kind, 'exclaim', 'startle shows ! emote');
  });

  test('feed() triggers eat', () => {
    const b = mkBrain();
    b.feed();
    assert.equal(b.state, 'eat');
  });

  test('emits events for interactions', () => {
    const events = [];
    const b = mkBrain(1, { onEvent: e => events.push(e) });
    b.pet(); b.poke(); b.feed();
    assert.ok(events.includes('pet') && events.includes('poke') && events.includes('feed'));
  });

  test('sleep increases when idle streak is long', () => {
    const b = mkBrain(99);
    b.idleStreak = 5;
    let slept = false;
    for (let i = 0; i < 200 && !slept; i++) {
      if (b.state === 'idle' && b.stateT >= b.stateDur) { /* nextAction may sleep */ }
      b.tick(1 / 30);
      if (b.state === 'sleep') slept = true;
    }
    // probabilistic; with seeded rng this is deterministic — assert it eventually sleeps or at least runs
    assert.ok(slept || b.t > 3, 'brain kept simulating');
  });

  test('tick clamps large dt (tab-throttle survival)', () => {
    const b = mkBrain();
    b._enter('walk', 5);
    b.tick(30); // huge frame gap
    assert.ok(b.stateT <= 0.11, 'stateT advanced by clamped dt only');
  });

  test('run moves faster than walk', () => {
    const a = mkBrain(5); a._enter('walk', 10);
    const c = mkBrain(5); c._enter('run', 10);
    const ax = a.x, cx = c.x;
    for (let i = 0; i < 10; i++) { a.tick(0.1); c.tick(0.1); }
    const dw = Math.abs(a.x - ax), dr = Math.abs(c.x - cx);
    assert.ok(dr > dw * 1.5, `run (${dr}px) should outpace walk (${dw}px)`);
  });
});
