// v314.test.mjs — the real-cat rearing swat (hind legs + front paws), the
// butterfly dodge, the execution-log ring buffer, and the hidden feedback
// "1234" unlock. Pure tests, no Electron.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnButterfly, tickButterfly, swatCatchable, dodgeButterfly,
  startleButterfly, SWAT_RADIUS,
} from '../src/butterfly.js';
import { CatBrain } from '../src/cat-brain.js';
import { createExecLog, normalizeEntry, EXEC_LOG_CAP_DEFAULT } from '../src/exec-log.js';
import { createSettings } from '../src/settings-store.js';

const memBackend = () => { let s = null; return { read: () => s, write: str => { s = str; } }; };

// ------------------------------------------------------------ exec-log core
test('exec-log: normalizeEntry validates and sanitizes', () => {
  const e = normalizeEntry({ src: 'cat', tag: 'hunt', msg: 'swat 1 missed', data: { paw: { x: 10, y: 20 } } }, 1, 12345);
  assert.equal(e.seq, 1);
  assert.equal(e.ts, 12345);
  assert.equal(e.src, 'cat');
  assert.equal(e.msg, 'swat 1 missed');
  assert.deepEqual(e.data, { paw: { x: 10, y: 20 } });
  // unknown src demoted, missing msg rejected, garbage rejected
  assert.equal(normalizeEntry({ src: 'nope', tag: 't', msg: 'x' }, 2).src, 'sys');
  assert.equal(normalizeEntry({ src: 'cat', msg: '' }, 3), null);
  assert.equal(normalizeEntry(null, 4), null);
});
// the line above documents the coercion: numeric msg becomes a real string
test('exec-log: numeric msg is stringified, not dropped', () => {
  const e = normalizeEntry({ src: 'main', tag: 't', msg: 42 }, 5);
  assert.equal(e.msg, '42');
});
test('exec-log: oversized msg truncated, huge data replaced', () => {
  const e = normalizeEntry({ tag: 't', msg: 'x'.repeat(999), data: { blob: 'y'.repeat(99999) } }, 6);
  assert.ok(e.msg.length <= 240);
  assert.deepEqual(e.data, { truncated: true });
  const circ = {}; circ.self = circ;   // JSON.stringify throws → unserializable
  const e2 = normalizeEntry({ tag: 't', msg: 'ok', data: circ }, 7);
  assert.deepEqual(e2.data, { unserializable: true });
});
test('exec-log: ring buffer caps at 600 and keeps the newest', () => {
  const log = createExecLog({});
  for (let i = 0; i < EXEC_LOG_CAP_DEFAULT + 50; i++) log.push({ tag: 't', msg: 'm' + i });
  assert.equal(log.size, EXEC_LOG_CAP_DEFAULT);
  const all = log.all();
  assert.equal(all[all.length - 1].msg, 'm' + (EXEC_LOG_CAP_DEFAULT + 49));
  assert.equal(all[0].msg, 'm50');   // oldest survivors
});
test('exec-log: subscribe receives live entries; since() filters by seq', () => {
  const log = createExecLog({});
  const seen = [];
  const off = log.subscribe(e => seen.push(e));
  log.push({ tag: 'a', msg: 'one' });
  log.push({ tag: 'a', msg: 'two' });
  assert.equal(seen.length, 2);
  off();
  log.push({ tag: 'a', msg: 'three' });
  assert.equal(seen.length, 2);   // unsubscribed
  const tail = log.since(seen[0].seq);
  assert.equal(tail.length, 2);   // two entries after seq of 'one'
  log.clear();
  assert.equal(log.size, 0);
});
test('exec-log: a throwing subscriber never breaks the log', () => {
  const log = createExecLog({});
  log.subscribe(() => { throw new Error('bad subscriber'); });
  const e = log.push({ tag: 't', msg: 'still logged' });
  assert.ok(e);
  assert.equal(log.size, 1);
});

