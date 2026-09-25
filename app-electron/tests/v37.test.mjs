// v37.test.mjs — regression tests for the v3.7 robustness/perf pass:
//   * region slide hop-flap fix (TOPSLACK) + companion leash math
//   * topmost enforcer skips redundant native pokes
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import {
  computeRegionSize, slideIfNeeded, companionLeash,
} from '../src/region.js';
import { createTopmostEnforcer } from '../src/topmost.js';

const WA = { x: 0, y: 0, width: 1600, height: 1000 };

// ------------------------------------------------------------------ region
describe('v3.7 region slide (hop-flap fix)', () => {
  // v3.11: the app now uses a full-width lane, but the slide math is
  // size-agnostic — these regression pins use the classic 480-wide shape and
  // stay exactly as v3.7 wrote them (plus the lane invariant in region.test.mjs).
  const r = { w: 480, h: 384 };
  const o = { x: 560, y: 616 };                 // legal origin for feet 992

  test('a full in-place hop (70px) no longer slides the window', () => {
    // ground feet 992, hop apex 992-70 = 922 — used to breach the zero-width
    // top band and flap the overlay up/down on every hop
    assert.equal(slideIfNeeded(o, r, 800, 922, WA, 1), null);
  });

  test('small idle bobs (bop 4px, zoomies 9px) never slide', () => {
    for (const dy of [2, 4, 9, 20]) {
      assert.equal(slideIfNeeded(o, r, 800, 992 - dy, WA, 1), null, `dy=${dy}`);
    }
  });

  test('a real climb (breach beyond the slack) still slides up', () => {
    const up = slideIfNeeded(o, r, 800, 992 - 160, WA, 1);
    assert.ok(up && up.y < o.y, `slides up (${JSON.stringify(up)})`);
    // the big vertical ride from the v3.3 suite keeps working
    const up2 = slideIfNeeded(o, r, 800, 500, WA, 1);
    assert.ok(up2 && up2.y < o.y);
  });

  test('horizontal behavior unchanged (band + clamps)', () => {
    assert.equal(slideIfNeeded(o, r, 700, 992, WA, 1), null);
    const left = slideIfNeeded(o, r, 660, 992, WA, 1);
    assert.ok(left && left.x < o.x);
    const far = slideIfNeeded(o, r, 1590, 992, WA, 1);
    assert.ok(far.x + r.w <= WA.width && far.y + r.h <= WA.height);
  });

  test('hysteresis: no oscillation from a bobbing cat (the flap was a loop)', () => {
    for (let i = 0; i < 50; i++) {
      const dy = Math.abs(Math.sin(i * 0.7)) * 70;
      assert.equal(slideIfNeeded(o, r, 800, 992 - dy, WA, 1), null, `i=${i} dy=${dy}`);
    }
  });
});

describe('v3.7 companion leash', () => {
  test('leash keeps the kitten inside the region at every scale', () => {
    for (let s = 0.5; s <= 2.0001; s += 0.05) {
      const r = computeRegionSize(s, WA);
      const leash = companionLeash(r.w);
      // kitten is at most leash+50 (hard net) from the main cat; the slide
      // centers the pair midpoint, so each cat sits <= (leash+50)/2 from the
      // region center after a slide. The net must be well under half the
      // region width so both cats always fit on screen.
      assert.ok(leash + 50 <= r.w / 2, `scale ${s.toFixed(2)}: net ${leash + 50} fits region ${r.w}`);
      assert.ok(leash >= 110, 'leash never pinches the kitten');
    }
  });

  test('degenerate widths fall back to a sane leash', () => {
    assert.equal(companionLeash(0), 160);     // non-finite -> default 480 -> 160
    assert.equal(companionLeash(NaN), 160);
    assert.ok(companionLeash(100000) > 110, 'huge region -> wide leash');
    assert.equal(companionLeash(480), 160);
  });
});

// -------------------------------------------------------------- sys-monitor
// fake spawn: a process object whose stdout can be pushed from the test
function fakeSpawn() {
  const p = new EventEmitter();
  p.stdout = new EventEmitter();
  p.killed = false;
  p.kill = () => { p.killed = true; p.emit('close', 0); };
  return p;
}

// ------------------------------------------------------------------ topmost
describe('v3.7 topmost enforcer skips redundant pokes', () => {
  test('skips setAlwaysOnTop when the flag is already set', async () => {
    const w = new EventEmitter();
    let calls = 0;
    w.setAlwaysOnTop = () => { calls++; };
    w.isAlwaysOnTop = () => true;                 // already topmost
    const e = createTopmostEnforcer(w, { intervalMs: 20 });
    e.start();
    await new Promise(r => setTimeout(r, 70));
    e.stop();
    assert.equal(calls, 0, 'no native calls when already topmost');
    assert.equal(e.enforceCount, 0);
  });

  test('still enforces when there is no getter (real Windows path)', async () => {
    const w = new EventEmitter();
    let calls = 0;
    w.setAlwaysOnTop = () => { calls++; };
    const e = createTopmostEnforcer(w, { intervalMs: 20 });
    e.start();
    await new Promise(r => setTimeout(r, 70));
    e.stop();
    assert.ok(calls >= 2, `enforced repeatedly (${calls})`);
  });
});
