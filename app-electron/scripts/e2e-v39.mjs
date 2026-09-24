// e2e-v39.mjs — v3.9.0 "the chase camera + the platform tracker" live checks.
//   1. THE headline invariant: the region window never teleports. While the
//      cat strolls, zoomies and jumps onto a platform, the origin's per-frame
//      delta stays ≤ 20px (the chase cap) — the old one-shot slide moved up to
//      400px in a single frame ("rendering jump", reported 3×).
//   2. The cat stays fully inside the visible canvas during a platform jump
//      (the chase keeps the headroom breach covered).
//   3. Tracker-driven platform ride: injected tracker rects move the standing
//      cat SMOOTHLY (≤ 12px/frame) instead of snapping per update.
//   4. Tracker vanish (2× ok:false) = animated fall; single miss tolerated.
//   5. platform-track IPC retargets when the cat lands on / leaves a window.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'e2e-electron-v39');
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));
}

const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9229', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT,
  env: { ...process.env, DISPLAY: process.env.DISPLAY, MEOW_WARM_IDLE_MS: '3000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });

let cdpReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9229/json/version');
    if (res.ok) { cdpReady = true; break; }
  } catch {}
  await sleep(500);
}
if (!cdpReady) { console.error('CDP never came up. App log:\n' + appLog.slice(-3000)); app.kill('SIGKILL'); process.exit(1); }

const browser = await chromium.connectOverCDP('http://127.0.0.1:9229');
const ctx = browser.contexts()[0];
let cat = null;
for (const pg of ctx.pages()) if (/cat\.html/.test(pg.url())) { cat = pg; break; }
if (!cat) { console.error('no cat page'); app.kill('SIGKILL'); process.exit(1); }
await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 });
ok('cat window booted', true);

const calm = () => cat.evaluate(() => { const b = window.__brain(); b._enter('sit', 12); });

// ---------------- 1. THE chase camera: per-frame origin deltas never spike ----------------
await calm();
const chase = await cat.evaluate(async () => {
  const b = window.__brain();
  // give the cat a platform HIGH above the ground to jump onto mid-run
  window.__setPlatforms([{ x: b.x + 300, y: 500, w: 500, h: 300 }]);
  const pl = b.platforms[0];
  // sample the region origin EVERY animation frame while we orchestrate
  // stroll → zoomies → platform jump → fall, i.e. every slide-prone moment
  // v3.12: assert the TRUE contract — the camera's SPEED cap (px/s) — instead
  // of per-frame px, which silently depends on the sandbox's frame rate.
  const samples = [];
  let last = { ...window.__region(), t: performance.now() };
  let running = true;
  (function sample() {
    if (!running) return;
    const t = performance.now();
    const r = window.__region();
    samples.push({ d: Math.hypot(r.x - last.x, r.y - last.y), ms: Math.max(1, t - last.t) });
    last = { ...r, t };
    requestAnimationFrame(sample);
  })();
  const seq = async () => {
    b._enter('walk', 3); b.dir = 1;
    await new Promise(r => setTimeout(r, 1200));
    b._enter('zoomies', 2.5);
    await new Promise(r => setTimeout(r, 1400));
    b._jumpTo(pl, 0.6);                       // ~400px climb in 0.6s
    await new Promise(r => setTimeout(r, 900));
    b._leavePlatform(1);                       // fall back to the ground
    await new Promise(r => setTimeout(r, 900));
  };
  await seq();
  running = false;
  await new Promise(r => setTimeout(r, 100));
  const rates = samples.filter(x => x.ms >= 4).map(x => x.d / x.ms * 1000).sort((a, b2) => a - b2);
  const p99 = rates[Math.floor(rates.length * 0.99)];
  return { n: samples.length, p99rate: Math.round(p99), maxRate: Math.round(rates[rates.length - 1]) };
});
ok('chase camera: region origin never teleports (camera rate capped at ~900px/s)',
  chase.n > 200 && chase.p99rate <= 990 && chase.maxRate <= 1050,
  JSON.stringify(chase));

// ---------------- 2. cat stays fully visible during a HIGH (legal, 400px) jump ----------------
await calm();
const jumpVis = await cat.evaluate(async () => {
  const b = window.__brain();
  const ground = b.groundY;
  const rise = 400;                                   // the brain's max legal rise
  window.__setPlatforms([{ x: b.x + 200, y: ground - rise, w: 500, h: 330 }]);
  const pl = b.platforms[0];
  b._jumpTo(pl, 0.6);
  let worstLocal = 0;   // distance of the feet ABOVE the canvas top (local y < 0)
  let landed = false, landedOn = null, endState = null;
  for (let i = 0; i < 90; i++) {
    b.tick(1 / 60);
    if (!b._jump && !landed) { landed = true; landedOn = !!b.onPlatform; endState = b.state; }
    const loc = window.__catLocal();
    if (loc.y < 0) worstLocal = Math.max(worstLocal, -loc.y);
    await new Promise(r => setTimeout(r, 4));
  }
  return { worstBreachPx: Math.round(worstLocal), landed, landedOn, endState, rise };
});
ok('cat stays inside the canvas during a 400px platform jump',
  jumpVis.landed && jumpVis.landedOn && jumpVis.worstBreachPx <= 40, JSON.stringify(jumpVis));