// ------------------------------------------------------------ swat geometry
test('butterfly: swatCatchable uses the paw radius', () => {
  const bf = { x: 500, y: 800 };
  assert.equal(swatCatchable(bf, 500, 800), true);
  assert.equal(swatCatchable(bf, 500 + SWAT_RADIUS - 1, 800), true);
  assert.equal(swatCatchable(bf, 500 + SWAT_RADIUS + 12, 800), false);
  assert.equal(swatCatchable(bf, 500, 800 - (SWAT_RADIUS + 5)), false);
  assert.equal(swatCatchable(null, 0, 0), false);
  assert.equal(swatCatchable({ x: NaN, y: 0 }, 0, 0), false);
});
test('butterfly: dodge sends it away from the paw with a climb jink', () => {
  const bf = { x: 500, y: 800, state: 'hunted', vx: 0 };
  const now = 100;
  dodgeButterfly(bf, 480, 900, now, () => 0.5);
  assert.equal(bf.state, 'flee');
  assert.ok(bf.vx > 290, 'darts away from the paw at speed');       // away = +x
  assert.ok(bf.climb >= 150, 'sharp upward jink');
  assert.ok(bf.fleeUntil > now + 0.85 && bf.fleeUntil < now + 1.4);
  // a paw on the other side flips the escape direction
  const bf2 = { x: 500, y: 800, state: 'hunted', vx: 0 };
  dodgeButterfly(bf2, 520, 900, now, () => 0.5);
  assert.ok(bf2.vx < -290);
});
test('butterfly: the dodge climb decays and never breaks the ceiling', () => {
  const lane = { x: 0, w: 100000 };   // huge lane — the dodge cannot cull here
  const bf = spawnButterfly({ lane, catX: 60000, groundY: 1000, now: 0, rand: () => 0.4 });
  bf.x = 50000;   // mid-lane: spawn sits 30px past the edge, the dodge must not cull
  dodgeButterfly(bf, 60000, 900, 10, () => 0.9);
  const climb0 = bf.climb;
  let t = 10;
  for (let i = 0; i < 16; i++) {          // 0.8s — still inside the flee window
    t += 0.05;
    assert.equal(tickButterfly(bf, { dt: 0.05, now: t, lane, groundY: 1000, catX: 99999 }), null);
  }
  assert.ok(bf.climb < climb0 * 0.25, 'climb decays');
  bf.y = 660;   // force above the ceiling — the flee tick must clamp it back
  t += 0.05;
  tickButterfly(bf, { dt: 0.05, now: t, lane, groundY: 1000, catX: 99999 });
  assert.ok(bf.y >= 1000 - 320 - 0.5, 'butterfly respects the flight ceiling while fleeing');
});
test('butterfly: startle still works alongside the dodge (pounce path)', () => {
  const bf = { x: 500, y: 800, state: 'hunted', vx: 0 };
  startleButterfly(bf, 600, 50, () => 0.5);
  assert.equal(bf.state, 'flee');
  assert.ok(bf.vx < 0);   // away from fromX=600 → left
});

