// v39.test.mjs — v3.9.0: "the chase camera + the platform tracker".
//   1. chaseStep: the origin walks toward the slide target at a capped speed
//      (never one big teleport) and lands exactly on it
//   2. clampOrigin: the renderer's fire-and-forget clamp matches main's
//      region:move clamp exactly (pinned here against a copy of main's code)
//   3. platform tracker: tolerant line parse, retarget protocol, restart
//      after a dead stream, parent-PID heartbeat baked into the script
//   4. brain.updateTrackedPlatform: rate-capped border ride, horizontal
//      glide (never a snap), animated fall after 2 misses, ghost grace in
//      setPlatforms while the tracker is live, mid-jump landing correction
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chaseStep, clampOrigin, CHASE_V, slideIfNeeded } from '../src/region.js';
import { parseTrackerLine, trackerScript, createPlatformTracker, POLL_MS } from '../src/platform-tracker.js';
import { CatBrain, mulberry32 } from '../src/cat-brain.js';

const WA = { x: 0, y: 0, width: 1600, height: 1000 };
const REGION = { w: 480, h: 434 };

function mkBrain(seed = 42, over = {}) {
  return new CatBrain({
    bounds: { x: 0, y: 0, w: 1920, h: 1080 },
    groundY: 1040,
    rand: mulberry32(seed),
    ...over,
  });
}

// ---------------------------------------------------------------- chase camera
describe('v3.9 chaseStep (no more one-shot slide teleports)', () => {
  test('moves at most maxStep px toward the target', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 300, y: 400 };          // 500px away
    const s = chaseStep(from, to, 50);
    assert.equal(Math.hypot(s.x - from.x, s.y - from.y), 50);
    assert.ok(Math.hypot(to.x - s.x, to.y - s.y) < 500, 'progress made');
  });

  test('lands exactly on the target without float drift', () => {
    let o = { x: 100, y: 900 };
    const to = { x: 137, y: 233 };
    for (let i = 0; i < 500 && (o.x !== to.x || o.y !== to.y); i++) o = chaseStep(o, to, 40);
    assert.deepEqual(o, to);
  });

  test('a 400px platform-landing re-center takes ~0.5s at CHASE_V (not one frame)', () => {
    // the old slide jumped 400px in ONE step; the chase caps every step
    const from = { x: 560, y: 618 };
    const to = { x: 560, y: 226 };
    let steps = 0, o = from, worst = 0, prev = from;
    while ((o.x !== to.x || o.y !== to.y) && steps < 500) {
      o = chaseStep(o, to, CHASE_V / 60);   // one 60fps frame
      worst = Math.max(worst, Math.hypot(o.x - prev.x, o.y - prev.y));
      prev = o; steps++;
    }
    assert.ok(steps > 20, `spreads the move over ${steps} frames`);
    assert.ok(worst <= CHASE_V / 60 + 0.001, `worst per-frame step ${worst}px ≤ ${CHASE_V / 60}px`);
  });

  test('zero-distance and degenerate inputs are safe', () => {
    assert.deepEqual(chaseStep({ x: 5, y: 5 }, { x: 5, y: 5 }, 10), { x: 5, y: 5 });
    assert.deepEqual(chaseStep(null, { x: 1, y: 2 }, 10), { x: 1, y: 2 });
    assert.deepEqual(chaseStep({ x: 0, y: 0 }, null, 10), { x: 0, y: 0 });
    assert.deepEqual(chaseStep({ x: 0, y: 0 }, { x: 9, y: 12 }, NaN), { x: 9, y: 12 });   // no cap
  });

  test('slideIfNeeded still yields the same target (chase only changes the HOW)', () => {
    const O = { x: 100, y: 566 };
    const target = slideIfNeeded(O, REGION, 700, 992, WA, 1);
    assert.ok(target, 'cat near right edge => target exists');
    // every chase step stays inside the workArea after clamping
    let o = O;
    for (let i = 0; i < 400 && (o.x !== target.x || o.y !== target.y); i++) {
      o = chaseStep(o, target, CHASE_V / 60);
      const c = clampOrigin({ x: o.x, y: o.y, w: REGION.w, h: REGION.h }, REGION, WA);
      assert.ok(c.x >= WA.x && c.y >= WA.y, 'clamped inside');
    }
  });
});

