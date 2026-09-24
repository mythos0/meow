// v313.test.mjs — butterfly state machine + hunt/catch geometry + brain
// stalk kinds + the mid-air drop fall + the butterflies stat. Pure tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnButterfly, tickButterfly, butterflyCatchable, startleButterfly,
  HUNT_RADIUS, CATCH_DX, CATCH_DY,
} from '../src/butterfly.js';
import { CatBrain } from '../src/cat-brain.js';
import { createSettings } from '../src/settings-store.js';

const memBackend = () => { let s = null; return { read: () => s, write: str => { s = str; } }; };

function step(bf, secs, opts = {}) {
  let t = opts.t0 ?? 100;
  let culled = null;
  for (let i = 0; i < Math.round(secs / (opts.dt ?? 0.05)); i++) {
    t += opts.dt ?? 0.05;
    culled = tickButterfly(bf, {
      dt: opts.dt ?? 0.05, now: t,
      lane: opts.lane ?? { x: 0, w: 1600 },
      groundY: opts.groundY ?? 1000,
      catX: opts.catX,
    });
    if (culled) break;
  }
  return culled;
}

// ------------------------------------------------------------ spawn
test('butterfly spawns relative to the CURRENT lane, not the primary', () => {
  // a lane parked fully on the 2nd monitor (1600..3200)
  const bf = spawnButterfly({ lane: { x: 1600, w: 1600 }, catX: 2000, groundY: 992, now: 10, rand: () => 0.1 });
  assert.ok(bf.x > 1600 - 70 && bf.x < 3200 + 70, `spawned inside/near the lane, got ${bf.x}`);
  // cat in the LEFT half of the lane -> enters from the left edge moving right
  assert.ok(bf.x < 1700 && bf.vx > 0, `entered from the nearer (left) edge: x=${bf.x} vx=${bf.vx}`);
});

test('butterfly enters from the RIGHT edge when the cat is in the right half', () => {
  const bf = spawnButterfly({ lane: { x: 1600, w: 1600 }, catX: 3000, groundY: 992, now: 10, rand: () => 0.1 });
  assert.ok(bf.x > 3150, `entered from the right edge, got ${bf.x}`);
  assert.ok(bf.vx < 0, 'flying left, toward the cat');
});

test('a cruising butterfly crosses the lane and is culled past its far edge', () => {
  const bf = spawnButterfly({ lane: { x: 0, w: 800 }, catX: 400, groundY: 1000, now: 10, rand: () => 0.1 });
  const culled = step(bf, 60, { t0: 10 });   // ~58px/s for 60s covers 800+ px
  assert.equal(culled, 'culled', 'the butterfly leaves the lane and is culled');
  assert.ok(bf.x > 800, `culled beyond the lane's right edge, got ${bf.x}`);
});

test('a hunted butterfly dips into pounce reach and flutters around the hunter', () => {
  const bf = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 10, rand: () => 0.1 });
  bf.x = 520; bf.y = 1000 - 200; bf.state = 'hunted';
  step(bf, 3, { t0: 10, catX: 400 });
  assert.ok(bf.y > 1000 - 130 && bf.y < 1000 - 50, `dipped to reach, got y=${bf.y.toFixed(0)} (ground 1000)`);
  assert.ok(Math.abs(bf.x - 400) < 220, `stays around the hunter, got x=${bf.x.toFixed(0)}`);
});

test('a startled butterfly flees away from the cat and climbs', () => {
  const bf = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 10, rand: () => 0.1 });
  bf.x = 500; bf.y = 1000 - 80;
  startleButterfly(bf, 400, 10, () => 0);
  assert.equal(bf.state, 'flee');
  assert.ok(bf.vx > 0, 'flees to the right, away from the cat at 400');
  const y0 = bf.y;
  step(bf, 0.5, { t0: 10 });
  assert.ok(bf.y < y0, 'climbs while fleeing');
  assert.equal(bf.state, 'flee', 'still fleeing inside the flee window');
});

// ------------------------------------------------------------ catch geometry
test('butterflyCatchable: within reach horizontally AND not too high', () => {
  const cat = { x: 500, baseY: 1000 };
  assert.equal(butterflyCatchable({ x: 560, y: 900 }, cat), true, '60px ahead, 100px up');
  assert.equal(butterflyCatchable({ x: 500, y: 1000 - CATCH_DY }, cat), true, 'exactly at the reach ceiling');
  assert.equal(butterflyCatchable({ x: 500, y: 1000 - CATCH_DY - 1 }, cat), false, 'too high to reach');
  assert.equal(butterflyCatchable({ x: 500 + CATCH_DX + 1, y: 900 }, cat), false, 'too far ahead');
  assert.equal(butterflyCatchable({ x: 500, y: 1000 + 60 }, cat), false, 'way below the feet');
});

test('HUNT_RADIUS gates the notice distance', () => {
  assert.equal(HUNT_RADIUS > 250 && HUNT_RADIUS < 500, true);
});

