// robust.test.mjs — v3.6.1 hardening pass: regression tests for every bug
// found in the "test more robust" sweep. Each test pins a bug that actually
// existed, so none of these may ever be loosened.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, DEFAULTS, BREED_PRICES } from '../src/settings-store.js';
import { ACHIEVEMENTS, checkUnlocks, unlockedPerks } from '../src/achievements.js';
import { CatBrain, mulberry32 } from '../src/cat-brain.js';

function memBackend() {
  let data = null;
  return { read: () => data, write: s => { data = s; } };
}

function mkBrain(seed = 11, over = {}) {
  return new CatBrain({
    bounds: { x: 0, y: 0, w: 1920, h: 1080 },
    groundY: 1040,
    rand: mulberry32(seed),
    ...over,
  });
}

// ---------------------------------------------------------------- settings store
describe('robustness: settings-store.set sanitizes every write', () => {
  test('garbage noWalkZoneList is dropped (renderer crash vector closed)', () => {
    const st = createSettings(memBackend());
    st.set('noWalkZoneList', 'garbage');
    assert.deepEqual(st.get('noWalkZoneList'), []);
    st.set('noWalkZoneList', [{ x: 1, y: 2, w: 'oops', h: 4 }]);
    assert.deepEqual(st.get('noWalkZoneList'), []);
    st.set('noWalkZoneList', [{ x: 1, y: 2, w: 30, h: 20 }]);
    assert.deepEqual(st.get('noWalkZoneList'), [{ x: 1, y: 2, w: 30, h: 20 }]);
  });

  test('garbage stats / customSkins / unlocked are dropped', () => {
    const st = createSettings(memBackend());
    st.set('stats', 'oops');
    assert.equal(st.get('stats').pets, 0);
    st.set('customSkins', [{ nope: true }]);
    assert.equal(st.get('customSkins').length, 0);
    st.set('unlocked', [42, 'ok_id']);
    assert.deepEqual(st.get('unlocked'), ['ok_id']);
  });

  test('coins accept only finite non-negative numbers', () => {
    const st = createSettings(memBackend());
    st.set('coins', 42); assert.equal(st.get('coins'), 42);
    st.set('coins', -5); assert.equal(st.get('coins'), 42, 'negative rejected');
    st.set('coins', '999'); assert.equal(st.get('coins'), 42, 'string rejected');
    st.set('coins', Number.NaN); assert.equal(st.get('coins'), 42, 'NaN rejected');
    st.set('coins', 1e12); assert.equal(st.get('coins'), 9_999_999, 'capped');
  });

  test('survives a round-trip through disk after hostile writes', () => {
    const be = memBackend();
    const st = createSettings(be);
    st.set('noWalkZoneList', 'garbage');
    st.set('size', 1.4);
    const st2 = createSettings(be);   // reload from the (poisoned?) file
    assert.deepEqual(st2.get('noWalkZoneList'), []);
    assert.equal(st2.get('size'), 1.4);
    assert.equal(st2.get('stats').pets, 0);
  });

  test('zone cap (24) and skin cap (32) still enforced on write', () => {
    const st = createSettings(memBackend());
    st.set('noWalkZoneList', Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0, w: 10, h: 10 })));
    assert.equal(st.get('noWalkZoneList').length, 24);
    st.set('customSkins', Array.from({ length: 50 }, (_, i) => ({ id: 's' + i, name: 'x', def: {} })));
    assert.equal(st.get('customSkins').length, 32);
  });

  test('custom skin signatures survive a disk round-trip (dedup support)', () => {
    const be = memBackend();
    const st = createSettings(be);
    st.addCustomSkin({ id: 'sky_1', name: 'Nightsky', def: { name: 'Nightsky' }, sig: '{"name":"Nightsky"}' });
    const st2 = createSettings(be);
    const sk = st2.get('customSkins').find(s => s.id === 'sky_1');
    assert.equal(sk.sig, '{"name":"Nightsky"}', 'sig must persist or imports dedupe only within a session');
  });
});

// ---------------------------------------------------------------- achievements
describe('robustness: night_owl unlocks whenever the stat is > 0', () => {
  test('pomodoroLate = 2 (unlocked late) still fires', () => {
    const a = ACHIEVEMENTS.find(x => x.id === 'night_owl');
    assert.equal(a.test({ pomodoroLate: 2 }), true, 'used to be === 1');
    assert.ok(checkUnlocks({ pomodoroLate: 3 }, []).includes('night_owl'));
  });
  test('perks map covers all four achievements it depends on', () => {
    const p = unlockedPerks(['pets_100', 'jumper_50', 'zen_10', 'hunter_5']);
    assert.equal(p.rainbowPet, true);
    assert.equal(p.sparkleLand, true);
    assert.equal(p.heartRain, true);
    assert.equal(p.dotSlayer, true);
  });
});

// ---------------------------------------------------------------- brain
describe('robustness: platform-edge guards (no more floating cats)', () => {
  test('startStalk refuses while standing on a window top', () => {
    const b = mkBrain();
    b.setPlatforms([{ x: 300, y: 500, w: 800, h: 200 }]);
    b.onPlatform = b.platforms[0];
    b.baseY = 500;
    assert.equal(b.startStalk(900, 1030), false, 'used to walk off the edge and float');
    assert.notEqual(b.state, 'stalk');
  });

  test('investigate refuses while standing on a window top', () => {
    const b = mkBrain();
    b.setPlatforms([{ x: 300, y: 500, w: 800, h: 200 }]);
    b.onPlatform = b.platforms[0];
    b.baseY = 500;
    assert.equal(b.investigate(1500), false, 'used to float off the edge');
    assert.equal(b._inv, null);
  });

  test('both still work from the ground', () => {
    const b = mkBrain();
    b._enter('idle', 5);
    assert.equal(b.startStalk(900, 1030), true);
    b.stopStalk();
    b._enter('idle', 5);
    assert.equal(b.investigate(900), true);
  });
});

describe('robustness: jump/drag interaction state', () => {
  test('clearing _jump mid-flight stops the lerp (drag teleport fix)', () => {
    const b = mkBrain();
    b.setPlatforms([{ x: 600, y: 600, w: 700, h: 320 }]);
    b.x = 300; b.baseY = b.groundY;
    b._jumpTo(b.platforms[0], 0.8);
    b.tick(0.1);
    // user grabs the cat mid-flight (cat.html clears these)
    b._jump = null; b.onPlatform = null;
    const xMid = b.x;
    for (let i = 0; i < 30; i++) b.tick(0.016);
    assert.equal(b.x, xMid, 'jump lerp must not move the cat after being cleared');
  });
});
