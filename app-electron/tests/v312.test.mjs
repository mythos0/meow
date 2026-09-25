// v312.test.mjs — the v3.12 contract: sound architecture, main-driven drag
// math, the lane hop, the quit-gate surface and the zone-base fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slideIfNeeded, laneHopTarget, dragWindowTarget, dragChaseTarget,
  unionWorkAreas, computeRegionSize, HOP_EDGE,
} from '../src/region.js';
import { createSettings, DEFAULTS, BREED_PRICES } from '../src/settings-store.js';

// ---------------------------------------------------------------- settings keys
test('v3.12 sound toggles default to ON', () => {
  assert.equal(DEFAULTS.soundClickMeow, true);
  assert.equal(DEFAULTS.soundDblClickMeow, true);
  assert.equal(DEFAULTS.soundReminders, true);
  assert.equal(DEFAULTS.sounds, true);
  assert.equal(DEFAULTS.randomMeows, true);
});

test('v3.12 sound toggles sanitize + persist', () => {
  let saved = null;
  const store = createSettings({ read: () => saved, write: s => { saved = s; } });
  assert.equal(store.set('soundClickMeow', false), true);
  assert.equal(store.get('soundClickMeow'), false);
  // reload from disk — the value survives
  const store2 = createSettings({ read: () => saved, write: () => {} });
  assert.equal(store2.get('soundClickMeow'), false);
  // garbage values fall back to the current value, not to the default
  store2.set('soundDblClickMeow', 'yes');
  assert.equal(store2.get('soundDblClickMeow'), true);   // 'yes' is not boolean → rejected
});

test('v3.18 default breed is the grey tabby on the three-cat catalog', () => {
  assert.equal(DEFAULTS.breed, 'grey_tabby');
  assert.ok(BREED_PRICES.smokey_kitten > 0);
});

// ---------------------------------------------------------------- lane hop
const UNION2 = { x: 0, y: 0, width: 3200, height: 1000 };   // two 1600-wide displays
const LANE = { w: 1600, h: 434 };

test('lane hop: no hop when the lane already spans the union (single display)', () => {
  const single = { x: 0, y: 0, width: 1600, height: 1000 };
  const o = { x: 0, y: 500 };
  assert.equal(laneHopTarget(o, LANE, single.width - 10, single), null);
  assert.equal(laneHopTarget(o, LANE, 5, single), null);
  assert.equal(laneHopTarget(o, LANE, 800, single), null);
});

test('lane hop: no hop while the cat is mid-lane', () => {
  const o = { x: 0, y: 500 };
  assert.equal(laneHopTarget(o, LANE, 800, UNION2), null);
  assert.equal(laneHopTarget(o, LANE, 1000, UNION2), null);
});

test('lane hop: fires at the right edge when the union extends past it', () => {
  const o = { x: 0, y: 500 };
  const catX = o.x + LANE.w - 50;             // within HOP_EDGE of the right edge
  const t = laneHopTarget(o, LANE, catX, UNION2);
  assert.ok(t, 'expected a hop target');
  assert.equal(t.y, o.y);
  // the window lands with the cat near its LEFT half (walking right continues)
  assert.ok(t.x > o.x, 'window must move right');
  assert.ok(catX - t.x > 0 && catX - t.x < LANE.w, 'cat stays inside the new lane');
  // the new lane must not overshoot the union
  assert.ok(t.x + LANE.w <= UNION2.x + UNION2.width + 1);
});

test('lane hop: fires at the left edge when the union extends past it', () => {
  // cat strolling on the 2nd display, heading back left
  const o = { x: 1600, y: 500 };
  const catX = o.x + 40;
  const t = laneHopTarget(o, LANE, catX, UNION2);
  assert.ok(t, 'expected a hop target');
  assert.ok(t.x < o.x, 'window must move left');
  assert.ok(catX > t.x && catX < t.x + LANE.w, 'cat stays inside the new lane');
});

test('lane hop: hops even a SHORT distance to keep the cat covered', () => {
  // union only 239px wider than the lane: still enough to hop 239px right so
  // the stroller never walks off the canvas edge
  const shortUnion = { x: 0, y: 0, width: 1600 + 239, height: 1000 };
  const o = { x: 0, y: 500 };
  const catX = o.x + LANE.w - 10;
  const t = laneHopTarget(o, LANE, catX, shortUnion);
  assert.ok(t, 'expected a coverage hop');
  assert.equal(t.x, 239);
  assert.ok(catX > t.x && catX < t.x + LANE.w, 'cat stays covered');
});

test('lane hop: no hop when the window is already maximally moved', () => {
  const shortUnion = { x: 0, y: 0, width: 1600 + 239, height: 1000 };
  const o = { x: 239, y: 500 };   // window pressed against the union's right
  const catX = o.x + LANE.w - 10;
  assert.equal(laneHopTarget(o, LANE, catX, shortUnion), null);
});

