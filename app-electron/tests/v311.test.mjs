// v311.test.mjs — v3.11 contract tests:
//   * default cat IS the ginger kitten (default + carryover migration)
//   * typing hook runs in an isolated utility process (manager state machine)
//   * the lane window math (no horizontal slides while walking on one display)
//   * drag-follow chase target + multi-display union
//   * zone selection rect conversion (screenshot-style picker)
//   * sound spec wiring: single-click voice + random-meow setting defaults
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, DEFAULTS, BREED_PRICES } from '../src/settings-store.js';
import { PALETTES } from '../src/cat-renderer.js';
import { computeRegionSize, slideIfNeeded, dragChaseTarget, unionWorkAreas } from '../src/region.js';
import { toRelativeZone, toScreenZone, validZone, zonesToScreen } from '../src/no-walk.js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WA = { x: 0, y: 0, width: 1600, height: 1000 };

// ---------------------------------------------------------------- defaults
describe('v3.11 lane/zone/drag contract (the kitten-era defaults were superseded in v3.18)', () => {
  test('DEFAULTS.breed is grey_tabby (v3.18 store reset)', () => {
    assert.equal(DEFAULTS.breed, 'grey_tabby');
  });
  test('a fresh install boots as the grey tabby', () => {
    const s = createSettings({ read: () => null, write: () => {} });
    assert.equal(s.get('breed'), 'grey_tabby');
  });
  test('the v3.11 kitten litter is gone except smokey_kitten', () => {
    for (const b of ['cocoa_kitten', 'milky_kitten', 'midnight_kitten']) {
      assert.ok(!PALETTES[b], `${b} must stay removed`);
    }
    assert.ok(PALETTES.smokey_kitten, 'smokey_kitten survives');
    assert.ok(Number.isFinite(BREED_PRICES.smokey_kitten), 'smokey price present');
    assert.equal(PALETTES.smokey_kitten.body, 'kitten', 'smokey is a kitten (baby proportions)');
  });
});

// ---------------------------------------------------------------- auto-quit
// ---------------------------------------------------------------- lane / flicker
describe('v3.11 the lane window never moves while the cat walks', () => {
  test('ground strolling across the full display issues zero slides', () => {
    const r = computeRegionSize(1, WA);           // 1600 x 384 lane
    let o = { x: 0, y: 616 };
    let moves = 0;
    for (let x = 60; x <= 1540; x += 7) {          // sweep the whole lane
      const next = slideIfNeeded(o, r, x, 992, WA, 1);
      if (next) { o = next; moves++; }
    }
    assert.equal(moves, 0, 'zero window moves during a full-width stroll');
  });
  test('vertical chases still engage for platform climbs', () => {
    const r = computeRegionSize(1, WA);
    const up = slideIfNeeded({ x: 0, y: 616 }, r, 800, 400, WA, 1);
    assert.ok(up && up.y < 616, 'climbs slide the lane up');
  });
  test('drag-follow keeps the cat centered at high speed', () => {
    const r = computeRegionSize(1, WA);
    // dragging far off-lane vertically: the target chases (horizontally the
    // full-width lane is already centered by construction — that's the point)
    const t = dragChaseTarget({ x: 0, y: 616 }, r, 1500, 900, WA);
    assert.ok(t && t.y < 616, 'drag target chases the cat vertically');
    assert.ok(t.y + r.h <= WA.height, 'drag target stays clamped');
    // on a narrow region (post-move target) horizontal centering engages too
    const t2 = dragChaseTarget({ x: 0, y: 0 }, { w: 480, h: 384 }, 1500, 900, WA);
    assert.equal(t2.x, WA.width - 480, 'horizontal centering, clamped to the area edge');
  });
  test('union bounds make the 2nd monitor reachable', () => {
    const displays = [
      { x: 0, y: 0, width: 1600, height: 1000 },
      { x: -1920, y: 0, width: 1920, height: 1080 },   // left-side 2nd monitor
    ];
    const u = unionWorkAreas(displays);
    assert.equal(u.x, -1920);
    assert.equal(u.width, 3520);
    const r = computeRegionSize(1, u);
    assert.ok(r.w <= 1920, 'lane still capped on the union');
    // a drag target on the 2nd monitor survives clamping
    const t = dragChaseTarget({ x: 0, y: 616 }, r, -1500, 900, u);
    assert.ok(t.x >= u.x && t.x + r.w <= u.x + u.width, '2nd-monitor target valid');
  });
});

