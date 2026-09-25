// v317.test.mjs — the "the cat finally HEARS you + the exact dance" release.
//
// Pins five things:
//   1. THE VOICE ROOT CAUSE: createVoiceListener with no spawnFn must never
//      again die silently (the v3.16 'spawn-failed' respawn loop that left
//      the user with zero working engines), and the offline-engine phrase
//      gate keeps coarser duplicates out while the web engine is healthy.
//   2. THE DANCE matches the reference sheet on the user's terms: STUBBY
//      legs (legK < 1) on a low compact body, REAL side travel (bodyX) in
//      steps 1-2 — no more rocking in place — and phase-boundary continuity
//      (no pose snaps: the v3.16 "flickering" report).
//   3. THE FLICKER root cause outside the dance: a cat trapped inside a
//      no-walk zone must NOT flip direction every tick; it escapes toward
//      the nearest outside point with its direction held.
//   4. The Reactions feature set is gone end-to-end (settings, flags,
//      pollers, handler files).
//   5. Removed reaction keys cannot survive a settings load (sanitize).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { poseForState, BODIES } from '../src/cat-renderer.js';
import { CatBrain, mulberry32 } from '../src/cat-brain.js';
import { createSettings } from '../src/settings-store.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------ 1. voice — GONE
describe('v3.18 voice: the whole feature set is REMOVED (user directive)', () => {
  test('the engine files no longer exist', () => {
    for (const f of ['src/voice.js', 'src/voice-listener.js', 'src/music-launcher.js', 'windows/voice.html']) {
      assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} must be deleted`);
    }
  });

  test('main.js carries no voice machinery', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    for (const sym of ['createVoiceListener', 'parseVoiceCommand', 'createMusicLauncher', 'startWebVoice',
                       'applyVoiceFlag', 'voiceStatus', 'sendMediaKey', 'handleVoicePhrase', 'voice:get', 'voice:set']) {
      assert.ok(!src.includes(sym), `main.js must not reference ${sym}`);
    }
  });

  test('the preload bridge exposes no voice channels', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'preload.cjs'), 'utf8');
    for (const sym of ['voiceGet', 'voiceSet', 'voiceInject', 'voiceState', 'voiceEngineEvent',
                       "'voice-bubble'", "'voice-salute'", "'voice-state'"]) {
      assert.ok(!src.includes(sym), `preload must not reference ${sym}`);
    }
    assert.ok(src.includes('voice:test-music'), 'the music-state test seam stays (meow gate)');
  });

  test('settings.html has no Voice card', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'windows', 'settings.html'), 'utf8');
    assert.ok(!src.includes('voiceCommands'), 'the voice toggle is gone from the UI');
    assert.ok(!src.includes('renderVoiceStatus'), 'the status renderer is gone');
    assert.ok(!src.includes('hey cat'), 'the cheat-sheet is gone');
  });
});

// ------------------------------------------------------------ 2. dance
const B = BODIES.normal;
const pal = { body: 'normal', fur: '#c8b48c', dark: '#8a7350', belly: '#e8dcc4', earIn: '#e89aa2' };
const pose = (stateT, t = stateT) => poseForState('dance', t, 0.5, B, pal, stateT);
const BOUNDARIES = [1.7, 3.4, 5.6, 7.6, 9.4];

describe('v3.17 dance: stubby legs, real side steps, zero boundary snaps', () => {
  test('the stand draws SHORT thick legs on a LOW body', () => {
    for (const t of [0.2, 2.0, 4.5, 6.9, 8.5, 10.2]) {
      const p = pose(t);
      assert.ok(p.legK < 1, `stubby legs at t=${t} (legK ${p.legK})`);
      assert.ok(p.bodyY >= 0 && p.bodyY <= 8, `low compact body at t=${t} (bodyY ${p.bodyY})`);
    }
  });

  test('steps 1-2 actually TRAVEL sideways (bodyX), they do not rock in place', () => {
    // phase 1: monotonic glide to +13
    let prev = 0;
    for (let t = 0.1; t <= 1.69; t += 0.2) {
      const x = pose(t).bodyX;
      assert.ok(x > prev, `glides RIGHT through phase 1 (t=${t}: ${x.toFixed(1)} > ${prev.toFixed(1)})`);
      prev = x;
    }
    assert.ok(pose(1.69).bodyX > 11, `ends far right (${pose(1.69).bodyX.toFixed(1)})`);
    // phase 2: monotonic glide to -13
    prev = pose(1.71).bodyX;
    for (let t = 1.9; t <= 3.39; t += 0.2) {
      const x = pose(t).bodyX;
      assert.ok(x < prev, `glides LEFT through phase 2 (t=${t})`);
      prev = x;
    }
    assert.ok(pose(3.39).bodyX < -11, `ends far left (${pose(3.39).bodyX.toFixed(1)})`);
    // bounded inside the window
    for (let t = 0; t <= 11.3; t += 0.1) assert.ok(Math.abs(pose(t).bodyX) <= 13.5);
  });

  test('no pose snaps at phase boundaries (the v3.16 flicker)', () => {
    for (const b of BOUNDARIES) {
      const a = pose(b - 0.016), c = pose(b + 0.016);
      assert.ok(Math.abs(a.bodyRot - c.bodyRot) < 0.03, `bodyRot continuous at ${b} (Δ${Math.abs(a.bodyRot - c.bodyRot).toFixed(4)})`);
      for (let i = 0; i < 4; i++) {
        if (!a.legs[i] || !c.legs[i]) continue;  // lifted paws hand off via overlayPaw
        assert.ok(Math.abs(a.legs[i].fy - c.legs[i].fy) < 1.5, `leg ${i} fy continuous at ${b} (Δ${Math.abs(a.legs[i].fy - c.legs[i].fy).toFixed(2)})`);
      }
      assert.ok(Math.abs(a.bodyX - c.bodyX) < 0.5, `bodyX continuous at ${b}`);
    }
  });

  test('raised paws HAND OFF continuously between regular legs and overlay (no 6-leg ghost)', () => {
    const a = pose(3.4 - 0.016), c = pose(3.4 + 0.016);   // step left → hands up
    assert.ok(Math.abs(c.overlayPaw[0].fy - a.legs[0].fy) < 1.5,
      `near paw lifts from the exact chest pose at 3.4 (Δ${Math.abs(c.overlayPaw[0].fy - a.legs[0].fy).toFixed(2)})`);
    assert.ok(Math.abs(c.overlayPaw[0].fx - a.legs[0].fx) < 1.5, 'near paw x hands off cleanly');
    assert.ok(Math.abs(c.overlayPaw[1].fy - a.legs[1].fy) < 1.5, 'far paw y hands off cleanly');
    const b = pose(5.6 - 0.016), d = pose(5.6 + 0.016);   // hands up → spin
    assert.ok(Math.abs(b.overlayPaw[0].fy - d.legs[0].fy) < 1.5, 'paws lower back to the hand-off at 5.6');
    const e = pose(9.4 - 0.016), f = pose(9.4 + 0.016);   // whip → finish
    assert.ok(Math.abs(f.overlayPaw.fy - e.legs[0].fy) < 1.5, 'cheek paw hands off at 9.4');
  });

  test('hands-up paws sit just OVER the ears (compact — not sky-high stilts)', () => {
    const up = pose(4.5);
    assert.ok(up.overlayPaw[0].fy > -125 && up.overlayPaw[0].fy < -100,
      `near paw ${up.overlayPaw[0].fy} — head-top height, no long arms`);
  });

  test('walk keeps full-length legs (legK only reshapes the dance)', () => {
    const w = poseForState('walk', 0.3, 0.5, B, pal, 0);
    assert.equal(w.legK, 1);
    assert.equal(w.bodyX, 0);
  });
});

// ------------------------------------------------------------ 3. flicker
function mkBrain(seed = 7, over = {}) {
  return new CatBrain({
    bounds: { x: 0, y: 0, w: 1920, h: 1080 },
    groundY: 1040,
    rand: mulberry32(seed),
    ...over,
  });
}

describe('v3.18 flicker: a blocked cat STOPS, sniffs, and turns ONCE — never vibrates', () => {
  test('a wall ahead flips the facing at most twice over 10 seconds', () => {
    const b = mkBrain(7, { speed: 120 });
    b._enter('walk', 60);
    b.setNoWalkZones([{ x: 320, y: 0, w: 1500, h: 1080 }]);   // wall ahead
    b.x = 220; b.dir = 1; b.baseY = b.groundY;
    let flips = 0, lastDir = b.dir;
    for (let i = 0; i < 60 * 10; i++) {
      b.tick(1 / 60);
      if (b.dir !== lastDir) { flips++; lastDir = b.dir; }
    }
    assert.ok(flips <= 2, `one deliberate turn max in 10s against a wall (got ${flips})`);
  });

  test('turns are held apart by the 2.5s cooldown (no both-side oscillation)', () => {
    const b = mkBrain(3, { speed: 150 });
    b._enter('walk', 90);
    b.setNoWalkZones([{ x: 420, y: 0, w: 120, h: 1080 }, { x: -400, y: 0, w: 120, h: 1080 }]);
    b.x = 300; b.dir = 1; b.baseY = b.groundY;
    const turnsAt = [];
    let lastDir = b.dir;
    for (let i = 0; i < 60 * 24; i++) {
      b.tick(1 / 60);
      if (b.dir !== lastDir) { turnsAt.push(i / 60); lastDir = b.dir; }
    }
    assert.ok(turnsAt.length >= 1, 'the cat does turn around eventually');
    for (let i = 1; i < turnsAt.length; i++) {
      assert.ok(turnsAt[i] - turnsAt[i - 1] >= 2.4,
        `consecutive turns are >= 2.4s apart (gap ${ (turnsAt[i] - turnsAt[i - 1]).toFixed(2) }s)`);
    }
  });

  test('trapped INSIDE a zone still escapes (the v3.17 behavior is kept)', () => {
    const b = mkBrain(7, { speed: 220 });
    b._enter('walk', 60);
    b.setNoWalkZones([{ x: 600, y: 0, w: 900, h: 1080 }]);   // zone ON the cat
    b.x = 900; b.baseY = b.groundY;
    for (let i = 0; i < 60 * 10 && b.x > 480 && b.x < 1620; i++) {   // ≤10s
      b.tick(1 / 60);
    }
    assert.ok(b.x < 480 || b.x > 1620, `escaped the zone (x=${b.x.toFixed(0)})`);
  });

  test('a free cat with no zones walks calmly (travel without flip storms)', () => {
    const b = mkBrain(11, { speed: 120 });
    b._enter('walk', 120);
    b.baseY = b.groundY;
    const xs = new Set();
    let flips = 0, lastDir = b.dir;
    for (let i = 0; i < 60 * 30; i++) {
      b.tick(1 / 60);
      xs.add(Math.round(b.x));
      if (b.dir !== lastDir) { flips++; lastDir = b.dir; }
    }
    // 30s of calm walking: a couple of deliberate bound-turns at most, and
    // the cat genuinely travels instead of vibrating in place
    assert.ok(flips <= 3, `direction changes stay deliberate (${flips} in 30s)`);
    assert.ok(xs.size > 200, `the cat actually travels (${xs.size} distinct x positions)`);
  });
});

// ------------------------------------------------------------ 4/5. reactions removed
describe('v3.17 reactions: the whole feature set is gone end-to-end', () => {
  const REACTION_KEYS = ['reactSystemSpikes', 'reactLowBattery', 'timeOfDayMood', 'reactNewWindows',
    'reactMusic', 'reactApps', 'reactTyping', 'stalkCursor', 'reactBuildStatus', 'statusFile'];

  test('no reaction key survives a legacy settings load', () => {
    const s = createSettings({ read: () => JSON.stringify({ breed: 'orange_tabby', reactTyping: true, stalkCursor: true, reactMusic: true }), write: () => {} });
    for (const k of REACTION_KEYS) assert.ok(!(k in s.all), `${k} must be dropped by sanitize`);
    assert.equal(s.get('breed'), 'orange_tabby', 'real data survives');
  });

  test('settings page has no Reactions nav/section and no Focus page', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'windows', 'settings.html'), 'utf8');
    assert.ok(!html.includes('data-page="reactions"'), 'Reactions nav item gone');
    assert.ok(!html.includes('id="page-reactions"'), 'Reactions section gone');
    assert.ok(!html.includes('data-page="focus"'), 'Focus nav item gone');
    assert.ok(!html.includes('id="page-focus"'), 'Focus section gone');
    for (const k of REACTION_KEYS) assert.ok(!html.includes(k), `${k} must not appear anywhere in the settings UI`);
    // the moved cards live on the homepage
    const home = html.slice(html.indexOf('id="page-home"'), html.indexOf('id="page-home"') + 6500);
    assert.ok(home.includes('pomoFocus'), 'pomodoro card on the homepage');
    assert.ok(home.includes('remList'), 'reminder list on the homepage');
  });

  test('main.js runs no reaction pollers (sys-monitor / typing hook / cursor watch / status file)', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    for (const sym of ['createSysMonitor', 'createSpikeDetector', 'createTypingMeter', 'createTypingHookManager',
                       'startCursorWatch', 'applyStatusFile', 'diffWindows', 'findEditorApp', 'musicReaction']) {
      assert.ok(!src.includes(sym), `main.js must not reference ${sym}`);
    }
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'sys-monitor.js')), 'sys-monitor.js deleted');
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'typing-hook.js')), 'typing-hook.js deleted');
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'typing-hook-child.cjs')), 'typing-hook-child.cjs deleted');
  });

  test('cat.html has no reaction handlers left and the meow queue is installed', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'windows', 'cat.html'), 'utf8');
    for (const sym of ['onSystemEvent', 'onTyping', 'onCursorIdle', 'onCursorBusy', 'onNewWindow', 'onAppFocus', 'applyBatteryCrisis', '__setBattery', '__pollBattery']) {
      assert.ok(!html.includes(sym), `cat.html must not reference ${sym}`);
    }
    assert.ok(html.includes('MEOW_QUEUE_MAX'), 'the sequential meow queue is installed');
    assert.ok(html.includes("window.meow.on('music-state'"), 'the double-click meow gate keeps its music-state feed');
    assert.ok(html.includes('__testMeow'), 'e2e meow-queue seam present');
  });

  test('the music watcher runs ALWAYS (meow gate), not behind reactMusic', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    const fn = src.slice(src.indexOf('function applyFeatureFlags()'), src.indexOf('function applyFeatureFlags()') + 500);
    assert.ok(fn.includes('musicWatcher.start()'), 'unconditional start');
    assert.ok(!fn.includes("store.get('reactMusic')"), 'no reaction flag gate');
  });
});

// ------------------------------------------------------------ pomodoro realtime
describe('v3.17 pomodoro: the countdown is realtime (1s cadence)', async () => {
  test('the heartbeat broadcasts every second, not every 5th', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    const i = src.indexOf('pomodoro heartbeat');
    const block = src.slice(i, i + 700);
    assert.ok(!block.includes('% 5'), 'no 5s gating left');
    assert.ok(block.includes("broadcastPomodoro('tick')"));
  });
});