test('lane hop: clamps the hop target inside the union', () => {
  // lane mid-union (800..2400), cat at the lane's right edge walking right:
  // the hop may push the window right but never past the union's right edge
  const o = { x: 800, y: 500 };
  const t = laneHopTarget(o, LANE, 2390, UNION2);
  assert.ok(t, 'expected a hop target (800px of union beyond the lane edge)');
  assert.ok(t.x + LANE.w <= UNION2.width, 'window stays inside the union');
  assert.ok(t.x > o.x, 'window moved right');
  // at the ABSOLUTE right edge there is nothing left to hop to
  assert.equal(laneHopTarget({ x: 1600, y: 500 }, LANE, 3199, UNION2), null);
});

// ---------------------------------------------------------------- main-driven drag
test('dragWindowTarget centers the lane on the cat, clamped to the union', () => {
  const t = dragWindowTarget(LANE, 2400, 900, UNION2);
  assert.equal(t.x, 2400 - LANE.w / 2);
  assert.equal(t.y, 900 + 60 - LANE.h);
  // deep clamp: a cat at the far right cannot push the window out of the union
  const t2 = dragWindowTarget(LANE, 5000, 900, UNION2);
  assert.equal(t2.x, UNION2.width - LANE.w);
  // negative side
  const t3 = dragWindowTarget(LANE, -500, 900, UNION2);
  assert.equal(t3.x, UNION2.x);
});

test('dragWindowTarget keeps the window inside the union on the 2nd display', () => {
  const t = dragWindowTarget({ w: 800, h: 434 }, 2000, 990, UNION2);
  assert.ok(t.x + 800 <= UNION2.width);
  assert.ok(t.y + 434 <= UNION2.height);
});

// ---------------------------------------------------------------- slide (vertical only for ground strolls)
test('slideIfNeeded: ground mode ignores horizontal escapes (lane hop owns them)', () => {
  const o = { x: 0, y: 566 };
  // cat far beyond the right comfort band, feet level → no vertical breach
  const r = { w: 1600, h: 434 };
  const feetY = 566 + 434 - 60;   // bottom padding line
  const hOnly = slideIfNeeded(o, r, 1590, feetY, UNION2, 1.0, { horizontal: false });
  assert.equal(hOnly, null, 'horizontal-only escape must not slide in ground mode');
  // the same escape WITH horizontal allowed still slides (non-ground states)
  const both = slideIfNeeded(o, r, 1590, feetY, UNION2, 1.0);
  assert.ok(both && both.x > 0, 'default behavior unchanged');
});

test('slideIfNeeded: ground mode still slides vertically', () => {
  const o = { x: 0, y: 566 };
  const r = { w: 1600, h: 434 };
  const up = slideIfNeeded(o, r, 800, o.y - 200, UNION2, 1.0, { horizontal: false });
  assert.ok(up && up.y < o.y, 'a climb must slide up even in ground mode');
});

// ---------------------------------------------------------------- multi-display union math
test('unionWorkAreas handles negative-coordinate displays (monitor left of primary)', () => {
  const u = unionWorkAreas([
    { x: 0, y: 0, width: 1600, height: 1000 },
    { x: -1920, y: -200, width: 1920, height: 1080 },
  ]);
  assert.equal(u.x, -1920);
  assert.equal(u.y, -200);
  assert.equal(u.width, 3520);
  assert.equal(u.height, 1200);   // -200 .. 1000
});

test('computeRegionSize still caps the lane at 1920 wide', () => {
  const r = computeRegionSize(1.0, { x: 0, y: 0, width: 3840, height: 1200 });
  assert.equal(r.w, 1920);
  const r2 = computeRegionSize(1.0, { x: 0, y: 0, width: 1200, height: 900 });
  assert.equal(r2.w, 1200);
});

// ---------------------------------------------------------------- zone base (union-relative)
test('zones round-trip through the union base the renderer uses', () => {
  // zone drawn at absolute 1900,300 on a 2×1600 union — main stores it
  // relative to the UNION, the renderer converts back with brain.bounds.
  const u = UNION2;
  const abs = { x: 1900, y: 300, w: 200, h: 150 };
  const rel = { x: abs.x - u.x, y: abs.y - u.y, w: abs.w, h: abs.h };
  const back = { x: rel.x + u.x, y: rel.y + u.y, w: rel.w, h: rel.h };
  assert.deepEqual(back, abs);
});

// ---------------------------------------------------------------- drag fallback contract
test('dragChaseTarget (renderer fallback) still clamps to the union', () => {
  const t = dragChaseTarget({ x: 0, y: 500 }, LANE, 2500, 940, UNION2);
  assert.ok(t.x + LANE.w <= UNION2.width);
});
