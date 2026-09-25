// brain-v36.test.mjs — v3.6 brain features: new states, biases, zones
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CatBrain, mulberry32 } from '../src/cat-brain.js';

function mkBrain(seed = 7, over = {}) {
  return new CatBrain({
    bounds: { x: 0, y: 0, w: 1920, h: 1080 },
    groundY: 1040,
    rand: mulberry32(seed),
    ...over,
  });
}

describe('v3.6 brain: stalk', () => {
  test('stalk aims, creeps toward the cursor and pounces close in', () => {
    const b = mkBrain();
    b.x = 400;
    b.startStalk(560, 1030);
    assert.equal(b.state, 'stalk');
    // aim phase ~0.8s: no movement yet
    for (let i = 0; i < 40; i++) b.tick(0.02);
    const xAfterAim = b.x;
    // creep phase
    for (let i = 0; i < 300 && b.state === 'stalk'; i++) b.tick(0.016);
    assert.ok(b.state === 'pounce' || b.state === 'stalk', 'state=' + b.state);
    assert.ok(b.x > xAfterAim, 'crept toward the cursor');
    b.stopStalk();
    assert.equal(b.stalk, null);
  });
  test('cursor dashing far away aborts the stalk', () => {
    const b = mkBrain();
    b.startStalk(500, 1000);
    for (let i = 0; i < 5; i++) b.tick(0.1);
    b.moveStalk(1800, 400);   // way out of reach
    for (let i = 0; i < 10; i++) b.tick(0.1);
    assert.equal(b.stalk, null);
  });
  test('stalk state expires (hard cap)', () => {
    const b = mkBrain();
    b.startStalk(500, 1000);
    b.stalk.x = b.x + 100;
    for (let i = 0; i < 90; i++) b.tick(0.1);   // > 7s cap
    assert.equal(b.stalk, null);
  });
});

describe('v3.6 brain: music bop', () => {
  test('setMusic(true) enters bop and stays until stopped', () => {
    const b = mkBrain();
    b.setMusic(true);
    assert.equal(b.state, 'bop');
    assert.equal(b.musicOn, true);
    for (let i = 0; i < 300; i++) b.tick(0.02);
    assert.equal(b.state, 'bop', 'keeps bopping while music plays');
    b.setMusic(false);
    for (let i = 0; i < 300; i++) b.tick(0.02);
    assert.notEqual(b.state, 'bop');
  });
  test('bop resumes after other actions while music on', () => {
    const b = mkBrain();
    b.setMusic(true);
    b.dance();                     // manual dance interrupts
    assert.equal(b.state, 'dance');
    for (let i = 0; i < 500; i++) b.tick(0.02);   // 10s — past the v3.15 8.6s full routine
    assert.equal(b.state, 'bop', 'returns to bop after the dance');
  });
});

describe('v3.6 brain: investigate + sniff', () => {
  test('curious cats walk to the new window and sniff', () => {
    const b = mkBrain();
    b.x = 300;
    assert.equal(b.investigate(900), true);
    assert.equal(b.state, 'investigate');
    for (let i = 0; i < 900 && b.state === 'investigate'; i++) b.tick(0.016);
    assert.equal(b.state, 'sniff');
    assert.ok(Math.abs(b.x - 900) <= 44, 'arrived at target');
    assert.equal(b.emote.kind, 'question');
  });
  test('busy cats (sleep) refuse to investigate', () => {
    const b = mkBrain();
    b._enter('sleep', 10);
    assert.equal(b.investigate(900), false);
  });
  test('sniff ends and normal life resumes', () => {
    const b = mkBrain();
    b.x = 900;
    b.investigate(900);
    b.tick(0.02);   // arrives
    for (let i = 0; i < 400; i++) b.tick(0.016);
    assert.notEqual(b.state, 'sniff');
  });
});

describe('v3.6 brain: battery curl', () => {
  test('low battery -> curl and stay curled', () => {
    const b = mkBrain();
    b.setBatteryLow(true);
    assert.equal(b.state, 'curl');
    for (let i = 0; i < 400; i++) b.tick(0.02);
    assert.equal(b.state, 'curl');
  });
  test('plugged in -> normal life', () => {
    const b = mkBrain();
    b.setBatteryLow(true);
    for (let i = 0; i < 5; i++) b.tick(0.02);
    b.setBatteryLow(false);
    for (let i = 0; i < 3200; i++) b.tick(0.02);   // > 60s of normal life
    assert.notEqual(b.state, 'curl');
  });
});