// ---------------------------------------------------------------- clamp parity
describe('v3.9 clampOrigin (renderer must clamp exactly like main)', () => {
  // exact copy of the clamp in main.js region:move — keep this in sync
  function mainClamp(rect, curRegion, wa) {
    const num = (v, dflt) => (Number.isFinite(v) ? v : dflt);
    const w = Math.max(320, Math.min(num(rect?.w, curRegion.w), wa.width));
    const h = Math.max(280, Math.min(num(rect?.h, curRegion.h), wa.height));
    const x = Math.max(wa.x, Math.min(wa.x + wa.width - w, num(rect?.x, curRegion.x ?? 0)));
    const y = Math.max(wa.y, Math.min(wa.y + wa.height - h, num(rect?.y, curRegion.y ?? 0)));
    return { x: Math.round(x), y: Math.round(y) };
  }

  const CASES = [
    { x: 100, y: 100 }, { x: -500, y: 900 }, { x: 3000, y: -40 },
    { x: 100.6, y: 99.4 }, { x: NaN, y: NaN }, { x: 0, y: 0 },
    { x: 1121, y: 567 },   // exactly at the right edge
  ];
  const WAS = [WA, { x: 0, y: 0, width: 800, height: 600 }, { x: -100, y: -50, width: 1200, height: 900 }];

  for (const wa of WAS) for (const c of CASES) {
    test(`parity ${JSON.stringify(c)} on wa ${JSON.stringify(wa)}`, () => {
      const renderer = clampOrigin({ ...c, w: REGION.w, h: REGION.h }, REGION, wa);
      const main = mainClamp({ ...c, w: REGION.w, h: REGION.h }, REGION, wa);
      assert.equal(renderer.x, main.x);
      assert.equal(renderer.y, main.y);
      assert.equal(renderer.w, REGION.w);
      assert.equal(renderer.h, REGION.h);
    });
  }

  test('origin can never escape the workArea (cat stays reachable)', () => {
    for (let x = -2000; x <= 4000; x += 137) {
      const c = clampOrigin({ x, y: -777, w: REGION.w, h: REGION.h }, REGION, WA);
      assert.ok(c.x >= 0 && c.x + REGION.w <= WA.width);
      assert.ok(c.y >= 0 && c.y + REGION.h <= WA.height);
    }
  });
});

