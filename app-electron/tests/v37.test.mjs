// v37.test.mjs — regression tests for the v3.7 robustness/perf pass:
//   * region slide hop-flap fix (TOPSLACK) + companion leash math
//   * sys-monitor streaming sampler (win32): lines -> samples, watchdog
//     restart, fallback to one-shot after repeated failures, clean stop
//   * topmost enforcer skips redundant native pokes
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import {
  computeRegionSize, slideIfNeeded, companionLeash,
} from '../src/region.js';
import { createSysMonitor, parseWinStats, winStatsStreamScript } from '../src/sys-monitor.js';
import { createTopmostEnforcer } from '../src/topmost.js';

const WA = { x: 0, y: 0, width: 1600, height: 1000 };

// ------------------------------------------------------------------ region
describe('v3.7 region slide (hop-flap fix)', () => {
  const r = computeRegionSize(1, WA);           // 480 x 384
  const o = { x: 560, y: 616 };                 // legal origin for feet 992

  test('a full in-place hop (70px) no longer slides the window', () => {
    // ground feet 992, hop apex 992-70 = 922 — used to breach the zero-width
    // top band and flap the overlay up/down on every hop
    assert.equal(slideIfNeeded(o, r, 800, 922, WA, 1), null);
  });

  test('small idle bobs (bop 4px, zoomies 9px) never slide', () => {
    for (const dy of [2, 4, 9, 20]) {
      assert.equal(slideIfNeeded(o, r, 800, 992 - dy, WA, 1), null, `dy=${dy}`);
    }
  });

  test('a real climb (breach beyond the slack) still slides up', () => {
    const up = slideIfNeeded(o, r, 800, 992 - 160, WA, 1);
    assert.ok(up && up.y < o.y, `slides up (${JSON.stringify(up)})`);
    // the big vertical ride from the v3.3 suite keeps working
    const up2 = slideIfNeeded(o, r, 800, 500, WA, 1);
    assert.ok(up2 && up2.y < o.y);
  });

  test('horizontal behavior unchanged (band + clamps)', () => {
    assert.equal(slideIfNeeded(o, r, 700, 992, WA, 1), null);
    const left = slideIfNeeded(o, r, 660, 992, WA, 1);
    assert.ok(left && left.x < o.x);
    const far = slideIfNeeded(o, r, 1590, 992, WA, 1);
    assert.ok(far.x + r.w <= WA.width && far.y + r.h <= WA.height);
  });

  test('hysteresis: no oscillation from a bobbing cat (the flap was a loop)', () => {
    for (let i = 0; i < 50; i++) {
      const dy = Math.abs(Math.sin(i * 0.7)) * 70;
      assert.equal(slideIfNeeded(o, r, 800, 992 - dy, WA, 1), null, `i=${i} dy=${dy}`);
    }
  });
});

describe('v3.7 companion leash', () => {
  test('leash keeps the kitten inside the region at every scale', () => {
    for (let s = 0.5; s <= 2.0001; s += 0.05) {
      const r = computeRegionSize(s, WA);
      const leash = companionLeash(r.w);
      // kitten is at most leash+50 (hard net) from the main cat; the slide
      // centers the pair midpoint, so each cat sits <= (leash+50)/2 from the
      // region center after a slide. The net must be well under half the
      // region width so both cats always fit on screen.
      assert.ok(leash + 50 <= r.w / 2, `scale ${s.toFixed(2)}: net ${leash + 50} fits region ${r.w}`);
      assert.ok(leash >= 110, 'leash never pinches the kitten');
    }
  });

  test('degenerate widths fall back to a sane leash', () => {
    assert.equal(companionLeash(0), 160);     // non-finite -> default 480 -> 160
    assert.equal(companionLeash(NaN), 160);
    assert.ok(companionLeash(100000) > 110, 'huge region -> wide leash');
    assert.equal(companionLeash(480), 160);
  });
});

// -------------------------------------------------------------- sys-monitor
// fake spawn: a process object whose stdout can be pushed from the test
function fakeSpawn() {
  const p = new EventEmitter();
  p.stdout = new EventEmitter();
  p.killed = false;
  p.kill = () => { p.killed = true; p.emit('close', 0); };
  return p;
}

