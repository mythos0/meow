// features.test.mjs — v3.6 system-reactions unit tests (pure logic)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSpikeDetector, batteryCrisis, timeBias, createTypingMeter,
  shouldDanceParty, diffWindows,
  findEditorApp,
  parseMusicLine, musicReaction, parseStatusFile,
} from '../src/system-reactions.js';

describe('spike detector', () => {
  test('needs two consecutive hot samples', () => {
    const d = createSpikeDetector({ cooldownMs: 0 });
    const now = Date.now();
    assert.equal(d.push({ cpu: 95, now }), null);
    assert.equal(d.push({ cpu: 95, now }), 'stress');
  });
  test('one hot sample then a cool one resets', () => {
    const d = createSpikeDetector({ cooldownMs: 0 });
    assert.equal(d.push({ cpu: 95 }), null);
    assert.equal(d.push({ cpu: 10 }), null);
    assert.equal(d.push({ cpu: 95 }), null);
    assert.equal(d.push({ cpu: 95 }), 'stress');
  });
  test('RAM alone can trigger', () => {
    const d = createSpikeDetector({ cooldownMs: 0 });
    d.push({ ram: 93 });
    assert.equal(d.push({ ram: 95, cpu: 5 }), 'stress');
  });
  test('cooldown prevents panic loops', () => {
    const d = createSpikeDetector({ cooldownMs: 60_000 });
    const t = 1_000_000;
    d.push({ cpu: 99, now: t });
    assert.equal(d.push({ cpu: 99, now: t + 1 }), 'stress');
    assert.equal(d.push({ cpu: 99, now: t + 2 }), null);
    assert.equal(d.push({ cpu: 99, now: t + 3 }), null); // still cooling down
    assert.equal(d.push({ cpu: 99, now: t + 61_000 }), 'stress');
  });
});

describe('battery crisis', () => {
  test('low + discharging = crisis', () => {
    assert.equal(batteryCrisis(0.15, false), true);
  });
  test('charging never a crisis', () => {
    assert.equal(batteryCrisis(0.05, true), false);
  });
  test('healthy battery fine', () => {
    assert.equal(batteryCrisis(0.8, false), false);
  });
  test('unknown level is not a crisis', () => {
    assert.equal(batteryCrisis(null, false), false);
    assert.equal(batteryCrisis(undefined, false), false);
  });
});

describe('time bias', () => {
  test('night is 22:00-07:00', () => {
    assert.equal(timeBias(23), 'night');
    assert.equal(timeBias(3), 'night');
    assert.equal(timeBias(6), 'night');
    assert.equal(timeBias(7), 'day');
    assert.equal(timeBias(12), 'day');
    assert.equal(timeBias(21), 'day');
    assert.equal(timeBias(22), 'night');
  });
});

describe('typing meter', () => {
  test('WPM reflects recent keystrokes', () => {
    const m = createTypingMeter({ windowMs: 5000, pounceAt: 60 });
    const t = 1_000_000;
    for (let i = 0; i < 30; i++) m.key(t + i * 100);   // 30 keys / 3s window
    // 30 keys = 6 words in 3s → ~120 wpm
    assert.ok(m.wpm(t + 3000) > 60, 'wpm=' + m.wpm(t + 3000));
  });
  test('burst triggers pounce, respects cooldown', () => {
    const m = createTypingMeter({ windowMs: 5000, pounceAt: 60, pounceCooldownMs: 45_000 });
    const t = 1_000_000;
    for (let i = 0; i < 30; i++) m.key(t + i * 100);
    assert.equal(m.tick(t + 3100), 'pounce');
    for (let i = 0; i < 30; i++) m.key(t + 10_000 + i * 100);
    assert.equal(m.tick(t + 13_100), null);   // cooling down
    for (let i = 0; i < 30; i++) m.key(t + 57_000 + i * 100);
    assert.equal(m.tick(t + 60_000), 'pounce');
  });
  test('long idle -> nap', () => {
    const m = createTypingMeter({ napAfterMs: 12 * 60_000 });
    const t = 1_000_000;
    m.key(t);
    assert.equal(m.tick(t + 13 * 60_000), 'nap');
  });
});

