// region.test.mjs — pure math for the v3.3 region window (RAM diet)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRegionSize, initialOrigin, slideIfNeeded, aboveFeet, belowFeet } from '../src/region.js';

const WA = { x: 0, y: 0, width: 1600, height: 1000 };

test('region size is a fraction of the workArea at every scale', () => {
  for (let s = 0.5; s <= 2.0001; s += 0.05) {
    const r = computeRegionSize(s, WA);
    assert.ok(r.w >= 320 && r.h >= 280, `min sizes at scale ${s}`);
    assert.ok(r.w <= WA.width && r.h <= WA.height, `clamped to workArea at ${s}`);
    assert.ok(r.w * r.h < WA.width * WA.height * 0.5,
      `region at scale ${s.toFixed(2)} is <50% of fullscreen (${r.w}x${r.h})`);
  }
});

test('aboveFeet covers hop, bubble and emote at slider extremes', () => {
  // bubble offset = 150*s + 70 plus its own height; emote = 230*s; hop = 70
  const lo = aboveFeet(0.5), hi = aboveFeet(2);
  assert.ok(lo >= 0.5 * 230 + 24, 'covers emote at scale 0.5');
  assert.ok(lo >= 150 * 0.5 + 150, 'covers bubble at scale 0.5');
  assert.ok(hi >= 230 * 2 + 24, 'covers emote at scale 2');
  assert.ok(hi >= 70, 'covers in-place hop');
  assert.ok(aboveFeet(1) + belowFeet() === computeRegionSize(1, WA).h, 'region h = above + below');
});

test('initialOrigin keeps feet inside and clamps to the workArea', () => {
  const r = computeRegionSize(1, WA);
  const o1 = initialOrigin(WA, r, 800, 992);
  assert.ok(o1.x >= 0 && o1.x + r.w <= WA.width, 'x clamped');
  assert.ok(o1.y >= 0 && o1.y + r.h <= WA.height, 'y clamped');
  // feet sit at origin.y + h - belowFeet when there is room below
  assert.ok(992 <= o1.y + r.h && 992 >= o1.y, 'feet inside region');
  // tiny workArea: clamped, no NaN, no negative
  const small = { x: 0, y: 0, width: 300, height: 200 };
  const rs = computeRegionSize(1, small);
  const os = initialOrigin(small, rs, 150, 192);
  assert.ok(os.x >= 0 && os.y >= 0, 'origin non-negative on tiny screens');
});

test('slideIfNeeded: quiet inside the band, recenters when out', () => {
  const r = computeRegionSize(1, WA);           // 480 x 384
  const o = initialOrigin(WA, r, 800, 992);     // legal origin: {x:560, y:616}
  // well inside -> no move (bottom padding can't fit when bottom-clamped:
  // the function must no-op, not fight the clamp every frame)
  assert.equal(slideIfNeeded(o, r, 700, 992, WA, 1), null);
  assert.equal(slideIfNeeded(o, r, 800, 950, WA, 1), null);
  // walked left past the band -> slide left (re-center on cat)
  const left = slideIfNeeded(o, r, 560 + 100, 992, WA, 1);
  assert.ok(left && left.x < o.x, `slides left (${JSON.stringify(left)})`);
  // walked right past the band -> slide right
  const right = slideIfNeeded(o, r, 560 + 480, 992, WA, 1);
  assert.ok(right && right.x > o.x, `slides right (${JSON.stringify(right)})`);
  // rode a window top high above -> slides up
  const up = slideIfNeeded(o, r, 800, 500, WA, 1);
  assert.ok(up && up.y < o.y, `slides up (${JSON.stringify(up)})`);
  // never escapes the workArea
  const far = slideIfNeeded(o, r, 1590, 992, WA, 1);
  assert.ok(far.x + r.w <= WA.width && far.y + r.h <= WA.height, 'clamped');
  // degenerate: cat already at the clamp limit but still out of band -> no NaN move loop
  const stuck = slideIfNeeded({ x: WA.width - r.w, y: 0 }, r, WA.width - 10, 992, WA, 1);
  if (stuck) {
    assert.ok(stuck.x >= 0 && stuck.x + r.w <= WA.width, 'stuck slide stays clamped');
  }
});

test('slideIfNeeded is stable under repeated calls (no oscillation)', () => {
  const r = computeRegionSize(1, WA);
  let o = initialOrigin(WA, r, 800, 992);
  // cat strolls left at 55px/s, turning at the ground clamp like the brain
  // (pad 60) — 40s of 60fps frames, then walks back right
  let x = 800, dir = -1;
  let moves = 0;
  for (let i = 0; i < 2400; i++) {
    x += dir * (55 / 60);
    if (x <= WA.x + 60) { x = WA.x + 60; dir = 1; }
    if (x >= WA.x + WA.width - 60) { x = WA.x + WA.width - 60; dir = -1; }
    const next = slideIfNeeded(o, r, x, 992, WA, 1);
    if (next) { o = next; moves++; }
    assert.ok(x >= o.x && x <= o.x + r.w, `cat inside region at frame ${i} (x=${x.toFixed(1)}, o=${o.x})`);
  }
  assert.ok(moves > 0 && moves < 80, `slide count sane for an 80s stroll (${moves})`);
});
