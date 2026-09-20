// stroll.test.mjs — v3.2: open-field roaming was REMOVED per user request.
// The cat strolls along the ground edge-to-edge only (plus window-top hops);
// these tests pin that behavior so roaming can't sneak back in.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CatBrain, mulberry32 } from '../src/cat-brain.js';

const WIN = { x: 0, y: 0, w: 1920, h: 1080 };

function mkBrain(seed = 42, over = {}) {
  return new CatBrain({
    bounds: WIN,
    groundY: 1040,
    rand: mulberry32(seed),
    ...over,
  });
}

describe('ground strolling (no roaming)', () => {
  test('walking keeps the feet on the ground line at all times', () => {
    const b = mkBrain(7);
    for (let i = 0; i < 12; i++) {
      b._enter('walk', 20);
      for (let k = 0; k < 60 * 20; k++) b.tick(1 / 60);
      assert.equal(b.baseY, 1040, `walk ${i} never leaves the ground (baseY=${b.baseY})`);
    }
  });

  test('walking is horizontal only: y never drifts off the ground line', () => {
    const b = mkBrain(11);
    b._enter('walk', 30);
    for (let k = 0; k < 60 * 30; k++) {
      b.tick(1 / 60);
      if (b.state !== 'jump' && !b._jump) {
        assert.equal(b.baseY, 1040, `y drifted to ${b.baseY}`);
      }
    }
  });

  test('run also stays grounded', () => {
    const b = mkBrain(3);
    b._enter('run', 10);
    for (let k = 0; k < 60 * 10; k++) {
      b.tick(1 / 60);
      assert.equal(b.baseY, 1040, `run left the ground (y=${b.baseY})`);
    }
  });

  test('no roam API exists anymore (removed, not just disabled)', () => {
    const b = mkBrain(5);
    assert.equal(b._roamTarget, undefined, '_roamTarget should be gone');
    assert.equal(typeof b._pickRoamTarget, 'undefined', '_pickRoamTarget should be gone');
    assert.equal(typeof b._roamTick, 'undefined', '_roamTick should be gone');
    assert.equal('roam' in b, false, 'roam flag should be gone');
  });

  test('the brain still knows how to walk toward both edges', () => {
    const b = mkBrain(21);
    b._enter('walk', 5);
    const x0 = b.x;
    for (let k = 0; k < 120; k++) b.tick(1 / 60);
    assert.ok(Math.abs(b.x - x0) > 40, `stroll should travel (moved ${b.x - x0})`);
  });
});