// ------------------------------------------------------------ brain: the rear
function makeBrain(events) {
  const b = new CatBrain({
    bounds: { x: 0, y: 0, w: 1600, h: 1000 },
    groundY: 950,
    onEvent: ev => events.push(ev),
    rand: () => 0.5,
  });
  b.onPlatform = null;
  b.speed = 55; b.runSpeed = 150;
  return b;
}
test('brain: a close butterfly hunt REARS onto the hind legs (not pounce)', () => {
  const events = [];
  const b = makeBrain(events);
  b.startStalk(700, 900, 'butterfly');
  assert.equal(b.state, 'stalk');
  // aim phase 0.8s, then creep the ~45px gap, then the rear
  let t = 0;
  for (let i = 0; i < 400 && b.state !== 'rear'; i++) { b.tick(0.02); t += 0.02; }
  assert.equal(b.state, 'rear', 'rears up when in paw reach');
  assert.ok(events.includes('butterfly:rear'));
  assert.ok(t < 4, `rear arrives promptly (t=${t.toFixed(2)}s)`);
});
test('brain: two swat events fire per rear, then it drops back to stalk', () => {
  const events = [];
  const b = makeBrain(events);
  b.startStalk(700, 900, 'butterfly');
  for (let i = 0; i < 400 && b.state !== 'rear'; i++) b.tick(0.02);
  const swats = () => events.filter(e => e === 'rear:swat').length;
  // rear is 1.7s; swats at 0.55 and 1.05
  for (let i = 0; i < 32; i++) b.tick(0.02);          // 0.64s
  assert.equal(swats(), 1, 'first paw swipe at ~0.55s');
  for (let i = 0; i < 25; i++) b.tick(0.02);          // +0.50s
  assert.equal(swats(), 2, 'second paw swipe at ~1.05s');
  for (let i = 0; i < 60 && b.state === 'rear'; i++) b.tick(0.02);
  assert.notEqual(b.state, 'rear', 'rear ends');
  assert.equal(b.state, 'stalk', 'still hunting — back on all fours');
});
test('brain: when the prey escapes the paw zone mid-rear, the cat drops and chases', () => {
  const b = makeBrain([]);
  b.startStalk(700, 900, 'butterfly');
  for (let i = 0; i < 400 && b.state !== 'rear'; i++) b.tick(0.02);
  assert.equal(b.state, 'rear');
  b.moveStalk(b.x + 400, 900);   // the butterfly darts far away
  b.tick(0.02);
  assert.equal(b.state, 'stalk', 'drops to all fours and chases');
});
test('brain: cursor stalks keep the classic pounce (no rear)', () => {
  const events = [];
  const b = makeBrain(events);
  b.startStalk(700, 900, 'cursor');
  for (let i = 0; i < 400 && b.state !== 'pounce'; i++) b.tick(0.02);
  assert.equal(b.state, 'pounce');
  assert.ok(!events.includes('butterfly:rear'));
});
test('brain: pose exposes stateT for the rear/swat animation phase', () => {
  const b = makeBrain([]);
  b.startStalk(700, 900, 'butterfly');
  for (let i = 0; i < 400 && b.state !== 'rear'; i++) b.tick(0.02);
  const p = b.pose;
  assert.equal(p.state, 'rear');
  assert.ok(p.stateT >= 0 && p.stateT < 1.71);
  assert.ok(Math.abs(p.stateDur - 1.7) < 0.01);
});

// ------------------------------------------------------------ hidden unlock
test('settings: execLogUnlocked can only ever be true (feedback latch)', () => {
  const store = createSettings(memBackend());
  assert.equal(store.get('execLogUnlocked'), false);
  assert.equal(store.set('execLogUnlocked', true), true);
  assert.equal(store.get('execLogUnlocked'), true);
  // garbage stays boolean
  store.set('execLogUnlocked', 'yes');
  assert.equal(store.get('execLogUnlocked'), true);
});
test('settings: feedbackList is sanitized (capped, sliced fields)', () => {
  const store = createSettings(memBackend());
  const items = Array.from({ length: 60 }, (_, i) => ({ message: 'm'.repeat(3000) + i, contact: 'c'.repeat(300), rating: 9, ts: i }));
  store.set('feedbackList', items);
  const list = store.get('feedbackList');
  assert.equal(list.length, 50);
  assert.ok(list[0].message.length <= 2000);
  assert.equal(list[0].rating, 5);
  assert.ok(list.every(f => typeof f.ts === 'number' && typeof f.contact === 'string'));
  // junk entries dropped
  store.set('feedbackList', [{ nope: true }, { message: 'real one' }]);
  assert.deepEqual(store.get('feedbackList').map(f => f.message), ['real one']);
});
