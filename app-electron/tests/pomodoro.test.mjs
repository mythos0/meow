// pomodoro.test.mjs + achievements.test.mjs + no-walk.test.mjs combined? No —
// node:test likes files; this file covers pomodoro + achievements + zones.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPomodoro, fmtRemaining, FOCUS_MS, BREAK_MS } from '../src/pomodoro.js';
import { AFFECTION_LEVELS, affectionLevel, affectionProgress, ACHIEVEMENTS, checkUnlocks, unlockedPerks } from '../src/achievements.js';
import { rectsIntersect, catRect, blockedAt, filterPlatforms, resolveMove, zonesToScreen, toRelativeZone } from '../src/no-walk.js';

describe('pomodoro', () => {
  test('idle by default', () => {
    const p = createPomodoro();
    assert.equal(p.mode, 'idle');
    assert.equal(p.remaining, 0);
  });
  test('focus run: tick fires focus-done once, break auto-starts', () => {
    const p = createPomodoro({ focusMs: 100, breakMs: 100 });
    const t = 1_000_000;
    p.start('focus', t);
    assert.equal(p.mode, 'focus');
    assert.equal(p.tick(t + 50), null);
    assert.equal(p.tick(t + 150), 'focus-done');
    assert.equal(p.mode, 'break');               // break chains automatically
    assert.equal(p.completedFocus, 1);
  });
  test('break completes back to idle', () => {
    const p = createPomodoro({ focusMs: 50, breakMs: 50 });
    const t = 1_000_000;
    p.start('break', t);
    assert.equal(p.tick(t + 80), 'break-done');
    assert.equal(p.mode, 'idle');
  });
  test('stop works mid-run', () => {
    const p = createPomodoro({ focusMs: 1000 });
    p.start('focus', 0);
    p.stop(500);
    assert.equal(p.mode, 'idle');
    assert.equal(p.tick(600), null);
  });
  test('fmtRemaining formats mm:ss', () => {
    assert.equal(fmtRemaining(25 * 60_000), '25:00');
    assert.equal(fmtRemaining(65_000), '01:05');
    assert.equal(fmtRemaining(0), '00:00');
  });
  test('snapshot exposes remaining + totals', () => {
    const p = createPomodoro({});
    p.start('focus', 0);
    const snap = p.snapshot(2000);
    assert.equal(snap.mode, 'focus');
    assert.equal(snap.remaining, FOCUS_MS - 2000);
    assert.equal(snap.totalMs, FOCUS_MS);
  });
});

describe('affection', () => {
  test('levels from thresholds', () => {
    assert.equal(affectionLevel(0).level, 1);
    assert.equal(affectionLevel(29).level, 1);
    assert.equal(affectionLevel(30).level, 2);
    assert.equal(affectionLevel(100).level, 3);
    assert.equal(affectionLevel(9999).level, AFFECTION_LEVELS.length);
  });
  test('progress to next level', () => {
    const p = affectionProgress(0);
    assert.equal(p.level, 1);
    assert.equal(p.next.level, 2);
    assert.equal(p.pct, 0);
    const done = affectionProgress(999_999);
    assert.equal(done.next, null);
    assert.equal(done.pct, 100);
  });
});

describe('achievements', () => {
  test('first pet unlocks first_meet', () => {
    const fresh = checkUnlocks({ pets: 1 }, []);
    assert.ok(fresh.includes('first_meet'));
  });
  test('already unlocked not re-fired', () => {
    const fresh = checkUnlocks({ pets: 500 }, ['first_meet', 'pets_100']);
    assert.equal(fresh.length, 0);
  });
  test('multiple unlock at once', () => {
    const fresh = checkUnlocks({ pets: 150, lasers: 6, fish: 12 }, []);
    assert.ok(fresh.includes('pets_100'));
    assert.ok(fresh.includes('hunter_5'));
    assert.ok(fresh.includes('diner_10'));
  });
  test('night-owl via pomodoroLate flag', () => {
    const fresh = checkUnlocks({ pomodoroLate: 1 }, []);
    assert.ok(fresh.includes('night_owl'));
  });
  test('every achievement definition is well-formed', () => {
    for (const a of ACHIEVEMENTS) {
      assert.ok(a.id && a.name && a.desc && a.icon && typeof a.test === 'function', a.id);
    }
  });
  test('perks map unlocked ids', () => {
    const p = unlockedPerks(['pets_100', 'zen_10']);
    assert.equal(p.rainbowPet, true);
    assert.equal(p.heartRain, true);
    assert.equal(p.sparkleLand, false);
  });
});

describe('no-walk zones', () => {
  const wa = { x: 0, y: 0, width: 1920, height: 1040 };
  test('zones convert to screen coords', () => {
    const [z] = zonesToScreen([{ x: 100, y: 200, w: 300, h: 150 }], wa);
    assert.deepEqual(z, { x: 100, y: 200, w: 300, h: 150 });
    const off = zonesToScreen([{ x: 10, y: 10, w: 50, h: 50 }], { x: 100, y: 50, width: 1000, height: 800 })[0];
    assert.equal(off.x, 110); assert.equal(off.y, 60);
  });
  test('toRelativeZone inverts', () => {
    const rel = toRelativeZone({ x: 110, y: 60, w: 50, h: 50 }, { x: 100, y: 50 });
    assert.equal(rel.x, 10); assert.equal(rel.y, 10);
  });
  test('cat body blocked inside zone', () => {
    const zones = [{ x: 500, y: 900, w: 300, h: 140 }];
    assert.ok(blockedAt(zones, 650, 1040, 1), 'ground walk through zone blocked');
    assert.equal(blockedAt(zones, 200, 1040, 1), null);
  });
  test('resolveMove clamps before the zone and flips', () => {
    const zones = [{ x: 500, y: 900, w: 300, h: 140 }];
    const fixed = resolveMove(zones, 480, 520, 1040, 1);
    assert.ok(fixed != null && fixed < 500, `expected clamp before 500, got ${fixed}`);
    assert.equal(resolveMove(zones, 100, 140, 1040, 1), null);   // free move
    assert.equal(resolveMove(zones, 600, 640, 1040, 1), 600);    // already inside: stuck
  });
  test('platforms intersecting zones are dropped', () => {
    const zones = [{ x: 500, y: 700, w: 200, h: 20 }];
    const plats = [
      { x: 520, y: 700, w: 400, h: 300 },   // top strip inside zone -> drop
      { x: 0, y: 700, w: 400, h: 300 },     // far from zone -> keep
      { x: 520, y: 200, w: 400, h: 300 },   // same x but top strip far above -> keep
    ];
    const kept = filterPlatforms(plats, zones);
    assert.equal(kept.length, 2);
    assert.equal(kept[0].x, 0);
  });
  test('rectsIntersect math', () => {
    assert.equal(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
    assert.equal(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 5, w: 10, h: 10 }), false);
    assert.equal(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 12, y: 5, w: 10, h: 10 }, 3), true); // margin
  });
  test('catRect spans body above feet', () => {
    const r = catRect(500, 1040, 1);
    assert.equal(r.y + r.h, 1040);
    assert.ok(r.w > 60 && r.h > 100);
  });
});