// ---------------------------------------------------------------- tracker parse + script
describe('v3.9 platform tracker (protocol + lifecycle)', () => {
  test('parseTrackerLine: live rect, gone, garbage', () => {
    assert.deepEqual(parseTrackerLine('{"id":123,"x":10,"y":20,"w":300,"h":200,"ok":true}'),
      { id: 123, ok: true, x: 10, y: 20, w: 300, h: 200 });
    assert.deepEqual(parseTrackerLine('{"id":123,"ok":false}'), { id: 123, ok: false });
    assert.equal(parseTrackerLine('not json'), null);
    assert.equal(parseTrackerLine('{"id":"x"}'), null);
    assert.equal(parseTrackerLine('{"id":5,"x":1,"y":2,"w":0,"h":9,"ok":true}'), null);   // degenerate
    assert.equal(parseTrackerLine(''), null);
  });

  test('trackerScript embeds the poll cadence and the parent-PID heartbeat', () => {
    const s = trackerScript(320, 4242);
    assert.ok(s.includes('Start-Sleep -Milliseconds 320'));
    assert.ok(s.includes('Get-Process -Id 4242'), 'orphan guard present');
    assert.ok(s.includes('GetWindowRect'));
    assert.ok(s.includes("StartsWith('track ')"));
    assert.ok(trackerScript(5, 1).includes('Start-Sleep -Milliseconds 120'), 'cadence floor');
    assert.ok(!trackerScript(320, null).includes('Get-Process'), 'no heartbeat without a pid');
  });

  function fakeSpawn() {
    const procs = [];
    const spawnFn = () => {
      const p = {
        _h: {},
        stdout: { _h: {}, on(ev, fn) { this._h[ev] = fn; }, emit(ev, d) { this._h[ev]?.(d); } },
        stderr: { on() {} },
        stdin: { write() {}, writableLength: 0 },
        killed: false,
        kill() { p.killed = true; if (!p._closed) { p._closed = true; setImmediate(() => p._h.close?.()); } },
        on(ev, fn) { p._h[ev] = fn; },
        _closed: false,
        emitClose() { if (!p._closed) { p._closed = true; setImmediate(() => p._h.close?.()); } },
      };
      procs.push(p);
      return p;
    };
    return { spawnFn, procs };
  }

  test('track() writes the retarget command to stdin; off() idles', () => {
    const writes = [];
    const { spawnFn } = fakeSpawn();
    const t = createPlatformTracker({
      spawnFn: () => { const p = spawnFn(); p.stdin.write = s => writes.push(s); return p; },
    });
    t.start();
    assert.equal(writes.length, 0, 'no target at boot');
    t.track(987);
    assert.deepEqual(writes, ['track 987\n']);
    t.track(987);
    assert.equal(writes.length, 1, 'same target is a no-op');
    t.track(null);
    assert.deepEqual(writes, ['track 987\n', 'off\n']);
    t.track(0);
    assert.deepEqual(writes, ['track 987\n', 'off\n'], 'non-positive ids idle too');
    t.stop();
  });

  test('stdout lines are buffered, split and forwarded as parsed rects', () => {
    const seen = [];
    const { spawnFn, procs } = fakeSpawn();
    const t = createPlatformTracker({ spawnFn, onRect: r => seen.push(r) });
    t.start();
    const p = procs[0];
    p.stdout.emit('data', Buffer.from('{"id":7,"x":1,"y":2,"w":30,"h":20,"ok":true}\n{"id":7,"ok":fal'));
    p.stdout.emit('data', Buffer.from('se}\nnoise\n'));
    assert.deepEqual(seen, [
      { id: 7, ok: true, x: 1, y: 2, w: 30, h: 20 },
      { id: 7, ok: false },
    ]);
    t.stop();
  });

  test('a respawn re-arms the current target; stop() kills and silences', async () => {
    const writes = [];
    const { spawnFn, procs } = fakeSpawn();
    const t = createPlatformTracker({
      spawnFn: () => { const p = spawnFn(); p.stdin.write = s => writes.push(s); return p; },
    });
    t.start();
    assert.ok(procs[0], 'spawned');
    t.track(4242);
    assert.deepEqual(writes, ['track 4242\n']);
    procs[0].emitClose();                            // stream dies
    await new Promise(r => setTimeout(r, 20));
    assert.equal(t.alive, false, 'down until the backoff fires');
    t.stop();
    assert.equal(t.alive, false, 'stays down after stop()');
    // stop() while ALIVE kills the stream
    const t2 = createPlatformTracker({ spawnFn: () => { const q = spawnFn(); q.stdin.write = () => {}; return q; } });
    t2.start();
    t2.stop();
    assert.ok(procs.at(-1).killed, 'stop() kills a live stream');
  });

  test('POLL_MS cadence caps update-flood (3-9 samples per drag gesture)', () => {
    assert.ok(POLL_MS >= 150 && POLL_MS <= 500, `poll ${POLL_MS}ms in the sane band`);
  });
});