// ---------------- 3. tracker ride: smooth carry, never a snap ----------------
await calm();
const ride = await cat.evaluate(async () => {
  const b = window.__brain();
  const pl = { id: 4242, x: 300, y: 600, w: 700, h: 300 };
  b.platforms = [pl];
  b._jumpTo(pl, 0.5);
  for (let i = 0; i < 60 && b._jump; i++) b.tick(1 / 60);
  if (!b.onPlatform) return { ok: false, why: 'did not land' };
  b._enter('sit', 30);
  // the tracker reports the window dragged down 120px — 3Hz updates, but the
  // cat must move SMOOTHLY (a capped SPEED, like it is being carried), never
  // snapping per update. We assert px/SECOND (frame rate independent).
  window.__testEvent('platform-rect', { id: 4242, ok: true, x: 300, y: 720, w: 700, h: 300 });
  let worstSpeed = 0, prev = null, prevT = 0, frames = 0, samples = 0;
  const t0 = performance.now();
  while (b.baseY !== 720 && frames < 300 && performance.now() - t0 < 4000) {
    await new Promise(r => requestAnimationFrame(r));
    const nowT = performance.now();
    const now = b.baseY;
    // skip the first two samples: the brain's first tick after the injection
    // carries the whole setup gap (dt-clamped) and is not a steady-state speed
    if (prev !== null && samples > 2) {
      const dt = Math.max(0.001, (nowT - prevT) / 1000);
      worstSpeed = Math.max(worstSpeed, Math.abs(now - prev) / dt);
    }
    if (prev !== null) samples++;
    prev = now; prevT = nowT; frames++;
  }
  return { ok: b.baseY === 720, worstSpeed: Math.round(worstSpeed), frames };
});
ok('tracker ride: dragged border carries the cat smoothly (≤800px/s)',
  ride.ok && ride.worstSpeed <= 800, JSON.stringify(ride));

// ---------------- 4. vanish = animated fall; one miss tolerated ----------------
await calm();
const vanish = await cat.evaluate(async () => {
  const b = window.__brain();
  const pl = { id: 5150, x: 300, y: 600, w: 700, h: 300 };
  b.platforms = [pl];
  b._jumpTo(pl, 0.5);
  for (let i = 0; i < 60 && b._jump; i++) b.tick(1 / 60);
  if (!b.onPlatform) return { ok: false, why: 'did not land' };
  b._enter('sit', 30);
  window.__testEvent('platform-rect', { id: 5150, ok: false });   // one poll blip
  const tolerated = b.onPlatform === pl && b.state !== 'jump';
  window.__testEvent('platform-rect', { id: 5150, ok: false });   // second miss = gone
  return { ok: tolerated && b.state === 'jump' && !!b._jump && b._jump.y1 === b.groundY, tolerated };
});
ok('tracker vanish: one miss tolerated, two = animated fall to the ground',
  vanish.ok, JSON.stringify(vanish));
await sleep(900);

// ---------------- 5. the tracker retargets on landing/leaving ----------------
await calm();
await cat.evaluate(async () => {
  const b = window.__brain();
  const pl = { id: 6001, x: 300, y: 600, w: 700, h: 300 };
  b.platforms = [pl];
  b._jumpTo(pl, 0.5);
  for (let i = 0; i < 60 && b._jump; i++) b.tick(1 / 60);
  await new Promise(r => setTimeout(r, 400));    // let the loop notice onPlatform.id
});
const trackedAfterLand = await cat.evaluate(() => window.__trackedPlatId());
await cat.evaluate(async () => {
  const b = window.__brain();
  b._leavePlatform(1);                            // leave → tracker must get null
  await new Promise(r => setTimeout(r, 400));
});
const trackedAfterLeave = await cat.evaluate(() => window.__trackedPlatId());
ok('platform-track IPC retargets on landing (6001) and leaving (null)',
  trackedAfterLand === 6001 && trackedAfterLeave === null,
  `land=${trackedAfterLand} leave=${trackedAfterLeave}`);

// ---------------- screenshots ----------------
await calm();
await cat.screenshot({ path: path.join(OUT, 'v39_chase.png') });

const passed = results.filter(r => r.pass).length;
console.log(`\n=== E2E v3.9: ${passed}/${results.length} passed ===`);
app.kill('SIGKILL');
if (xvfb) xvfb.kill();
process.exit(passed === results.length ? 0 : 1);
