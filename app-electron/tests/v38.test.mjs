// v38.test.mjs — v3.8.0: "one meow voice + no more rendering jumps + walk &
// jump on the top border of resized windows".
//   1. matchPlatform: geometry-based re-binding of the cat's current window
//      across scans (windows move/resize between PowerShell scans)
//   2. setPlatforms re-anchoring: resized/moved windows keep the cat on their
//      top border — no teleport to the ground
//   3. _borderHop: jumps ON the top border land back on the border
//   4. toPlatforms: maximized ("full") windows are never platforms
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CatBrain, mulberry32, matchPlatform } from '../src/cat-brain.js';
import { toPlatforms } from '../src/window-scan.js';

const WIN = { x: 0, y: 0, w: 1920, h: 1080 };

function mkBrain(seed = 42, over = {}) {
  return new CatBrain({
    bounds: WIN,
    groundY: 1040,
    rand: mulberry32(seed),
    ...over,
  });
}

// ---------------------------------------------------------------- matchPlatform
describe('v3.8 matchPlatform (re-bind the same window across scans)', () => {
  test('same spot = exact match', () => {
    const a = { x: 300, y: 500, w: 600, h: 400 };
    const b = { x: 300, y: 500, w: 600, h: 400 };
    assert.equal(matchPlatform(a, [b]), b);
  });

  test('window resized narrower keeps the match (left edge pinned)', () => {
    const a = { x: 300, y: 500, w: 600, h: 400 };
    const b = { x: 300, y: 500, w: 280, h: 400 };   // user dragged the right edge in
    assert.equal(matchPlatform(a, [b]), b);
  });

  test('window dragged a little keeps the match', () => {
    const a = { x: 300, y: 500, w: 600, h: 400 };
    const b = { x: 180, y: 510, w: 600, h: 400 };
    assert.equal(matchPlatform(a, [b]), b);
  });

  test('a different window does not steal the match', () => {
    const a = { x: 300, y: 500, w: 600, h: 400 };
    const other = { x: 1300, y: 500, w: 500, h: 400 };   // no horizontal overlap
    assert.equal(matchPlatform(a, [other]), null);
  });

  test('border drifted way too far vertically = gone', () => {
    const a = { x: 300, y: 500, w: 600, h: 400 };
    const moved = { x: 300, y: 900, w: 600, h: 100 };   // 400px away — another window
    assert.equal(matchPlatform(a, [moved]), null);
  });

  test('picks the best candidate when windows overlap', () => {
    const a = { x: 300, y: 500, w: 600, h: 400 };
    const weak = { x: 850, y: 500, w: 400, h: 300 };    // overlaps 50px only
    const strong = { x: 320, y: 500, w: 560, h: 380 };  // nearly the same window
    assert.equal(matchPlatform(a, [weak, strong]), strong);
  });
});

// ---------------------------------------------------------------- re-anchoring
describe('v3.8 setPlatforms re-anchoring (resized windows, no teleport)', () => {
  test('resized window: cat stays ON the border at the same relative spot', () => {
    const b = mkBrain();
    const old = { x: 500, y: 600, w: 400, h: 300 };
    b.setPlatforms([old]);
    b.onPlatform = old;
    b.x = 700;                       // middle of the border
    b.baseY = old.y;
    const moved = { x: 560, y: 600, w: 320, h: 300 };   // user resized the window
    b.setPlatforms([moved]);
    assert.equal(b.onPlatform, moved, 're-bound to the new platform object');
    assert.equal(b.baseY, 600, 'still standing on the top border');
    assert.ok(b.x >= moved.x + 30 && b.x <= moved.x + moved.w - 30, 'clamped inside the new border');
  });

  test('small border nudge (<=60px) rides along silently', () => {
    const b = mkBrain();
    const old = { x: 500, y: 600, w: 400, h: 300 };
    b.setPlatforms([old]);
    b.onPlatform = old;
    b.x = 600; b.baseY = 600;
    const nudged = { x: 500, y: 640, w: 400, h: 260 };
    b.setPlatforms([nudged]);
    assert.equal(b.onPlatform, nudged);
    assert.equal(b.baseY, 640, 'rode the border down with the resize');
    assert.notEqual(b.state, 'jump', 'no hop for a small nudge');
  });

  test('big border move (>60px) = visible hop back onto the border, not a teleport', () => {
    const b = mkBrain();
    const old = { x: 500, y: 600, w: 400, h: 300 };
    b.setPlatforms([old]);
    b.onPlatform = old;
    b.x = 600; b.baseY = 600;
    const dragged = { x: 500, y: 760, w: 400, h: 140 };
    b.setPlatforms([dragged]);
    assert.equal(b.state, 'jump', 'an animated hop starts');
    assert.ok(b._jump, 'directed jump in flight');
    assert.equal(b._jump.y1, 760, 'the hop targets the NEW border, never the ground');
    assert.equal(b._jump.pl, dragged, 'lands back on the same window');
  });

  test('vanished window = animated fall (no instant snap to the ground)', () => {
    const b = mkBrain();
    const pl = { x: 500, y: 600, w: 400, h: 300 };
    b.setPlatforms([pl]);
    b.onPlatform = pl;
    b.baseY = 600;
    b.setPlatforms([]);
    assert.equal(b.state, 'jump');
    assert.ok(b._jump && b._jump.y1 === b.groundY, 'falls to the ground with an arc');
  });

  test('re-anchoring never fires while the cat is mid-jump', () => {
    const b = mkBrain();
    const old = { x: 500, y: 600, w: 400, h: 300 };
    b.setPlatforms([old]);
    b.onPlatform = old;
    b.baseY = 600;
    b._jump = { x0: 500, x1: 560, y0: 600, y1: 600, pl: old };   // airborne
    b.setPlatforms([{ x: 500, y: 700, w: 400, h: 200 }]);
    assert.equal(b._jump.x1, 560, 'in-flight jump untouched by the scan');
  });
});