// ------------------------------------------------------------ brain: stalk kinds
test('startStalk tags the prey kind and moveStalk retargets it', () => {
  const b = new CatBrain({ bounds: { x: 0, y: 0, w: 1600, h: 1000 }, groundY: 992 });
  assert.equal(b.startStalk(800, 900), true);
  assert.equal(b.stalk.kind, 'cursor', 'default kind is the cursor');
  b.stopStalk();
  assert.equal(b.startStalk(800, 900, 'butterfly'), true);
  assert.equal(b.stalk.kind, 'butterfly');
  assert.equal(b.state, 'stalk');
  b.moveStalk(700, 880);
  assert.equal(b.stalk.x, 700);
});

test('a butterfly stalk IS auto-pounced when the prey comes in range (tag survives)', () => {
  const b = new CatBrain({ bounds: { x: 0, y: 0, w: 1600, h: 1000 }, groundY: 992 });
  b.startStalk(800, 900, 'butterfly');
  b.moveStalk(b.x + 30, 900);   // within pounce range
  for (let i = 0; i < 12 && b.state === 'stalk'; i++) b.tick(0.1);   // past the 0.8s aim phase
  assert.equal(b.state, 'pounce');
  assert.equal(b.stalk && b.stalk.kind, 'butterfly', 'the tag survives into the pounce (cat.html resolves the catch)');
});

test('stalkBoost speeds up the hunt creep', () => {
  const mk = boost => {
    const b = new CatBrain({ bounds: { x: 0, y: 0, w: 1600, h: 1000 }, groundY: 992, speed: 55 });
    b.startStalk(b.x + 200, 992, 'butterfly');
    b.stalkBoost = boost;
    for (let i = 0; i < 9; i++) b.tick(0.1);   // through the 0.8s aim phase
    const x0 = b.x;
    for (let i = 0; i < 5; i++) b.tick(0.1);   // creep phase (dt clamps to 0.1)
    return Math.abs(b.x - x0);
  };
  const plain = mk(1);
  const boosted = mk(2.3);
  assert.ok(plain > 10, `plain creep moves at all: ${plain.toFixed(1)}px`);
  assert.ok(boosted > plain * 1.8, `boosted creep ${boosted.toFixed(1)}px should far exceed plain ${plain.toFixed(1)}px`);
});

// ------------------------------------------------------------ brain: mid-air drop
test('dropAt in mid-air with no window below animates a fall to the ground', () => {
  const b = new CatBrain({ bounds: { x: 0, y: 0, w: 1600, h: 1000 }, groundY: 992 });
  b.dropAt(800, 600);   // 392px above the ground, no platforms
  assert.equal(b.state, 'jump', 'the fall is an animated jump arc');
  assert.equal(b._jump.y1, 992, 'falls all the way to the ground');
  assert.equal(b.onPlatform, null);
  let guard = 0;
  while (b.state === 'jump' && guard++ < 80) b.tick(0.05);
  assert.equal(b.baseY, 992, 'lands on the ground, not floating');
  assert.equal(b.state !== 'jump', true);
});

test('dropAt near the ground still lands exactly where released', () => {
  const b = new CatBrain({ bounds: { x: 0, y: 0, w: 1600, h: 1000 }, groundY: 992 });
  b.dropAt(800, 975);   // 17px above ground — inside the snap band
  assert.equal(b.state, 'idle');
  assert.equal(b.baseY, 975, 'no fall for a near-ground release');
});

test('dropAt onto a window top still lands on the window', () => {
  const b = new CatBrain({ bounds: { x: 0, y: 0, w: 1600, h: 1000 }, groundY: 992 });
  const pl = { x: 700, y: 700, w: 300, h: 200, id: 7 };
  b.setPlatforms([pl]);
  b.dropAt(850, 702);
  assert.equal(b.onPlatform, pl, 'the window catches the drop');
  assert.equal(b.baseY, 700);
});

test('a jump cancelled mid-flight lands at its destination, never stranded mid-air', () => {
  const b = new CatBrain({ bounds: { x: 0, y: 0, w: 1600, h: 1000 }, groundY: 992 });
  const pl = { x: 700, y: 700, w: 300, h: 200, id: 7 };
  b.setPlatforms([pl]);
  b._jumpTo(pl, 1.2);            // mid-flight…
  assert.equal(b.state, 'jump');
  assert.ok(b._jump);
  b.pet();                       // …cancelled by an interaction
  assert.equal(b.state, 'happy');
  assert.equal(b._jump, null, 'the dead arc is cleared, not stranded');
  assert.equal(b.baseY, 700, 'the feet land on the arc destination (no mid-air freeze)');
  assert.equal(b.onPlatform, pl, 'a cancelled platform jump still lands on the platform');
  // and a plain in-place hop afterwards uses a FRESH arc (no replay of the old one)
  b._enter('jump', 0.75);
  assert.equal(b._jump, null);
  for (let i = 0; i < 12 && b.state === 'jump'; i++) b.tick(0.1);
  assert.equal(b.baseY, 700, 'stands where it landed, no stale arc replay');
});

// ------------------------------------------------------------ store: butterflies stat
test('the butterflies stat is a first-class counter', () => {
  const store = createSettings(memBackend());
  assert.equal(store.get('stats').butterflies, 0);
  assert.equal(store.bumpStat('butterflies', 1), 1);
  assert.equal(store.bumpStat('butterflies', 2), 3);
  assert.equal(store.get('stats').butterflies, 3);
});