describe('dance party', () => {
  test('fires after idle threshold', () => {
    assert.equal(shouldDanceParty(100), false);              // 100s < 600s default
    assert.equal(shouldDanceParty(700), true);               // 700s ≥ 600s default
    assert.equal(shouldDanceParty(700, { afterSec: 900 }), false);
    assert.equal(shouldDanceParty(1000, { afterSec: 900 }), true);
  });
  test('respects once-per period', () => {
    assert.equal(shouldDanceParty(700, { lastPartyAgeSec: 100 }), false);
    assert.equal(shouldDanceParty(700, { lastPartyAgeSec: 1900 }), true);
  });
});

// v3.10: the 'fullscreen detection' describe was removed with the feature —
// the cat no longer auto-hides in fullscreen (see tests/v310.test.mjs).

describe('new-window diff', () => {
  test('detects newly appeared windows', () => {
    const a = [{ x: 0, y: 0, w: 800, h: 600 }];
    const b = [{ x: 0, y: 0, w: 800, h: 600 }, { x: 900, y: 0, w: 600, h: 400 }];
    const added = diffWindows(a, b);
    assert.equal(added.length, 1);
    assert.equal(added[0].x, 900);
  });
  test('ignores tiny popups', () => {
    const added = diffWindows([], [{ x: 5, y: 5, w: 150, h: 80 }]);
    assert.equal(added.length, 0);
  });
  test('moved window counts as new position', () => {
    const added = diffWindows([{ x: 0, y: 0, w: 800, h: 600 }], [{ x: 40, y: 0, w: 800, h: 600 }]);
    assert.equal(added.length, 1);
  });
});

describe('editor detection', () => {
  test('editor detection', () => {
    assert.equal(findEditorApp(['Code']), 'Code');
    assert.equal(findEditorApp(['idea64']), 'idea64');
    assert.equal(findEditorApp(['chrome']), null);
  });
});

describe('music parsing + reactions', () => {
  test('parses SMTC watcher output (case-insensitive status)', () => {
    const m = parseMusicLine('{"status":"Playing","title":"Nyan Cat","artist":"daniwell"}');
    assert.equal(m.status, 'playing');
    assert.equal(m.title, 'Nyan Cat');
  });
  test('garbage tolerated', () => {
    assert.equal(parseMusicLine('not json'), null);
    assert.equal(parseMusicLine(''), null);
  });
  test('start playing -> bop', () => {
    assert.equal(musicReaction(null, { status: 'playing', title: 'a', artist: '' }), 'bop');
  });
  test('track change while playing -> excited', () => {
    assert.equal(musicReaction({ status: 'playing', title: 'a', artist: '' }, { status: 'playing', title: 'b', artist: '' }), 'excited');
  });
  test('stopped -> stop', () => {
    assert.equal(musicReaction({ status: 'playing', title: 'a', artist: '' }, { status: 'stopped', title: '', artist: '' }), 'stop');
  });
});

describe('status file verdicts', () => {
  test('green words celebrate', () => {
    assert.equal(parseStatusFile('BUILD PASSED in 32s ✓'), 'good');
    assert.equal(parseStatusFile('all tests ok'), 'good');
  });
  test('red words mope', () => {
    assert.equal(parseStatusFile('FAILED: 2 tests'), 'bad');
    assert.equal(parseStatusFile('error TS2345'), 'bad');
    assert.equal(parseStatusFile('exit code 1'), 'bad');
  });
  test('neutral stays neutral', () => {
    assert.equal(parseStatusFile('compiling...'), null);
    assert.equal(parseStatusFile(''), null);
  });
});