// ---------------------------------------------------------------- border hops
describe('v3.8 _borderHop (walk AND jump along the top border)', () => {
  function forceJumpPick(b) {
    // deterministic 'jump' pick: drive _nextAction with a stubbed _pick
    const real = b._pick.bind(b);
    b._pick = () => 'jump';
    b._nextAction();
    b._pick = real;
  }

  test('jumping while on a border lands back on the SAME border', () => {
    const b = mkBrain(7);
    const pl = { x: 400, y: 600, w: 700, h: 300 };
    b.setPlatforms([pl]);
    b.onPlatform = pl;
    b.x = 500; b.baseY = 600;
    forceJumpPick(b);
    assert.equal(b.state, 'jump');
    assert.ok(b._jump, 'a directed border hop is in flight');
    assert.equal(b._jump.y1, 600, 'same top border y');
    assert.equal(b._jump.pl, pl, 'same window');
    assert.ok(b._jump.x1 >= pl.x + 34 && b._jump.x1 <= pl.x + pl.w - 34, 'target stays on the border span');
  });

  test('hop bounces off the border edge instead of leaving it', () => {
    const b = mkBrain(3);
    const pl = { x: 400, y: 600, w: 220, h: 300 };
    b.setPlatforms([pl]);
    b.onPlatform = pl;
    b.x = pl.x + 40;                // right next to the left edge
    b.baseY = 600;
    b.dir = -1;                     // facing OFF the border
    forceJumpPick(b);
    assert.ok(b._jump, 'hop happened');
    assert.equal(b.dir, 1, 'direction flipped away from the edge');
    assert.ok(b._jump.x1 >= pl.x + 34, 'still on the border');
  });

  test('short border falls back to an in-place hop (never walks off in air)', () => {
    const b = mkBrain(5);
    const pl = { x: 400, y: 600, w: 110, h: 300 };   // 110-2*34 = 42 < 44 span
    b.setPlatforms([pl]);
    b.onPlatform = pl;
    b.x = 450; b.baseY = 600;
    b._jump = null;
    b._borderHop();
    assert.ok(b._jump === null || b._jump.y1 !== 600 || true);
    // in-place hop: no directed jump was created
    assert.equal(b._jump, null, 'short border = plain in-place hop');
  });
});

// ---------------------------------------------------------------- maximized windows
describe('v3.8 toPlatforms: full/maximized windows are never platforms', () => {
  const WA = { width: 1600, height: 900 };

  test('maximized window is dropped when the workArea is known', () => {
    const wins = [
      { title: 'Notepad', x: 0, y: 0, w: 1600, h: 900 },   // maximized = full width
      { title: 'Terminal', x: 100, y: 100, w: 700, h: 500 }, // normal resized window
    ];
    const plats = toPlatforms(wins, { workArea: WA });
    assert.equal(plats.length, 1);
    assert.equal(plats[0].title, 'Terminal');
  });

  test('large-but-resized window (85% width) still counts', () => {
    const wins = [{ title: 'Big editor', x: 0, y: 0, w: 1360, h: 900 }];
    const plats = toPlatforms(wins, { workArea: WA });
    assert.equal(plats.length, 1, '0.85 < 0.92 — resizable window is walkable');
  });

  test('without a workArea the filter is inert (back-compat)', () => {
    const wins = [{ title: 'Maxi', x: 0, y: 0, w: 1600, h: 900 }];
    assert.equal(toPlatforms(wins).length, 1);
  });

  test('maxWidthFrac is tunable', () => {
    const wins = [{ title: 'Half', x: 0, y: 0, w: 800, h: 900 }];
    assert.equal(toPlatforms(wins, { workArea: WA, maxWidthFrac: 0.4 }).length, 0);
  });
});
