// e2e-v38.mjs — live verification of the v3.8 fixes, driven through the REAL
// renderer + main pipelines under Xvfb:
//   1. one meow voice: a burst of rapid clicks can never stack overlapping
//      meows (exactly one audible meow element at any moment)
//   2. reminder delivery: a fired reminder shows its actual message in the
//      speech bubble, fully inside the region window
//   3. platform re-anchor: a window that moved/resized between scans keeps
//      the cat on its top border (no teleport to the ground); a vanished
//      window starts an animated fall
//   4. companion leash: reeling the kitten in is a smooth dash, never a
//      teleport (max per-frame delta bounded)
//   5. bubble clamp: overlays stay inside the region at the edges
//   6. growl_real finally loads (hairball/build-bad sounds were silent)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'e2e-electron-v38');
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
const app = spawn(electronBin, ['.', '--remote-debugging-port=9230', '--no-sandbox', '--disable-gpu'], {
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
    const res = await fetch('http://127.0.0.1:9230/json/version');
    if (res.ok) { cdpReady = true; break; }
  } catch {}
  await new Promise(r => setTimeout(r, 500));
}
if (!cdpReady) {
  console.error('CDP never came up. App log:\n' + appLog.slice(-3000));
  app.kill('SIGKILL');
  xvfb?.kill();
  process.exit(1);
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9230');

async function findPage(suffix, tries = 20) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.url().endsWith(suffix)) return p;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

