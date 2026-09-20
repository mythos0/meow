// platforms.test.mjs — v3.1 window-top hopping: jump onto ANY nearby window's
// top border, walk along it, hop between windows, return to the ground.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CatBrain, mulberry32 } from '../src/cat-brain.js';

const WIN = { x: 0, y: 0, w: 1920, h: 1080 };

function mkBrain(seed = 42, over = {}) {
  return new CatBrain({
    bounds: WIN,
    groundY: 1040,
    rand: mulberry32(seed),
    roam: false,          // deterministic legacy gaits (roam tested separately)
    ...over,
  });
}

// run until predicate or maxTicks; returns true if reached
function until(b, pred, maxTicks = 3000, dt = 1 / 60) {
  for (let i = 0; i < maxTicks; i++) {
    b.tick(dt);
    if (pred()) return true;
  }
  return false;
}

describe('platform hopping (window top borders)', () => {
  test('setPlatforms filters invalid rects', () => {
    const b = mkBrain();
    b.setPlatforms([
      { x: 100, y: 300, w: 800, h: 600 },   // ok
      { x: 0, y: 0, w: 50, h: 50 },          // too small
      null, 'x',
      { x: 10, y: 9000, w: 800, h: 600 },    // off-screen
    ]);
    assert.equal(b.platforms.length, 1);
  });

  test('walking near a window makes the cat jump onto its top border', () => {
    const b = mkBrain(11);
    const pl = { x: 800, y: 700, w: 600, h: 300 };
    b.setPlatforms([pl]);
    b.x = 700; // just left of the window, walking right
    b._enter('walk', 60);
    b.dir = 1;
    const reached = until(b, () => b.state === 'jump' && b._jump, 1200);
    assert.ok(reached, 'brain started a directed jump');
    // lands exactly on the top border
    const landed = until(b, () => b.state !== 'jump', 400);
    assert.ok(landed);
    assert.equal(b.onPlatform, pl);
    assert.equal(b.baseY, pl.y, 'feet on the window top border');
    assert.equal(b.pose.y, pl.y);
  });

  test('cat walks along the window top, clamped to its span, then leaves', () => {
    const b = mkBrain(5);
    const pl = { x: 500, y: 600, w: 400, h: 300 };
    b.setPlatforms([pl]);
    b.onPlatform = pl;
    b.baseY = pl.y;
    b.x = 560;                    // inside the span, left portion
    b._enter('walk', 30);
    b.dir = 1;
    let onTopTicks = 0;
    for (let i = 0; i < 600; i++) {
      b.tick(1 / 60);
      if (b.onPlatform === pl) {
        onTopTicks++;
        assert.ok(b.x >= pl.x + 29 && b.x <= pl.x + pl.w - 29,
          `x=${b.x} must stay within [${pl.x + 29}, ${pl.x + pl.w - 29}] while on top`);
        assert.equal(b.baseY, pl.y, 'feet stay on the border');
      }
    }
    assert.ok(onTopTicks > 60, `spent real time on top (${onTopTicks} ticks)`);
  });

  test('cat leaves the platform and returns to the ground', () => {
    const b = mkBrain(7);
    const pl = { x: 500, y: 600, w: 300, h: 300 };
    b.setPlatforms([pl]);
    b.onPlatform = pl;
    b.baseY = pl.y;
    b.platformT = 99;             // force leave on the next walk tick
    b._enter('walk', 30);
    b.dir = 1;
    const left = until(b, () => b.state !== 'jump' && b.onPlatform === null, 1200);
    assert.ok(left, 'platform was left');
    assert.equal(b.baseY, 1040, 'back on the ground');
  });

  test('hops between two neighbouring window tops', () => {
    const b = mkBrain(21);
    b.rand = () => 0.1;           // deterministic: always attempt the neighbor hop
    const a = { x: 200, y: 700, w: 400, h: 300 };
    const c = { x: 900, y: 700, w: 400, h: 300 };
    b.setPlatforms([a, c]);
    b.onPlatform = a;
    b.baseY = a.y;
    b.x = 560;                    // near a's right edge, walking right
    b._enter('walk', 30);
    b.dir = 1;
    const landedOnC = until(b, () => b.state !== 'jump' && b.onPlatform === c, 2400);
    assert.ok(landedOnC, 'hopped from window A to window C');
    assert.equal(b.baseY, c.y);
  });

  test('window too high / too far is never attempted', () => {
    const b = mkBrain(3);
    b.setPlatforms([{ x: 100, y: 100, w: 600, h: 80 }]); // 940px up — out of reach
    b.x = 150;
    b._enter('walk', 60);
    b.dir = 1;
    let jumped = false;
    for (let i = 0; i < 1200; i++) {
      b.tick(1 / 60);
      if (b._jump) { jumped = true; break; }
    }
    assert.equal(jumped, false, 'out-of-reach window ignored');
  });

  test('disappearing window drops the cat back to the ground', () => {
    const b = mkBrain();
    const pl = { x: 500, y: 600, w: 400, h: 300 };
    b.setPlatforms([pl]);
    b.onPlatform = pl;
    b.baseY = pl.y;
    b.setPlatforms([]);           // window closed
    assert.equal(b.onPlatform, null);
    assert.equal(b.baseY, 1040);
  });

  test('dropAt snaps to a window top under the cat', () => {
    const b = mkBrain();
    const pl = { x: 500, y: 600, w: 400, h: 300 };
    b.setPlatforms([pl]);
    b.dropAt(700, 608);           // dragged near the top border
    assert.equal(b.onPlatform, pl);
    assert.equal(b.baseY, pl.y);
    b.dropAt(700, 1000);          // dragged low → ground
    assert.equal(b.onPlatform, null);
    assert.equal(b.baseY, 1000);
  });

  test('panda brain picks panda actions (waddle/bamboo/roll) over walk', () => {
    const panda = mkBrain(9, { breed: 'panda' });
    const cat = mkBrain(9, { breed: 'grey_tabby' });
    // force both through many action selections
    let pandaHas = false;
    for (let i = 0; i < 400; i++) {
      panda._nextAction();
      if (['waddle', 'bamboo', 'roll'].includes(panda.state)) pandaHas = true;
    }
    assert.ok(pandaHas, 'panda uses panda actions');
    let catHas = false;
    for (let i = 0; i < 400; i++) {
      cat._nextAction();
      if (cat.state === 'walk') catHas = true;
    }
    assert.ok(catHas, 'cat uses walk');
  });

  test('state changes set contextual emotes', () => {
    const b = mkBrain();
    b._enter('dance', 2);
    assert.equal(b.emote.kind, 'note');
    b._enter('sleep', 2);
    assert.equal(b.emote.kind, 'zzz');
    b._enter('yawn', 2);
    assert.equal(b.emote.kind, 'zzz');
    b._enter('groom', 2);
    assert.equal(b.emote.kind, 'heart');
    b._enter('bamboo', 2);
    assert.equal(b.emote.kind, 'heart');
    b._enter('roll', 2);
    assert.equal(b.emote.kind, 'laugh');
  });

  test('pet() shows love emote, feed() fish (cat) / heart (panda bamboo)', () => {
    const b = mkBrain();
    b.pet();
    assert.equal(b.emote.kind, 'love');
    b.feed();
    assert.equal(b.emote.kind, 'fish');
    const p = mkBrain(1, { breed: 'panda' });
    p.feed();
    assert.equal(p.state, 'bamboo');
    assert.equal(p.emote.kind, 'heart');
  });
});
