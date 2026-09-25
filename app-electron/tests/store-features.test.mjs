// store-features.test.mjs — v3.6 settings-store progression + toggles
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, DEFAULTS } from '../src/settings-store.js';

function mkStore(initial = {}) {
  let saved = JSON.stringify(initial);
  return createSettings({
    read: () => saved,
    write: s => { saved = s; },
  });
}

describe('v3.6 feature toggles', () => {
  test('all feature toggles exist in DEFAULTS', () => {
    const toggles = [
      // v3.17: all reaction toggles were removed with the Reactions page
      // v3.18: voiceCommands removed with the whole voice feature
      'affectionSystem', 'companionCat',
      'photoMode', 'contextualSounds', 'pomodoro', 'dancePartyIdle',
      'seasonalSkins', 'achievements', 'communitySkins',
      'globalHotkeys', 'noWalkZones',
    ];
    for (const t of toggles) {
      assert.ok(t in DEFAULTS, `missing toggle ${t}`);
      assert.equal(typeof DEFAULTS[t], 'boolean', `${t} should default to boolean`);
    }
    assert.ok(!('voiceCommands' in DEFAULTS), 'the voice toggle must be gone');
  });
  test('legacy keys unchanged', () => {
    const s = mkStore();
    // v3.18: the default cat IS the grey tabby again
    assert.equal(s.get('breed'), 'grey_tabby');
    assert.equal(s.get('unlimitedCoins'), true);
  });
  test('v3.18: removed breeds/hats/dresses reset to the catalog defaults', () => {
    // a save file full of removed cats walks back onto the three-cat catalog
    const a = mkStore({ breed: 'panda', hat: 'santa', dress: 'red' });
    assert.equal(a.get('breed'), 'grey_tabby', 'removed breed resets');
    assert.equal(a.get('hat'), 'santa', 'a real hat survives');
    assert.equal(a.get('dress'), 'red', 'a real dress survives');
    const b = mkStore({ breed: 'siamese', hat: 'wizard', dress: 'gold' });
    assert.equal(b.get('breed'), 'grey_tabby');
    assert.equal(b.get('hat'), null, 'unknown hat resets');
    assert.equal(b.get('dress'), null, 'unknown dress resets');
  });
  test('v3.17: removed reaction keys are dropped from legacy saves', () => {
    const s = mkStore({ reactTyping: true, stalkCursor: true, statusFile: 'x', reactMusic: true, voiceCommands: true });
    for (const k of ['reactTyping', 'stalkCursor', 'statusFile', 'reactMusic', 'reactApps',
                     'reactNewWindows', 'reactLowBattery', 'reactSystemSpikes', 'timeOfDayMood',
                     'reactBuildStatus', 'voiceCommands']) {
      assert.ok(!(k in s.all), `${k} must not survive a v3.18 load`);
    }
  });
});

describe('zones sanitize on load', () => {
  test('invalid zones dropped', () => {
    const s = mkStore({ noWalkZoneList: [{ x: 1, y: 2, w: 300, h: 100 }, { x: 'bad', y: 2, w: 3, h: 4 }, null] });
    assert.equal(s.get('noWalkZoneList').length, 1);
  });
  test('valid zones preserved', () => {
    const zones = [{ x: 1, y: 2, w: 300, h: 100 }];
    const s = mkStore({ noWalkZoneList: zones });
    assert.deepEqual(s.get('noWalkZoneList'), zones);
  });
});

describe('stats / affection / unlocks', () => {
  test('bumpStat accumulates and persists', () => {
    const s = mkStore();
    s.bumpStat('pets', 3);
    s.bumpStat('pets', 2);
    assert.equal(s.get('stats').pets, 5);
  });
  test('bumpStat rejects unknown keys', () => {
    const s = mkStore();
    assert.equal(s.bumpStat('nonexistent', 1), null);
  });
  test('stats sanitize clamps negatives', () => {
    const s = mkStore({ stats: { pets: -5, jumps: 12.7 } });
    const st = s.get('stats');
    assert.equal(st.pets, 0);
    assert.equal(st.jumps, 12);
  });
  test('addAffection accumulates', () => {
    const s = mkStore();
    s.addAffection(29);
    s.addAffection(1);
    assert.equal(s.get('affection'), 30);
  });
  test('unlock idempotent', () => {
    const s = mkStore();
    assert.equal(s.unlock('first_meet'), true);
    assert.equal(s.unlock('first_meet'), false);
    assert.deepEqual(s.get('unlocked'), ['first_meet']);
  });
});

describe('custom skins', () => {
  test('add + owned grant', () => {
    const s = mkStore();
    assert.equal(s.addCustomSkin({ id: 'nightsky_x1', name: 'Nightsky', def: { name: 'Nightsky', base: 'grey_tabby' } }), true);
    assert.ok(s.get('owned').includes('custom:nightsky_x1'));
    assert.equal(s.get('customSkins').length, 1);
  });
  test('re-import same id replaces', () => {
    const s = mkStore();
    s.addCustomSkin({ id: 'x', name: 'A', def: {} });
    s.addCustomSkin({ id: 'x', name: 'B', def: {} });
    assert.equal(s.get('customSkins').length, 1);
    assert.equal(s.get('customSkins')[0].name, 'B');
  });
  test('survives reload with unlimited coins', () => {
    let initial = null;
    {
      const s = mkStore();
      s.addCustomSkin({ id: 'x1', name: 'N', def: { name: 'N' } });
      initial = JSON.parse(JSON.stringify(s.all));
    }
    const s2 = mkStore(initial);
    assert.ok(s2.get('owned').includes('custom:x1'));
    assert.equal(s2.get('customSkins')[0].id, 'x1');
  });
});