try {
  const cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  if (!cat) throw new Error('no cat window');
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 });

  const calm = () => cat.evaluate(() => {
    const b = window.__brain();
    if (!['idle', 'sit', 'loaf', 'groom'].includes(b.state)) b._enter('idle', 2);
    b.musicOn = false; b._batteryLow = false; b.stressUntil = 0;
    b.onPlatform = null; b._jump = null; b.baseY = b.groundY; b.jumpY = 0;
    b.stalk = null; b._inv = null; b._napRequested = false;
    b._platformCd = 999;
    return b.state;
  });

  // ---------------- 1. one meow voice under rapid clicks ----------------
  await calm();
  await cat.evaluate(() => { const b = window.__brain(); b._enter('idle', 60); });
  await sleep(300);
  const burst = await cat.evaluate(async () => {
    const p = window.__pose();
    const r = window.__region();
    const lx = p.x - r.x, ly = p.y - r.y;
    const kd = (type, x, y) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
    const samples = [];
    let peak = 0;
    // 10 rapid clicks, ~45ms apart — the old pool stacked up to 3 meows
    for (let i = 0; i < 10; i++) {
      kd('mousemove', lx, ly);
      kd('mousedown', lx, ly);
      await new Promise(r2 => setTimeout(r2, 20));
      kd('mouseup', lx, ly);
      await new Promise(r2 => setTimeout(r2, 25));
      const n = window.__activeMeowCount();
      samples.push(n);
      peak = Math.max(peak, n);
    }
    await new Promise(r2 => setTimeout(r2, 150));
    const still = window.__activeMeowCount();
    return { peak, still, samples, last: window.__lastPlayInfo() };
  });
  ok('rapid clicks never stack meows (exactly one voice)',
    burst.peak <= 1 && burst.still <= 1 && /^meow/.test(burst.last?.name || ''),
    JSON.stringify({ peak: burst.peak, still: burst.still, last: burst.last?.name }));

  // ---------------- 2. reminder shows its message ----------------
  await calm();
  const rem = await cat.evaluate(() => {
    const delivered = window.__testEvent('reminder-fired', { id: 'r1', label: 'Drink water and stretch!', at: Date.now(), repeat: 'once', anim: 'dance' });
    const bubble = document.getElementById('bubble');
    const r = window.__region();
    return {
      delivered,
      visible: bubble.style.display === 'block',
      text: bubble.textContent,
      left: parseFloat(bubble.style.left), top: parseFloat(bubble.style.top),
      w: bubble.offsetWidth, h: bubble.offsetHeight, rw: r.w, rh: r.h,
    };
  });
  ok('reminder bubble shows the actual message',
    rem.delivered && rem.visible && rem.text.includes('Drink water and stretch!'),
    JSON.stringify({ text: rem.text, visible: rem.visible }));
  ok('reminder bubble fully inside the region',
    rem.left >= 0 && rem.top >= 0 && rem.left + rem.w <= rem.rw + 2 && rem.top + rem.h <= rem.rh + 2,
    `left=${rem.left.toFixed(0)} w=${rem.w} rw=${rem.rw} top=${rem.top.toFixed(0)} h=${rem.h} rh=${rem.rh}`);
  await cat.screenshot({ path: path.join(OUT, 'v38_reminder.png') });

  // ---------------- 3. platform re-anchor on window move/resize ----------------
  await calm();
  const reanchor = await cat.evaluate(async () => {
    const b = window.__brain();
    // ground the cat first
    b.onPlatform = null; b._jump = null; b.baseY = b.groundY; b.jumpY = 0;
    // scan 1: a normal window the cat can stand on
    window.__setPlatforms([{ x: 300, y: 500, w: 600, h: 400, title: 'Editor' }]);
    b._jumpTo(b.platforms[0], 0.6);
    for (let i = 0; i < 120 && b._jump; i++) b.tick(1 / 60);
    const landed = { on: !!b.onPlatform, baseY: b.baseY };
    // scan 2: SAME window dragged + resized between PowerShell scans
    window.__setPlatforms([{ x: 360, y: 520, w: 480, h: 380, title: 'Editor' }]);
    const after = { on: !!b.onPlatform, baseY: b.baseY, x: b.x, grounded: b.baseY === b.groundY, jumping: b.state === 'jump' };
    return { landed, after };
  });
  ok('cat lands on the window top', reanchor.landed.on && reanchor.landed.baseY === 500, JSON.stringify(reanchor.landed));
  ok('moved+resized window keeps the cat on its top border (no teleport)',
    reanchor.after.on && reanchor.after.baseY === 520 && !reanchor.after.grounded,
    JSON.stringify(reanchor.after));

  // vanished window -> animated fall (state=jump with a fall arc)
  const vanish = await cat.evaluate(() => {
    const b = window.__brain();
    window.__setPlatforms([]);
    return { state: b.state, hasArc: !!b._jump, toGround: b._jump ? b._jump.y1 === b.groundY : false };
  });
  ok('vanished window = animated fall instead of a snap',
    vanish.state === 'jump' && vanish.hasArc && vanish.toGround, JSON.stringify(vanish));
  await sleep(900);   // let the fall finish

  // border hop: jumping while ON a border lands back on that border
  await calm();
  const hop = await cat.evaluate(() => {
    const b = window.__brain();
    window.__setPlatforms([{ x: 300, y: 500, w: 600, h: 400, title: 'Wide' }]);
    b._jumpTo(b.platforms[0], 0.6);
    for (let i = 0; i < 120 && b._jump; i++) b.tick(1 / 60);
    if (!b.onPlatform) return { ok: false };
    b._borderHop();
    const J = b._jump;
    return { ok: !!J && J.y1 === 500 && J.pl === b.platforms[0] && J.x1 >= 334 && J.x1 <= 866 };
  });
  ok('border hop lands back on the same top border', hop.ok, JSON.stringify(hop));
  await sleep(800);

  // ---------------- 4. companion leash: smooth dash, never a teleport ----------------
  await cat.evaluate(() => window.meow.setSettings({ companionCat: true }));
  await sleep(500);
  const leash = await cat.evaluate(async () => {
    const b = window.__brain();
    const c = window.__companionBrain && window.__companionBrain();
    if (!c) return { ok: false, why: 'no companion' };
    // calm both, cancel any in-flight kitten jump (a jump lerp legitimately
    // pulls x back onto its trajectory — same as drag cancellation), THEN fling
    // it far beyond the leash but INSIDE the screen bounds (outside bounds the
    // screen-edge clamp legitimately snaps it back — unreachable in real use)
    b._enter('idle', 30); b.x = 700; b.baseY = b.groundY;
    c._jump = null; c.onPlatform = null; c._enter('idle', 1);
    const maxX = b.bounds.x + b.bounds.w;
    c.x = Math.min(b.x + 1200, maxX - 80);
    let lastX = c.x, worstDelta = 0, pulled = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 7000) {
      const d = Math.abs(c.x - lastX);
      if (d > worstDelta) worstDelta = d;
      lastX = c.x;
      if (Math.abs(c.x - b.x) < 400) { pulled = true; break; }
      await new Promise(r => setTimeout(r, 40));
    }
    return { ok: pulled && worstDelta < 120, pulled, worstDelta: Math.round(worstDelta), dist: Math.round(Math.abs(c.x - b.x)) };
  });
  ok('kitten reels in smoothly (no teleport jump)',
    leash.ok, JSON.stringify(leash));
  await cat.screenshot({ path: path.join(OUT, 'v38_leash.png') });
  await cat.evaluate(() => window.meow.setSettings({ companionCat: false }));
  await sleep(200);

  // ---------------- 5. bubble clamp at the region edge ----------------
  await calm();
  const clamp = await cat.evaluate(() => {
    const b = window.__brain();
    const r = window.__region();
    // park the cat near the RIGHT edge of the region, then show a long bubble
    b.x = r.x + r.w - 60;
    b._enter('sit', 10);
    window.__testEvent('reminder-fired', { id: 'r2', label: 'A very long reminder message that used to overflow the region edge and get clipped in half before v3.8 fixed it', at: Date.now(), repeat: 'once', anim: 'happy' });
    const bubble = document.getElementById('bubble');
    const left = parseFloat(bubble.style.left), w = bubble.offsetWidth;
    return { left, w, rw: r.w, fits: left >= 0 && left + w <= r.w + 2 };
  });
  ok('long bubble clamped inside the region at the right edge',
    clamp.fits, `left=${clamp.left.toFixed(0)} w=${clamp.w} rw=${clamp.rw}`);

  // ---------------- 6. growl_real finally audible ----------------
  await cat.evaluate(() => { window.__lastPlay = null; });
  const growl = await cat.evaluate(() => {
    window.__playSfx('growl_real');   // v3.17: build-bad event is gone; test the sound itself
    return window.__lastPlayInfo();
  });
  ok('growl_real loads and plays (was a silent no-op before v3.8)',
    growl && growl.name === 'growl_real', JSON.stringify(growl));

  await cat.screenshot({ path: path.join(OUT, 'v38_final.png') });
} catch (e) {
  ok('e2e-v38 completed without throwing', false, String(e && e.stack || e));
}

const pass = results.filter(r => r.pass).length;
console.log(`\n${pass}/${results.length} checks passed`);
app.kill('SIGKILL');
xvfb?.kill();
process.exit(pass === results.length ? 0 : 1);
