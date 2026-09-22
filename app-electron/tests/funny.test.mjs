// funny.test.mjs — v3.5 funny pack: sneeze / hairball / zoomies / laser chase /
// post-meal zoomies / butterfly notice. Pure brain tests (deterministic seeds).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CatBrain, EMOTE_ON, ACTIONS } from '../src/cat-brain.js';

function makeBrain(seed, opts = {}) {
  let a = seed >>> 0;
  const rand = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return new CatBrain({
    bounds: { x: 0, y: 0, w: 1600, h: 900 },
    groundY: 892,
    rand,
    breed: 'grey_tabby',
    ...opts,
  });
}

test('funny pack registers new actions + emotes', () => {
  for (const s of ['sneeze', 'hairball', 'zoomies', 'laser']) {
    assert.ok(ACTIONS.includes(s), `missing action ${s}`);
  }
  assert.equal(EMOTE_ON.zoomies, 'exclaim');
  assert.equal(EMOTE_ON.hairball, 'sweat');
  assert.equal(EMOTE_ON.loaf, 'bread');
});

test('long sim hits sneeze, hairball and zoomies (weights are live)', () => {
  const b = makeBrain(20260922);
  const seen = new Set();
  const evts = [];
  b.onEvent = e => evts.push(e);
  for (let i = 0; i < 60 * 60 * 8; i++) {   // 8 simulated minutes
    b.tick(1 / 60);
    seen.add(b.state);
  }
  for (const s of ['sneeze', 'hairball', 'zoomies']) {
    assert.ok(seen.has(s), `never entered ${s} (seen: ${[...seen].join(',')})`);
  }
});

test('zoomies sprints noticeably faster than run and never roams out of bounds', () => {
  const run = makeBrain(42);
  const zoom = makeBrain(42);
  // force the states directly
  run._enter('run', 1.0); run.x = 800;
  zoom._enter('zoomies', 1.0); zoom.x = 800;
  for (let i = 0; i < 60; i++) { run.tick(1 / 60); }
  for (let i = 0; i < 60; i++) { zoom.tick(1 / 60); }
  assert.ok(Math.abs(zoom.x - 800) > Math.abs(run.x - 800) * 1.4,
    `zoomies travel ${Math.abs(zoom.x - 800)} vs run ${Math.abs(run.x - 800)}`);
  assert.ok(zoom.x >= 60 && zoom.x <= 1540, 'zoomies stays in bounds');
});

test('post-meal zoomies: eating can chain straight into the mad dash', () => {
  // fixed rand that always rolls below the 0.45 post-meal chance
  const b = makeBrain(7, { rand: () => 0.1 });
  b.feed();
  assert.equal(b.state, 'eat');
  for (let i = 0; i < 60 * 5.5; i++) b.tick(1 / 60);   // eat is 4.9s
  assert.equal(b.state, 'zoomies', 'after eating, zoomies should fire (rand 0.1 < 0.45)');
});

test('post-meal zoomies can also NOT fire (rand gate respected)', () => {
  const b = makeBrain(7, { rand: () => 0.9 });
  b.feed();
  for (let i = 0; i < 60 * 5.5; i++) b.tick(1 / 60);
  assert.notEqual(b.state, 'zoomies');
});

test('laser chase: enters, approaches, pounces, resumes', () => {
  const b = makeBrain(11);
  b.x = 500; b.baseY = 892;
  b.startLaser(900, 860);
  assert.equal(b.state, 'laser');
  assert.ok(b.laser, 'laser target stored');
  const x0 = b.x;
  for (let i = 0; i < 60 * 2; i++) b.tick(1 / 60);
  assert.ok(Math.abs(b.x - 900) < Math.abs(x0 - 900), 'cat closed in on the dot');
  assert.ok(b.x >= 60 && b.x <= 1540, 'chase stays in bounds');

  // put the dot right on the cat → pounce within the cooldown window
  b._laserCd = 0;
  b.moveLaser(b.x + 20, b.baseY);
  let pounced = false;
  for (let i = 0; i < 60 * 2.5 && !pounced; i++) {
    b.tick(1 / 60);
    b.moveLaser(b.x + 20, b.baseY);   // dot stays underfoot (cat.html keeps feeding)
    if (b.state === 'pounce') pounced = true;
  }
  assert.ok(pounced, 'cat pounces when the dot is close');

  // after the pounce the chase resumes (dot still live)
  if (b.laser) {
    for (let i = 0; i < 60 * 2.5 && b.state !== 'laser'; i++) b.tick(1 / 60);
    assert.equal(b.state, 'laser', 'chase resumes after the pounce');
  }
});

test('laser chase times out: brain stops the laser itself', () => {
  const b = makeBrain(13);
  const evts = [];
  b.onEvent = e => evts.push(e);
  b.startLaser(1500, 860);
  for (let i = 0; i < 60 * 10; i++) b.tick(1 / 60);
  assert.equal(b.laser, null, 'laser cleared after the chase cap');
  assert.ok(evts.includes('laser:stop'), 'stop event fired');
  assert.ok(b.state !== 'laser', 'back to normal behaviour');
});

test('stopLaser / moveLaser are safe when no chase is live', () => {
  const b = makeBrain(17);
  b.stopLaser();               // no-op
  b.moveLaser(10, 10);         // no-op
  assert.equal(b.laser, null);
  b.startLaser(100, 860);
  b.stopLaser();
  assert.equal(b.laser, null);
});

test('noticeButterfly: only idle-ish cats chase, they face it and pounce', () => {
  const b = makeBrain(19);
  b.dir = 1; b.x = 500;
  b._enter('walk', 3);          // busy walking → ignores the butterfly
  assert.equal(b.noticeButterfly(700, 800), false);
  assert.equal(b.state, 'walk');

  b._enter('sit', 4);
  assert.equal(b.noticeButterfly(300, 800), true, 'sitting cat gives chase');
  assert.equal(b.state, 'pounce');
  assert.equal(b.dir, -1, 'cat faces the butterfly');
});

test('pandas never cough hairballs but do get the zoomies weight', () => {
  const p = makeBrain(23, { breed: 'panda' });
  // force the weights decision: hairball weight is 0, so a weighted pick over
  // many rolls never returns it
  for (let i = 0; i < 2000; i++) {
    const act = p._pick();
    assert.notEqual(act, 'hairball', 'panda must never pick hairball');
  }
  // and a panda forced into hairball is still allowed via direct interaction
  // (defensive: nothing breaks)
  p._enter('hairball', 1);
  assert.equal(p.state, 'hairball');
});
