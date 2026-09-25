// v315.test.mjs — v3.18: the voice command suites (parser, launcher, SAPI
// listener) were removed WITH the feature at the user's request. What stays:
// the brain-level dance contract and the butterfly hunt geometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CatBrain, mulberry32 } from '../src/cat-brain.js';
import {
  spawnButterfly, tickButterfly, dodgeButterfly, swatCatchable, SWAT_RADIUS,
} from '../src/butterfly.js';

const step = (bf, secs, { t0 = 0, catX, lane = { x: 0, w: 1600 }, groundY = 1000 } = {}) => {
  let last = null;
  for (let i = 0; i < Math.round(secs / 0.05); i++) {
    last = tickButterfly(bf, { dt: 0.05, now: t0 + i * 0.05, lane, groundY, catX });
  }
  return last;
};

// ------------------------------------------------------------ salute + dance
test('salute: the pose is fully retired (v3.18 removed it with voice)', async () => {
  const b = new CatBrain({ rand: mulberry32(7) });
  b.tick(1);
  assert.equal(typeof b.saluteNow, 'undefined', 'saluteNow is gone from the brain');
  assert.ok(!b.state || b.state !== 'salute');
});
test('dance: the user-triggered dance runs the FULL 11.4s six-step routine', async () => {
  const { CatBrain } = await import('../src/cat-brain.js');
  const b = new CatBrain({ rand: () => 0.5 });
  b.dance();
  assert.equal(b.state, 'dance');
  for (let i = 0; i < 555; i++) b.tick(0.02);   // 11.1s — still dancing (finale)
  assert.equal(b.state, 'dance', 'the routine is still going at 11.1s');
  for (let i = 0; i < 25; i++) b.tick(0.02);    // past 11.4s
  assert.notEqual(b.state, 'dance', 'and ends after the finale');
});

// ------------------------------------------------------------ hunt geometry
test('hunt: the rearing paw cannot reach a HIGH hover — swats miss (dodge loop)', () => {
  const pawX = 426, pawY = 1000 - 104;                    // cat.html paw point
  const bf = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 0, rand: () => 0.5 });
  bf.x = 430; bf.y = 1000 - 180;                          // a HIGH hover position
  assert.equal(swatCatchable(bf, pawX, pawY), false, '180px up is out of the 54px paw radius');
  // within reach only when the butterfly truly dips to the paw
  bf.y = 1000 - 100;
  assert.equal(swatCatchable(bf, pawX, pawY), true, 'a dip inside ~54px of the paw connects');
  assert.ok(SWAT_RADIUS === 54, 'radius tightened 66 -> 54');
});

test('hunt: after a dodge the butterfly returns to the hunted hover near the cat', () => {
  const bf = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 0, rand: () => 0.3 });
  bf.x = 430; bf.y = 1000 - 120; bf.state = 'hunted';
  dodgeButterfly(bf, 400, 880, 0, () => 0);               // swat missed → dodge
  assert.equal(bf.state, 'flee');
  assert.ok(bf.climb > 0, 'the dodge carries a sharp climb');
  step(bf, 2.0, { t0: 0, catX: 410 });                    // flee window passes
  assert.equal(bf.state, 'hunted', 'back to the nervous hover (the cat is still there)');
  // but if the cat gave up and wandered off, it stays calm
  const bf2 = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 0, rand: () => 0.3 });
  bf2.x = 430; bf2.y = 1000 - 120; bf2.state = 'hunted';
  dodgeButterfly(bf2, 400, 880, 0, () => 0);
  step(bf2, 2.0, { t0: 0, catX: 2000 });                  // the cat is far away now
  assert.equal(bf2.state, 'cruise', 'free to cruise away once the hunt is over');
});

test('hunt: the dip cycle is deterministic — a full loop always enters paw reach', () => {
  // pin the exact swat geometry and simulate a hunt where the cat holds still
  const pawX = 426, pawY = 896;                           // 104px above ground 1000
  let connected = false;
  const bf = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 0, rand: () => 0.5 });
  bf.x = 430; bf.y = 900; bf.state = 'hunted';
  for (let i = 0; i < 160; i++) {                         // 8s at 50ms — two+ cycles
    tickButterfly(bf, { dt: 0.05, now: i * 0.05, lane: { x: 0, w: 1600 }, groundY: 1000, catX: 400 });
    if (swatCatchable(bf, pawX, pawY)) { connected = true; break; }
  }
  assert.equal(connected, true, 'within two dip cycles the butterfly comes into paw reach');
});
