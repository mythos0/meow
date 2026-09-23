// e2e-v37.mjs — live verification of the v3.7 fixes, driven through the REAL
// renderer + main pipelines under Xvfb:
//   1. hop no-flap: an in-place hop must NOT slide the region window (the
//      reported "cat jumping/flushing" bug was exactly this loop)
//   2. slide consistency: while the region slides, the cat is never drawn
//      outside the visible canvas (async slide-sync + repaint on landing)
//   3. companion kitten: leashed to the main cat, always inside the region
//   4. quick tap = real meow (sound actually routed through play())
//   5. hidden cat = paused render loop (rAF stops; resumes on show) — CPU win
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'e2e-electron-v37');
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
  await new Promise(r => setTimeout(r, 500));
}
if (!cdpReady) {
  console.error('CDP never came up. App log:\n' + appLog.slice(-3000));
  app.kill('SIGKILL');
  xvfb?.kill();
  process.exit(1);
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9229');

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

  // ---------------- 1. hop no-flap ----------------
  await calm();
  const hop = await cat.evaluate(async () => {
    const b = window.__brain();
    const before = window.__region();
    // measure the region across TWO full in-place hops (the flap used to
    // slide the window up 70px mid-hop and back down on landing)
    b._enter('jump', 0.75);
    await new Promise(r => setTimeout(r, 400));
    b._enter('jump', 0.75);
    await new Promise(r => setTimeout(r, 900));
    const after = window.__region();
    return { before, after, same: before.x === after.x && before.y === after.y };
  });
  ok('hop does not flap the region window (jumping-bug fix)', hop.same, JSON.stringify(hop));

  // ---------------- 2. slide consistency: cat always fully inside the canvas ----------------
  await calm();
  const stroll = await cat.evaluate(async () => {
    const b = window.__brain();
    b._platformCd = 999;
    b._enter('walk', 8);
    let worst = 0, slides = 0, lastOx = window.__region().x, lastOy = window.__region().y;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const r = window.__region();
      if (r.x !== lastOx || r.y !== lastOy) { slides++; lastOx = r.x; lastOy = r.y; }
      const loc = window.__catLocal();
      // distance of the cat center outside the visible canvas (0 = fully inside)
      const outX = Math.max(0, -loc.x, loc.x - r.w);
      const outY = Math.max(0, -loc.y, loc.y - r.h);
      worst = Math.max(worst, outX + outY);
      await new Promise(r2 => setTimeout(r2, 40));
    }
    b._enter('idle', 1);
    return { worst: Math.round(worst), slides };
  });
  ok('cat never drawn outside the visible region during slides',
    stroll.worst <= 0, JSON.stringify(stroll));
  ok('region actually slides while strolling (feature intact)', stroll.slides >= 1, `slides=${stroll.slides}`);

  // ---------------- 3. companion kitten leashed + visible ----------------
  await cat.evaluate(() => window.meow.setSettings({ companionCat: true }));
  await sleep(400);
  const leash = await cat.evaluate(async () => {
    const b = window.__brain();
    const c = window.__companionBrain && window.__companionBrain();
    if (!c) return { ok: false, why: 'no companion' };
    // try to fling the kitten far away — the leash must reel it back in
    c.x = b.x + 1200;
    let pulled = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      if (Math.abs(c.x - b.x) < 400) { pulled = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    const r = window.__region();
    const cx = c.x - r.x;      // kitten position inside the region canvas
    return {
      ok: pulled && cx >= -60 && cx <= r.w + 60,
      pulled, dist: Math.round(Math.abs(c.x - b.x)), cx: Math.round(cx), rw: r.w,
    };
  });
  ok('companion kitten is leashed back and stays inside the region',
    leash.ok, JSON.stringify(leash));
  await cat.screenshot({ path: path.join(OUT, 'v37_companion.png') });
  await cat.evaluate(() => window.meow.setSettings({ companionCat: false }));

  // ---------------- 4. quick tap = real meow ----------------
  await calm();
  // pin a long idle so no footstep sound can overwrite __lastPlay mid-assert
  await cat.evaluate(() => { const b = window.__brain(); b._enter('idle', 30); });
  await sleep(200);
  await cat.evaluate(() => { window.__lastPlay = null; });
  const tap = await cat.evaluate(async () => {
    // dispatch a REAL mouse flow on the cat's pose position
    const p = window.__pose();
    const r = window.__region();
    const lx = p.x - r.x, ly = p.y - r.y;
    const kd = (type, x, y) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
    kd('mousemove', lx, ly); kd('mousedown', lx, ly);
    await new Promise(r2 => setTimeout(r2, 60));
    kd('mouseup', lx, ly);
    await new Promise(r2 => setTimeout(r2, 250));
    return { lastPlay: window.__lastPlayInfo ? window.__lastPlayInfo() : null, emote: window.__brain().emote?.kind || null };
  });
  ok('quick tap plays a real meow + heart',
    !!tap.lastPlay && /^meow_real/.test(tap.lastPlay.name) && tap.emote === 'heart', JSON.stringify(tap));

  // ---------------- 5. hidden cat pauses the render loop ----------------
  // real pipeline: a process named "teams" -> sysMonitor -> parseProcessList
  // -> findCallApp -> updateCatVisibility -> cat-visible -> rAF stops
  const teamsBin = '/tmp/meow-e2e-v37/teams';
  const { mkdirSync: mkd, copyFileSync: cpf } = await import('fs');
  mkd('/tmp/meow-e2e-v37', { recursive: true });
  cpf('/bin/sleep', teamsBin);
  await cat.evaluate(() => window.meow.setSettings({ hideDuringCalls: true }));
  const teamsProc = spawn(teamsBin, ['120'], { stdio: 'ignore' });
  let hiddenSeen = false;
  const tHide = Date.now();
  while (Date.now() - tHide < 30000) {
    const h = await cat.evaluate(async () => (await window.meow.appInfo()).hidden);
    if (h.call) { hiddenSeen = true; break; }
    await sleep(400);
  }
  ok('call app hides the cat (pipeline intact)', hiddenSeen, `${Date.now() - tHide}ms`);
  // while hidden: the LOOP must be paused -> real paints must freeze
  const paintsHidden = await Promise.race([
    cat.evaluate(async () => {
      const p0 = window.__paintCount || 0;
      await new Promise(r => setTimeout(r, 1200));
      return { p0, p1: window.__paintCount || 0 };
    }),
    sleep(1600).then(() => null),
  ]);
  ok('render loop pauses while hidden (paints frozen, CPU saved)',
    hiddenSeen && !!paintsHidden && paintsHidden.p1 === paintsHidden.p0, JSON.stringify(paintsHidden));
  const visFlag = await cat.evaluate(() => window.__catVisible());
  ok('__catVisible flag false while hidden', visFlag === false, `flag=${visFlag}`);
  teamsProc.kill('SIGKILL');
  let shownAgain = false;
  const tShow = Date.now();
  while (Date.now() - tShow < 25000) {
    const h = await cat.evaluate(async () => (await window.meow.appInfo()).hidden);
    if (!h.call) { shownAgain = true; break; }
    await sleep(400);
  }
  // resumes painting (and stays alive) after the call ends
  await sleep(1200);
  const paintsAfter = await Promise.race([
    cat.evaluate(async () => {
      const p0 = window.__paintCount || 0;
      await new Promise(r => setTimeout(r, 1200));
      return { p0, p1: window.__paintCount || 0 };
    }),
    sleep(1600).then(() => null),
  ]);
  ok('cat returns and the render loop resumes (paints flowing again)',
    shownAgain && !!paintsAfter && paintsAfter.p1 > paintsAfter.p0, JSON.stringify(paintsAfter));
  await cat.evaluate(() => window.meow.setSettings({ hideDuringCalls: false }));

  await cat.screenshot({ path: path.join(OUT, 'v37_final.png') });
} catch (e) {
  console.error('E2E crashed:', e);
  results.push({ name: 'suite completed', pass: false, extra: String(e) });
} finally {
  try { app.kill('SIGKILL'); } catch {}
  try { xvfb?.kill(); } catch {}
  try { browser.close(); } catch {}
}

const pass = results.filter(r => r.pass).length;
console.log(`\n=== E2E v3.7: ${pass}/${results.length} passed ===`);
process.exit(pass === results.length ? 0 : 1);