describe('v3.6 brain: mope / nuzzle / celebrate / greet', () => {
  test('mopeNow enters mope', () => {
    const b = mkBrain();
    b.mopeNow();
    assert.equal(b.state, 'mope');
    assert.equal(b.emote.kind, 'sad');
  });
  test('nuzzleNow faces a direction', () => {
    const b = mkBrain();
    b.nuzzleNow(-1);
    assert.equal(b.state, 'nuzzle');
    assert.equal(b.dir, -1);
    assert.equal(b.emote.kind, 'heart');
  });
  test('celebrate + greet emote', () => {
    const b = mkBrain();
    b.celebrate();
    assert.equal(b.emote.kind, 'star');
    b.greet();
    assert.equal(b.emote.kind, 'heart');
  });
});

describe('v3.6 brain: time bias + stress', () => {
  test('night bias makes sleep much more likely than day', () => {
    const pick = mode => {
      let sleepy = 0;
      for (let i = 0; i < 400; i++) {
        const b2 = mkBrain(1000 + i);
        b2.setTimeBias(mode);
        const act = b2._pick();
        if (['sleep', 'yawn'].includes(act)) sleepy++;
      }
      return sleepy;
    };
    const night = pick('night');
    const day = pick('day');
    assert.ok(night > day * 2, `night=${night} should exceed day=${day} x2`);
  });
  test('night slows the walk', () => {
    const b = mkBrain();
    b.setTimeBias('night');
    assert.ok(b._speedFactor() < 1);
    b.setTimeBias('day');
    assert.equal(b._speedFactor(), 1);
  });
  test('stress enters startle, boosts speed, expires', () => {
    const b = mkBrain();
    b.setStress(true, 2000);
    assert.equal(b.state, 'startle');
    assert.equal(b.stressed, true);
    assert.ok(b._speedFactor() > 1);
    for (let i = 0; i < 400; i++) b.tick(0.02);
    assert.equal(b.stressed, false);
    assert.equal(b._speedFactor(), 1);
  });
});

describe('v3.6 brain: no-walk zones', () => {
  test('stroll never enters a zone', () => {
    const b = mkBrain();
    b.x = 200; b.dir = 1;                        // spawn OUTSIDE the zone
    b.setNoWalkZones([{ x: 700, y: 900, w: 300, h: 140 }]);
    b._enter('walk', 60);
    for (let i = 0; i < 3000; i++) b.tick(0.016);
    const body = b.x;
    assert.ok(body < 640 || body > 1060, `x=${body} inside blocked band`);
  });
  test('platforms inside a zone are filtered out', () => {
    const b = mkBrain();
    b.setNoWalkZones([{ x: 500, y: 700, w: 200, h: 30 }]);
    b.setPlatforms([
      { x: 520, y: 700, w: 400, h: 300 },
      { x: 0, y: 700, w: 400, h: 300 },
    ]);
    assert.equal(b.platforms.length, 1);
    assert.equal(b.platforms[0].x, 0);
  });
  test('goToPlatform jumps onto a known window', () => {
    const b = mkBrain();
    const pl = { x: 400, y: 700, w: 500, h: 300 };
    b.setPlatforms([pl]);
    assert.equal(b.goToPlatform({ x: 400, y: 700, w: 500, h: 300 }), true);
    assert.equal(b.state, 'jump');
    assert.equal(b.napRequested, true);
    // after landing, cozy bias kicks in
    for (let i = 0; i < 120; i++) b.tick(0.016);
    assert.equal(b.onPlatform, b.platforms[0]);
    for (let i = 0; i < 200; i++) b.tick(0.02);
    assert.ok(['loaf', 'sit'].includes(b.state), 'state=' + b.state);
  });
  test('goToPlatform returns false for unknown windows', () => {
    const b = mkBrain();
    assert.equal(b.goToPlatform({ x: 10, y: 10, w: 100, h: 100 }), false);
  });
});