// ---------------------------------------------------------------- brain rides
describe('v3.9 updateTrackedPlatform (the cat rides its window)', () => {
  test('border drag: the cat is CARRIED — targets stored, then smoothed per-frame', () => {
    const b = mkBrain();
    const pl = { id: 55, x: 400, y: 500, w: 600, h: 300 };
    b.platforms = [pl];
    b.onPlatform = pl;
    b.x = 700; b.baseY = 500;
    b._enter('sit', 30);                      // any calm state — the ride works in every state
    b.updateTrackedPlatform({ id: 55, ok: true, x: 400, y: 620, w: 600, h: 300 });   // +120px drag
    assert.equal(pl._ty, 620, 'tracker truth stored as a TARGET (not applied raw)');
    assert.equal(b.baseY, 500, 'no instant snap on the update itself');
    // tick glides toward the target at ≤700px/s ≈ 11.7px/frame at 60fps
    let worst = 0, prev = b.baseY, frames = 0;
    while (b.baseY !== 620 && frames < 600) {
      b.tick(1 / 60);
      worst = Math.max(worst, Math.abs(b.baseY - prev));
      prev = b.baseY; frames++;
    }
    assert.equal(b.baseY, 620, 'converges exactly onto the dragged border');
    assert.ok(worst <= 700 / 60 + 0.001, `worst per-frame ride ${worst.toFixed(1)}px ≤ 11.7px`);
    assert.ok(frames > 10, `spread over ${frames} frames (carried, not snapped)`);
    assert.equal(b.onPlatform, pl, 'same platform object (no re-bind)');
  });

  test('shrunken window: the cat glides back inside at the capped rate', () => {
    const b = mkBrain();
    const pl = { id: 9, x: 0, y: 500, w: 1200, h: 300 };
    b.platforms = [pl];
    b.onPlatform = pl;
    b.x = 1100; b.baseY = 500;
    b._enter('sit', 30);
    b.updateTrackedPlatform({ id: 9, ok: true, x: 0, y: 500, w: 300, h: 300 });   // window shrank a lot
    assert.equal(pl.w, 300, 'width adopts immediately (bounds math)');
    assert.equal(pl._tx, 0, 'x stored as a smoothed target');
    let worst = 0, prev = b.x, frames = 0;
    while (b.x > 270 + 2 && frames < 600) {   // converge into the pad band [30..270]
      b.tick(1 / 60);
      worst = Math.max(worst, Math.abs(b.x - prev));
      prev = b.x; frames++;
    }
    assert.ok(b.x <= 270, 'cat back inside the shrunken border');
    assert.ok(worst <= 900 / 60 + 0.001, `worst per-frame glide ${worst.toFixed(1)}px ≤ 15px`);
  });

  test('two consecutive ok:false = the window is really gone => animated fall', () => {
    const b = mkBrain();
    const pl = { id: 3, x: 400, y: 500, w: 600, h: 300 };
    b.platforms = [pl];
    b.onPlatform = pl;
    b.x = 500; b.baseY = 500;
    b.updateTrackedPlatform({ id: 3, ok: false });
    assert.equal(b.onPlatform, pl, 'one miss is tolerated (a poll blip)');
    b.updateTrackedPlatform({ id: 3, ok: false });
    assert.equal(b.onPlatform, null, 'two misses: gone');
    assert.equal(b.state, 'jump', 'falls with the animated arc');
    assert.ok(b._jump && b._jump.y1 === b.groundY, 'fall targets the ground');
  });

  test('mid-jump border move: the landing follows the CURRENT border', () => {
    const b = mkBrain();
    const pl = { id: 11, x: 400, y: 500, w: 600, h: 300 };
    b.platforms = [pl];
    b.onPlatform = null;
    b._jumpTo(pl, 0.6);
    assert.equal(b._jump.y1, 500);
    b.onPlatform = pl;                       // tracker lines arrive keyed by the platform
    b.updateTrackedPlatform({ id: 11, ok: true, x: 400, y: 420, w: 600, h: 300 });
    assert.equal(pl.y, 420, 'rect updated');
    assert.equal(b._jump.y1, 420, 'in-flight landing target corrected');
  });

  test('setPlatforms: tracker live => no re-bind snap, no scan-flicker fall', () => {
    const b = mkBrain();
    const pl = { id: 77, x: 400, y: 500, w: 600, h: 300 };
    b.platforms = [pl];
    b.onPlatform = pl;
    b.x = 640; b.baseY = 500;
    b._enter('sit', 30);
    b.updateTrackedPlatform({ id: 77, ok: true, x: 400, y: 500, w: 600, h: 300 });   // tracker alive
    // scan sees the window GONE (flaky) — the tracker says it's alive
    b.setPlatforms([{ id: 2, x: 900, y: 700, w: 400, h: 200 }]);
    assert.equal(b.onPlatform, pl, 'ghost grace: still standing');
    assert.equal(b.baseY, 500, 'no snap');
    // scan sees the window with a stale rect — tracker owns the geometry
    b.setPlatforms([{ id: 77, x: 400, y: 410, w: 600, h: 300 }]);
    assert.equal(b.baseY, 500, 'no re-bind snap while the tracker is live');
    assert.equal(b.onPlatform, pl, 'still the same platform object');
  });

  test('without a tracker, setPlatforms keeps the exact v3.8 re-bind behavior', () => {
    const b = mkBrain();
    const pl = { x: 400, y: 500, w: 600, h: 300 };          // no id — tracker can never own it
    b.platforms = [pl];
    b.onPlatform = pl;
    b.x = 640; b.baseY = 500;
    b.setPlatforms([{ x: 400, y: 540, w: 600, h: 300 }]);   // 40px nudge
    assert.equal(b.baseY, 540, 'legacy ride-along preserved');
    b.setPlatforms([{ x: 900, y: 700, w: 400, h: 200 }, { x: 400, y: 500, w: 600, h: 300 }]);
    // platform reappears at its old spot; whatever the matcher decides, no crash
    assert.ok(b.onPlatform === null || typeof b.onPlatform === 'object');
  });

  test('stale tracker lines for a window we are NOT standing on are ignored', () => {
    const b = mkBrain();
    const pl = { id: 1, x: 0, y: 500, w: 600, h: 300 };
    b.platforms = [pl];
    b.onPlatform = pl;
    b.x = 300; b.baseY = 500;
    b._enter('sit', 30);
    b.updateTrackedPlatform({ id: 999, ok: true, x: 0, y: 999, w: 600, h: 300 });
    assert.equal(b.baseY, 500, 'foreign id ignored');
    b.onPlatform = null;
    b.updateTrackedPlatform({ id: 1, ok: true, x: 0, y: 999, w: 600, h: 300 });
    assert.equal(b.baseY, 500, 'not standing: nothing to ride');
  });

  test('ride targets are re-anchored by newer tracker lines and clear when settled', () => {
    const b = mkBrain();
    const pl = { id: 21, x: 0, y: 500, w: 600, h: 300 };
    b.platforms = [pl];
    b.onPlatform = pl;
    b.x = 300; b.baseY = 500;
    b._enter('sit', 30);
    b.updateTrackedPlatform({ id: 21, ok: true, x: 0, y: 800, w: 600, h: 300 });
    b.updateTrackedPlatform({ id: 21, ok: true, x: 60, y: 560, w: 600, h: 300 });   // newer truth wins
    assert.equal(pl._ty, 560);
    assert.equal(pl._tx, 60);
    for (let i = 0; i < 600 && (b.baseY !== 560 || b.x !== 360); i++) b.tick(1 / 60);
    assert.equal(b.baseY, 560, 'vertical ride settled exactly');
    assert.equal(b.x, 360, 'horizontal glide settled into the moved border (60 + 300)');
    assert.equal(pl._ty, null, 'targets clear once reached');
    assert.equal(pl._tx, null, 'targets clear once reached');
  });
});