// ---------------------------------------------------------------- zones
describe('v3.11 screenshot-style zone selection', () => {
  test('a screen-space drag rect converts to primary-relative storage', () => {
    const primary = { x: 0, y: 0, width: 1600, height: 1000 };
    const screenRect = { x: 420, y: 300, w: 260, h: 140 };
    const rel = toRelativeZone(screenRect, primary);
    assert.deepEqual(rel, { x: 420, y: 300, w: 260, h: 140 });
    assert.ok(validZone(rel));
    // round-trips back to screen coords for the renderer
    const back = toScreenZone(rel, primary);
    assert.deepEqual(back, screenRect);
  });
  test('offset work areas convert correctly', () => {
    const primary = { x: -1920, y: 0, width: 1920, height: 1080 };
    const rel = toRelativeZone({ x: -1500, y: 200, w: 300, h: 120 }, primary);
    assert.deepEqual(rel, { x: 420, y: 200, w: 300, h: 120 });
  });
  test('tiny accidental drags are rejected', () => {
    assert.equal(validZone({ x: 0, y: 0, w: 3, h: 100 }), false, 'w > 4 required');
    assert.equal(validZone({ x: 0, y: 0, w: 100, h: 2 }), false, 'h > 4 required');
    // the overlay itself only confirms drags over 12px (read from source)
    const html = readFileSync(path.join(ROOT, 'windows', 'zone-select.html'), 'utf8');
    assert.ok(html.includes('w > 12 && h > 12'), '12px drag gate in the overlay');
  });
  test('zones feed the brain as screen rects on a union bounds', () => {
    const bounds = { x: -1920, y: 0, w: 3520, h: 1080 };
    const zones = zonesToScreen([{ x: 100, y: 100, w: 200, h: 80 }], bounds);
    assert.deepEqual(zones, [{ x: -1820, y: 100, w: 200, h: 80 }]);
  });
});

// ---------------------------------------------------------------- sounds
describe('v3.11 sound spec', () => {
  test('randomMeows defaults on and is a boolean toggle', () => {
    assert.equal(DEFAULTS.randomMeows, true);
    assert.equal(DEFAULTS.sounds, true);
  });
  test('the natural single meow sample ships with the app', () => {
    const p = path.join(ROOT, 'sounds', 'meow_single.wav');
    assert.ok(existsSync(p), 'meow_single.wav present');
    const buf = readFileSync(p);
    assert.ok(buf.length > 20000, 'non-trivial sample');
    assert.ok(buf.slice(0, 4).toString('ascii') === 'RIFF', 'valid WAV');
  });
  test('cat.html wires the single-click voice, classic double-click voice and ambient bursts', () => {
    const src = readFileSync(path.join(ROOT, 'windows', 'cat.html'), 'utf8');
    assert.ok(src.includes("playMeowSingle(0.95)"), 'quick click plays the single voice');
    assert.ok(src.includes('stopMeowSingle()'), 'double-click cuts the single voice');
    assert.ok(/dblclick[\s\S]*playMeow\(0\.95\)/.test(src), 'double-click keeps the classic meow');
    assert.ok(src.includes('fireAmbientMeow'), 'ambient meow scheduler present');
    assert.ok(src.includes("meow_single"), 'single sample is loaded');
  });
  test('settings.html exposes the All-sounds master and Random meows toggles', () => {
    const src = readFileSync(path.join(ROOT, 'windows', 'settings.html'), 'utf8');
    assert.ok(src.includes('All sounds (master)'), 'master toggle labeled');
    assert.ok(src.includes("bindSwitch('randomMeows', 'randomMeows')"), 'random meows bound');
  });
});
