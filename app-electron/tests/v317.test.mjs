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
import { createVoiceListener, parseVoiceLine } from '../src/voice-listener.js';
import { acceptEnginePhrase } from '../src/voice.js';
import { createSettings } from '../src/settings-store.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------ 1. voice
describe('v3.17 voice: the missing spawnFn can never silently kill the engine again', () => {
  test('no spawnFn -> named no-spawn-fn condition, no throw, no respawn storm', () => {
    const errors = [];
    const l = createVoiceListener({
      platform: 'win32',
      onPhrase: () => { throw new Error('must never hear a phrase'); },
      onError: e => errors.push(e),
    });
    l.start();                       // must not throw
    assert.equal(l.lastError, 'no-spawn-fn');
    assert.equal(l.running, false);  // nothing pretending to run
    l.stop();
  });

  test('a provided spawnFn actually spawns PowerShell (the v3.16 production break)', () => {
    const spawned = [];
    const l = createVoiceListener({
      platform: 'win32',
      spawnFn: (cmd, args) => {
        spawned.push({ cmd, args });
        return { stdout: { on() {} }, stderr: { on() {} }, on() {}, kill() {} };
      },
    });
    l.start();
    assert.equal(spawned.length, 1, 'the offline engine spawns IMMEDIATELY (parallel, not fallback-gated)');
    assert.equal(spawned[0].cmd, 'powershell.exe');
    l.stop();
  });

  test('engine errors surface through onError (exec-log diagnostics)', () => {
    const errors = [];
    const lines = [
      JSON.stringify({ status: 'listening', recognizer: 'MS-1033', culture: 'en-US' }),
      JSON.stringify({ error: 'grammar-failed' }),
    ];
    let buf = '';
    const child = {
      stdout: { on(_e, fn) { buf = fn; } },
      stderr: { on() {} },
      on() {}, kill() {},
    };
    const l = createVoiceListener({
      platform: 'win32',
      spawnFn: () => child,
      onError: e => errors.push(e),
    });
    l.start();
    for (const line of lines) buf(line + '\n');
    assert.deepEqual(errors, ['grammar-failed']);
    assert.equal(l.lastError, 'grammar-failed');
    l.stop();
  });

  test('SAPI phrases are gated while the web engine is healthy', () => {
    assert.equal(acceptEnginePhrase('sapi', true), false, 'web is live → ignore offline duplicates');
    assert.equal(acceptEnginePhrase('sapi', false), true, 'web dead → the offline engine speaks');
    assert.equal(acceptEnginePhrase('web', true), true);
    assert.equal(acceptEnginePhrase('web', false), true);
  });

  test('main.js passes a REAL spawnFn (regression: the v3.16 refactor dropped it)', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    const anchor = src.indexOf('const voiceListener = createVoiceListener({');
    const call = src.slice(anchor, anchor + 900);
    assert.ok(/spawnFn:\s*\(cmd,\s*args,\s*opts2?\)\s*=>\s*spawn\(cmd,\s*args/.test(call),
      'main.js must hand the listener a working spawn function');
  });

  test('main.js arms BOTH engines in parallel when voice is enabled', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    const fn = src.slice(src.indexOf('function applyVoiceFlag()'), src.indexOf('function applyVoiceFlag()') + 600);
    assert.ok(fn.includes('startWebVoice()'), 'web engine arms');
    assert.ok(/process\.platform === 'win32'\)\s*\{\s*voiceListener\.start\(\)/.test(fn),
      'offline engine arms IN PARALLEL — never waits for a failure report');
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
        assert.ok(Math.abs(a.legs[i].fy - c.legs[i].fy) < 1.5, `leg ${i} fy continuous at ${b} (Δ${Math.abs(a.legs[i].fy - c.legs[i].fy).toFixed(2)})`);
      }
      assert.ok(Math.abs(a.bodyX - c.bodyX) < 0.5, `bodyX continuous at ${b}`);
    }
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

describe('v3.17 flicker: a cat trapped inside a no-walk zone escapes, it never vibrates', () => {
  test('walking inside a covering zone flips direction at most a few times and escapes', () => {
    const b = mkBrain(7, { speed: 220 });
    b._enter('walk', 60);
    b.setNoWalkZones([{ x: 600, y: 0, w: 900, h: 1080 }]);   // zone ON the cat
    b.x = 900; b.baseY = b.groundY;
    let flips = 0, lastDir = b.dir;
    for (let i = 0; i < 60 * 6 && b.x > 480 && b.x < 1620; i++) {   // ≤6s
      b.tick(1 / 60);
      if (b.dir !== lastDir) { flips++; lastDir = b.dir; }
    }
    assert.ok(flips <= 4, `direction flips stayed bounded (${flips}, was ~240/tick-storm)`);
    assert.ok(b.x < 480 || b.x > 1620, `escaped the zone (x=${b.x.toFixed(0)})`);
  });

  test('ordinary blocked steps turn around — with a 0.45s flip cooldown', () => {
    const b = mkBrain();
    b.setNoWalkZones([{ x: 700, y: 0, w: 60, h: 1080 }]);   // wall ahead
    b.baseY = b.groundY;
    b.x = 640; b.dir = 1; b.t = 0;
    assert.equal(b._moveX(6), true, 'blocked at the zone edge');
    assert.equal(b.dir, -1, 'first block flips');
    b.x = 640; b.dir = 1; b.t += 0.1;
    assert.equal(b._moveX(6), true, 'blocked again');
    assert.equal(b.dir, 1, 'a flip within 0.45s is SUPPRESSED (dir unchanged — anti-flicker)');
    b.x = 640; b.dir = 1; b.t += 0.5;
    b._moveX(6);
    assert.equal(b.dir, -1, 'after the cooldown the turn happens again');
  });
});

// ------------------------------------------------------------ 4/5. reactions removed
describe('v3.17 reactions: the whole feature set is gone end-to-end', () => {
  const REACTION_KEYS = ['reactSystemSpikes', 'reactLowBattery', 'timeOfDayMood', 'reactNewWindows',
    'reactMusic', 'reactApps', 'reactTyping', 'stalkCursor', 'reactBuildStatus', 'statusFile'];

  test('no reaction key survives a legacy settings load', () => {
    const s = createSettings({ read: () => JSON.stringify({ breed: 'ginger_kitten', reactTyping: true, stalkCursor: true, reactMusic: true }), write: () => {} });
    for (const k of REACTION_KEYS) assert.ok(!(k in s.all), `${k} must be dropped by sanitize`);
    assert.equal(s.get('breed'), 'ginger_kitten', 'real data survives');
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
