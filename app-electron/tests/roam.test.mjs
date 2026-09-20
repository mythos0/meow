// roam.test.mjs — v3.1 open-field roaming: the cat walks to random points
// anywhere on the screen, not just along the taskbar line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CatBrain, mulberry32 } from '../src/cat-brain.js';

const WIN = { x: 0, y: 0, w: 1920, h: 1080 };

function mkBrain(seed = 42, over = {}) {
  return new CatBrain({
    bounds: WIN,
    groundY: 1040,
    rand: mulberry32(seed),
    roam: true,
    ...over,
  });
}

describe('open-field roaming', () => {
  test('roam targets are picked inside the full work area', () => {
    const b = mkBrain(5);
    for (let i = 0; i < 200; i++) {
      b._pickRoamTarget();
      const { x, y } = b._roamTarget;
      assert.ok(x >= 90 && x <= 1920 - 90, `x=${x} within margin`);
      assert.ok(y >= 150 && y <= 1040 - 14, `y=${y} within vertical field`);
    }
  });

  test('roaming walks the cat to random places across the whole screen', () => {
    const b = mkBrain(11);
    let minY = b.baseY, maxY = b.baseY, minX = b.x, maxX = b.x;
    for (let i = 0; i < 8; i++) {
      b._enter('walk', 30);
      b._roamTarget = { x: 300 + (i % 4) * 420, y: i % 2 ? 250 : 900 };
      for (let k = 0; k < 60 * 20 && b._roamTarget; k++) {
        b.tick(1 / 60);
        minY = Math.min(minY, b.baseY); maxY = Math.max(maxY, b.baseY);
        minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      }
    }
    assert.ok(maxY - minY > 500, `vertical coverage ${minY.toFixed(0)}..${maxY.toFixed(0)}`);
    assert.ok(maxX - minX > 600, `horizontal coverage ${minX.toFixed(0)}..${maxX.toFixed(0)}`);
  });

  test('arriving at the target ends the walk (sniff, then act again)', () => {
    const b = mkBrain(3);
    b._enter('walk', 30);
    b._roamTarget = { x: b.x + 60, y: b.baseY - 40 };
    let steps = 0;
    for (; steps < 60 * 8 && b.state === 'walk'; steps++) b.tick(1 / 60);
    assert.equal(b._roamTarget, null, 'target consumed');
    assert.equal(b.state, 'idle', 'arrived → idle');
    assert.ok(b.stateT < 3, 'fresh idle');
  });

  test('roaming respects the walk speed and turns to face travel direction', () => {
    const b = mkBrain(9);
    b._enter('walk', 30);
    b._roamTarget = { x: b.x - 200, y: b.baseY };    // to the left
    const x0 = b.x;
    b.tick(0.1); b.tick(0.1);                        // dt clamps at 0.1 internally
    assert.equal(b.dir, -1, 'faces left');
    assert.ok(b.x < x0, 'moved left');
    assert.ok(Math.abs((x0 - b.x) - 55 * 0.2) < 0.5, `walk speed applied (${(x0 - b.x).toFixed(2)})`);
  });

  test('dropAt clears the roam target', () => {
    const b = mkBrain();
    b._enter('walk', 5);
    b._roamTarget = { x: 500, y: 400 };
    b.dropAt(800, 1000);
    assert.equal(b._roamTarget, null);
  });

  test('roam can be disabled (legacy stroll behavior)', () => {
    const b = mkBrain(21, { roam: false });
    for (let i = 0; i < 200; i++) {
      b._nextAction();
      if (b.state === 'walk') assert.equal(b._roamTarget, null, 'no roam target when disabled');
    }
  });
});