describe('v3.7 sys-monitor streaming sampler (win32)', () => {
  test('stream script loops with the requested interval', () => {
    const s = winStatsStreamScript(8);
    assert.ok(s.includes('$interval = 8'), 'interval baked in');
    assert.ok(s.includes('while ($true)'), 'streams forever');
    assert.ok(s.includes('Start-Sleep -Seconds $interval'));
  });

  test('emitted JSON lines become samples (spawn + parse pipeline)', async () => {
    const samples = [];
    const spawned = [];
    const mon = createSysMonitor({
      spawnFn: (cmd, args) => {
        spawned.push({ cmd, args });
        const p = fakeSpawn();
        queueMicrotask(() => {
          p.stdout.emit('data', Buffer.from('{"cpu":42,"ram":61,"battery":88,"charging":true}\n'));
        });
        return p;
      },
      platform: 'win32',
      intervalMs: 1000,
      onSample: s => samples.push(s),
    });
    mon.start();
    await new Promise(r => setTimeout(r, 60));
    assert.ok(spawned.length >= 1, 'spawns the streamer');
    assert.ok(spawned[0].args.join(' ').includes('while ($true)'), 'uses the STREAM script');
    assert.equal(samples.length, 1);
    assert.deepEqual(samples[0], { cpu: 42, ram: 61, battery: 88, charging: true });
    assert.equal(mon.__streamAlive(), true, 'stream process is alive');
    mon.stop();
    assert.equal(mon.__streamAlive(), false, 'stream killed on stop');
  });

  test('dead streamer restarts with backoff, then falls back to the timer', async () => {
    const procs = [];
    const mon = createSysMonitor({
      // tag each fake process: the streamer's command line contains the loop
      spawnFn: (_cmd, args) => {
        const p = fakeSpawn();
        p.__stream = args.join(' ').includes('while ($true)');
        procs.push(p);
        return p;
      },
      platform: 'win32',
      intervalMs: 1000,
      onSample: () => {},
    });
    try {
      mon.start();
      await new Promise(r => setTimeout(r, 20));
      const stream0 = procs.find(p => p.__stream);
      assert.ok(stream0, 'a streamer was spawned');
      // the streamer emits nothing and we kill it -> 'close' -> restart (2s backoff)
      stream0.kill();
      await new Promise(r => setTimeout(r, 2600));
      assert.ok(mon.__streamFails() >= 1, 'failure counted');
      const spawnsNow = procs.filter(p => p.__stream).length;
      assert.ok(spawnsNow >= 2, `respawned a streamer (${spawnsNow})`);
      // keep killing streamers -> crosses the 4-fail line -> one-shot timer takes over
      for (let i = 0; i < 6 && mon.__streamFails() < 4; i++) {
        const alive = [...procs].reverse().find(p => p.__stream && !p.killed);
        if (alive) alive.kill();
        await new Promise(r => setTimeout(r, 2600));
      }
      assert.ok(mon.__streamFails() >= 4, `fails accumulated (${mon.__streamFails()})`);
      assert.ok(mon.running, 'sampler still alive on the fallback path');
    } finally {
      mon.stop();
      for (const p of procs) { try { p.kill(); } catch {} }
    }
  });

  test('hung streamer (no output) is killed by the watchdog and replaced', async () => {
    let spawnCount = 0;
    const mon = createSysMonitor({
      spawnFn: () => { spawnCount++; return fakeSpawn(); },
      platform: 'win32',
      intervalMs: 300,   // watchdog = 300*2.5+1500 ≈ 2.25s
      onSample: () => {},
    });
    mon.start();
    await new Promise(r => setTimeout(r, 4200));
    assert.ok(spawnCount >= 2, `watchdog respawned the silent streamer (${spawnCount})`);
    mon.stop();
  });

  test('linux path unchanged: /proc sampling via timer, zero subprocesses', async () => {
    let spawnCalled = 0;
    const mon = createSysMonitor({
      spawnFn: () => { spawnCalled++; return fakeSpawn(); },
      readFn: p => (p === '/proc/stat' ? 'cpu  100 0 100 700 0 0 0 0 0 0' : null),
      platform: 'linux',
      intervalMs: 1000,
      onSample: () => {},
    });
    mon.start();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(mon.__streamAlive(), false, 'no streamer on linux');
    // v3.10: the ps process list is gone with call detection — the sampler
    // spawns NOTHING on linux.
    assert.equal(spawnCalled, 0, 'no subprocess at all on linux');
    mon.stop();
  });

  test('parseWinStats still tolerant (regression guard)', () => {
    assert.deepEqual(parseWinStats('{"cpu":12,"ram":48,"battery":87,"charging":true}'),
      { cpu: 12, ram: 48, battery: 87, charging: true });
    assert.equal(parseWinStats('garbage').cpu, null);
  });
});

// ------------------------------------------------------------------ topmost
describe('v3.7 topmost enforcer skips redundant pokes', () => {
  test('skips setAlwaysOnTop when the flag is already set', async () => {
    const w = new EventEmitter();
    let calls = 0;
    w.setAlwaysOnTop = () => { calls++; };
    w.isAlwaysOnTop = () => true;                 // already topmost
    const e = createTopmostEnforcer(w, { intervalMs: 20 });
    e.start();
    await new Promise(r => setTimeout(r, 70));
    e.stop();
    assert.equal(calls, 0, 'no native calls when already topmost');
    assert.equal(e.enforceCount, 0);
  });

  test('still enforces when there is no getter (real Windows path)', async () => {
    const w = new EventEmitter();
    let calls = 0;
    w.setAlwaysOnTop = () => { calls++; };
    const e = createTopmostEnforcer(w, { intervalMs: 20 });
    e.start();
    await new Promise(r => setTimeout(r, 70));
    e.stop();
    assert.ok(calls >= 2, `enforced repeatedly (${calls})`);
  });
});
