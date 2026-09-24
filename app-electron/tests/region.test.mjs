// region.test.mjs — pure math for the v3.3 region window (RAM diet)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRegionSize, initialOrigin, slideIfNeeded, aboveFeet, belowFeet, dragChaseTarget, unionWorkAreas } from '../src/region.js';

const WA = { x: 0, y: 0, width: 1600, height: 1000 };

test('v3.11 LANE: the window spans the full work area width (capped at 1920)', () => {
  const r = computeRegionSize(1, WA);
  assert.equal(r.w, 1600, 'lane = full width on a 1600px display');
  assert.equal(r.h, aboveFeet(1) + belowFeet(), 'height unchanged');
  // ultra-wide: capped so the surface stays bounded
  const uw = { x: 0, y: 0, width: 3440, height: 1440 };
  assert.equal(computeRegionSize(1, uw).w, 1920, 'lane capped at 1920 on ultrawide');
  // tiny display: still clamps
  const small = { x: 0, y: 0, width: 300, height: 200 };
  const rs = computeRegionSize(1, small);
  assert.ok(rs.w >= 320 && rs.h >= 280, 'min sizes respected');
});

test('region height stays a fraction of the workArea at every scale', () => {
  for (let s = 0.5; s <= 2.0001; s += 0.05) {
    const r = computeRegionSize(s, WA);
    assert.ok(r.h >= 280, `min height at scale ${s}`);
    assert.ok(r.h <= WA.height, `clamped to workArea at ${s}`);
    assert.ok(r.h < WA.height * 0.6,
      `lane height at scale ${s.toFixed(2)} stays a strip (${r.w}x${r.h})`);
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
  const r = computeRegionSize(1, WA);           // v3.11 lane: 1600 x 384
  const o = initialOrigin(WA, r, 800, 992);     // legal origin: {x:0, y:616}
  // ANTI-FLICKER INVARIANT: a ground cat anywhere inside a single display's
  // span NEVER triggers a horizontal slide — the lane window never moves
  // while the cat walks (the walking-flicker root cause is gone).
  for (const x of [80, 140, 400, 700, 800, 1200, 1459, 1460]) {
    assert.equal(slideIfNeeded(o, r, x, 992, WA, 1), null, `no slide at x=${x}`);
  }
  // small idle bobs / in-place hop never slide either
  for (const dy of [2, 4, 9, 20, 70]) {
    assert.equal(slideIfNeeded(o, r, 800, 992 - dy, WA, 1), null, `dy=${dy}`);
  }
  // a real climb (window top above the lane) still slides up
  const up = slideIfNeeded(o, r, 800, 500, WA, 1);
  assert.ok(up && up.y < o.y, `slides up (${JSON.stringify(up)})`);
  // vertical result stays clamped
  assert.ok(up.y >= WA.y && up.y + r.h <= WA.height, 'clamped vertically');
});

test('slideIfNeeded: horizontal band + clamps still work for narrow regions', () => {
  // the band math is size-agnostic — a narrow region (old v3.3 shape or a
  // multi-display move target) still slides horizontally when the cat exits
  const r = { w: 480, h: 384 };
  const o = { x: 560, y: 616 };
  assert.equal(slideIfNeeded(o, r, 700, 992, WA, 1), null);
  const left = slideIfNeeded(o, r, 660, 992, WA, 1);
  assert.ok(left && left.x < o.x, `slides left (${JSON.stringify(left)})`);
  const right = slideIfNeeded(o, r, 1040, 992, WA, 1);
  assert.ok(right && right.x > o.x, `slides right (${JSON.stringify(right)})`);
  const far = slideIfNeeded(o, r, 1590, 992, WA, 1);
  assert.ok(far && far.x + r.w <= WA.width && far.y + r.h <= WA.height, 'clamped');
});

test('v3.11: an 80s ground stroll NEVER moves the lane window (flicker is structural-dead)', () => {
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
    assert.ok(x >= o.x && x <= o.x + r.w, `cat inside lane at frame ${i} (x=${x.toFixed(1)}, o=${o.x})`);
  }
  assert.equal(moves, 0, `lane window must never move during a ground stroll (got ${moves})`);
});

test('v3.11 dragChaseTarget centers the cat for the drag-follow chase', () => {
  const r = { w: 480, h: 384 };
  const t = dragChaseTarget({ x: 0, y: 0 }, r, 900, 900, WA);
  assert.equal(t.x, 900 - 240, 'cat centered horizontally');
  assert.equal(t.y, 900 + 60 - 384, 'feet kept above the bottom padding');
  // already centered -> null (quiet)
  assert.equal(dragChaseTarget(t, r, 900, 900, WA), null);
  // clamped inside the work area
  const far = dragChaseTarget({ x: 0, y: 0 }, r, 1590, 992, WA);
  assert.ok(far.x + r.w <= WA.width && far.y + r.h <= WA.height, 'drag target clamped');
});

test('v3.11 unionWorkAreas spans every display (2nd-monitor roaming)', () => {
  const two = [
    { x: 0, y: 0, width: 1600, height: 1000 },
    { x: 1600, y: -120, width: 1920, height: 1080 },   // 2nd monitor, different y
  ];
  const u = unionWorkAreas(two);
  assert.equal(u.x, 0); assert.equal(u.y, -120);
  assert.equal(u.width, 3520); assert.equal(u.height, 1120);
  // single display = itself
  const one = unionWorkAreas([two[0]]);
  assert.deepEqual(one, two[0]);
  // garbage tolerated
  assert.deepEqual(unionWorkAreas([]), { x: 0, y: 0, width: 1600, height: 1000 });
  assert.deepEqual(unionWorkAreas(null), { x: 0, y: 0, width: 1600, height: 1000 });
});
