// e2e-v313.mjs — REAL app checks for the v3.13 fixes, on a SIMULATED
// dual-monitor desktop (Xvfb 3200px wide + MEOWCAT_FAKE_DISPLAYS):
//   1. companion cat: enable via the real settings IPC -> exists AND paints
//      pixels on the visible canvas
//   2. companion cat FOLLOWS onto a window top (the "companion not showing"
//      fix): the kitten leaps up to join the big cat on its platform
//   3. butterfly VISIBILITY on display 2: spawns relative to the current
//      lane, inside the lane fast, and actually paints pixels
//   4. butterfly VISIBILITY on display 1: same
//   5. HUNT + CATCH: a nearby butterfly is stalked, pounced, caught, and the
//      butterflies stat increments through the real store
//   6. MISS: a pounce at an out-of-reach butterfly startles it into fleeing
//   7. laser pointer is lane-relative on display 2
//   8. QUIT GATE re-pin: a non-explicit quit is still blocked + journaled,
//      and SIGTERM (a terminal signal) is ignored — the cat never auto-quits
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, readdirSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'e2e-v313');
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};

// -------------------------------------------------- Xvfb (one 3200px screen)
let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '3200x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await sleep(1200);
}

// -------------------------------------------------- boot the real app
const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-v313-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9456', '--no-sandbox', '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required'], {
  cwd: ROOT,
  env: {
    ...process.env, DISPLAY: process.env.DISPLAY,
    MEOWCAT_TEST: '1',
    MEOWCAT_FAKE_DISPLAYS: JSON.stringify([
      { x: 0, y: 0, width: 1600, height: 1000 },
      { x: 1600, y: 0, width: 1600, height: 1000 },
    ]),
    MEOWCAT_FAKE_CURSOR: '{"x":800,"y":950}',
    XDG_CONFIG_HOME: userData, XDG_CACHE_HOME: userData,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });

let browser = null;
for (let i = 0; i < 60 && !browser; i++) {
  try { const v = await fetch('http://127.0.0.1:9456/json/version'); if (v.ok) browser = await chromium.connectOverCDP('http://127.0.0.1:9456'); } catch {}
  if (!browser) await sleep(500);
}
if (!browser) { console.error('CDP never came up:\n' + appLog.slice(-3000)); app.kill('SIGKILL'); xvfb?.kill(); process.exit(1); }

async function findPage(suffix, tries = 30) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().endsWith(suffix)) return p;
    await sleep(400);
  }
  return null;
}
const cat = await findPage('cat.html');
ok('cat renderer booted', !!cat);
if (!cat) { app.kill('SIGKILL'); xvfb?.kill(); process.exit(1); }
await cat.waitForFunction(() => window.__catBooted && window.__brain(), null, { timeout: 15000 }).catch(() => {});
// pin ambient butterfly spawns to manual — this suite drives its own spawns
await cat.evaluate(() => { window.__stopButterfly && window.__stopButterfly(); return true; }).catch(() => {});

// pixel helper: count opaque pixels in a box around a screen position
const pixelProbe = `(() => {
  window.__pixBox = (sx, sy, half) => {
    const cv = document.getElementById('cv');
    const r = window.__region();
    const lx = Math.round(sx - r.x), ly = Math.round(sy - r.y);
    const x0 = Math.max(0, lx - half), y0 = Math.max(0, ly - half);
    const w = Math.min(cv.width - x0, half * 2), h = Math.min(cv.height - y0, half * 2);
    if (w <= 0 || h <= 0) return -1;   // box entirely off-canvas
    const g = cv.getContext('2d');
    const d = g.getImageData(x0, y0, w, h).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
    return n;
  };
  return true;
})()`;
await cat.evaluate(pixelProbe);

// park the main cat somewhere and settle
async function park(x) {
  await cat.evaluate(x0 => {
    const b = window.__brain();
    b.onPlatform = null; b._jump = null; b._inv = null;
    b.stopStalk?.(); b.stopLaser?.();
    b._enter('idle', 45);
    b.x = x0; b.baseY = b.bounds.y + b.bounds.h - 8; b.jumpY = 0;
  }, x);
  await sleep(400);
}

// ------------------------------------------------ 1. companion cat shows
{
  await cat.evaluate(() => window.meow.setSettings({ companionCat: true }));
  await sleep(800);
  const c1 = await cat.evaluate(() => ({
    comp: window.__companion(),
    main: window.__brain().pose.x,
  }));
  ok('companion cat exists after enabling the setting', !!c1.comp, JSON.stringify(c1.comp));
  await park(800);
  const c2 = await cat.evaluate(() => {
    const c = window.__companionBrain();
    const mainP = window.__brain().pose;
    const kitP = c.pose;
    return {
      kit: { x: kitP.x, y: kitP.y }, main: { x: mainP.x, y: mainP.y },
      pixAtKit: window.__pixBox(kitP.x, kitP.y, 70),
      pixAtMain: window.__pixBox(mainP.x, mainP.y, 70),
      region: window.__region(),
    };
  });
  const inLane = c2.kit.x >= c2.region.x && c2.kit.x <= c2.region.x + c2.region.w;
  ok('companion cat paints pixels on the visible canvas', c2.pixAtKit > 40, `pix=${c2.pixAtKit} kit=${JSON.stringify(c2.kit)}`);
  ok('companion cat is inside the visible lane', inLane, JSON.stringify({ kit: c2.kit, region: c2.region }));
  ok('main cat still paints (sanity)', c2.pixAtMain > 300, `pix=${c2.pixAtMain}`);
}

// ------------------------------------------------ 2. companion follows onto a window top
{
  await park(800);
  await cat.evaluate(() => {
    const b = window.__brain();
    const pl = { x: b.x - 80, y: b.baseY - 260, w: 260, h: 200, id: 4242 };
    window.__setPlatforms([pl]);
    window.__plat4242 = pl;
    b._jumpTo(pl, 0.55);   // the big cat leaps onto the window top
    return true;
  });
  let joined = null;
  for (let i = 0; i < 60 && !joined; i++) {   // up to ~12s — only a REAL join counts
    await sleep(200);
    joined = await cat.evaluate(() => {
      const b = window.__brain();
      const c = window.__companionBrain();
      if (!b.onPlatform || !c || !c.onPlatform) return null;
      const kitP = c.pose;
      return {
        onPlat: true,
        vGap: Math.round(c.baseY - b.baseY),
        pixAtKit: window.__pixBox(kitP.x, kitP.y, 70),
      };
    });
  }
  ok('the kitten FOLLOWS the big cat onto the window top', !!joined && Math.abs(joined.vGap) < 80,
    JSON.stringify(joined || 'never joined within 12s'));
  ok('the kitten on the platform paints pixels (was invisible below the lane before)', !!joined && joined.pixAtKit > 40,
    `pix=${joined && joined.pixAtKit}`);
  await cat.evaluate(() => { window.__setPlatforms([]); });
  await sleep(1600);   // let the fall land
}

// ------------------------------------------------ 3. butterfly on display 2
{
  await park(2200);   // well onto the 2nd monitor
  await cat.evaluate(() => window.__spawnButterfly());
  await sleep(700);
  const b2 = await cat.evaluate(() => {
    const bf = window.__bfly();
    const r = window.__region();
    if (!bf) return { bf: null, r };
    return {
      bf, r,
      inLane: bf.x >= r.x && bf.x <= r.x + r.w,
      pix: window.__pixBox(bf.x, bf.y, 60),
    };
  });
  ok('butterfly spawns while the cat is on display 2', !!b2.bf, JSON.stringify(b2.bf));
  ok('butterfly is INSIDE the visible lane on display 2 (the old code never was)', !!b2.bf && b2.inLane,
    JSON.stringify({ bf: b2.bf, region: b2.r }));
  ok('butterfly paints pixels on the canvas', !!b2.bf && b2.pix > 5, `pix=${b2.pix}`);
}

// ------------------------------------------------ 4. butterfly on display 1
{
  // let the display-2 butterfly drift off or reuse it; spawn fresh either way
  await park(800);
  await cat.evaluate(() => { window.__spawnButterfly(); return true; });
  await sleep(700);
  const b1 = await cat.evaluate(() => {
    const bf = window.__bfly();
    const r = window.__region();
    if (!bf) return { bf: null };
    return { bf, inLane: bf.x >= r.x && bf.x <= r.x + r.w, pix: window.__pixBox(bf.x, bf.y, 60) };
  });
  ok('butterfly is INSIDE the visible lane on display 1 too', !!b1.bf && b1.inLane, JSON.stringify(b1.bf));
  ok('butterfly paints pixels on display 1', !!b1.bf && b1.pix > 5, `pix=${b1.pix}`);
}

// ------------------------------------------------ 5. HUNT + CATCH
{
  await park(800);
  await cat.evaluate(() => window.__spawnButterfly());
  await sleep(300);
  // place it near the cat and low — a catchable, tempting target
  await cat.evaluate(() => {
    const b = window.__brain();
    window.__setButterfly(b.x + 130, b.groundY - 100);
    return true;
  });
  let hunted = null;
  for (let i = 0; i < 25 && !hunted; i++) {
    await sleep(200);
    hunted = await cat.evaluate(() => window.__bflyHuntState().hunting === true || null);
  }
  ok('the cat NOTICES the nearby butterfly and starts stalking it', !!hunted);
  let caught = null;
  for (let i = 0; i < 60 && !caught; i++) {   // up to ~12s
    await sleep(200);
    caught = await cat.evaluate(() => {
      const st = window.__bflyHuntState();
      const bf = window.__bfly();
      if (st.caughtPending || (!bf && st.hunting === false && st.attempts === 0)) return st;
      return null;
    });
  }
  ok('the cat POUNCES and CATCHES it (butterfly gone, no failed attempts)', !!caught,
    JSON.stringify({ hunt: caught, bf: await cat.evaluate(() => window.__bfly()) }));
  const stat = await cat.evaluate(async () => {
    for (let i = 0; i < 25; i++) {           // reward lands when the pounce lands
      const s = await window.meow.getSettings();
      if ((s.stats.butterflies || 0) > 0) return { n: s.stats.butterflies, coins: s.coins };
      await new Promise(r => setTimeout(r, 200));
    }
    const s = await window.meow.getSettings();
    return { n: s.stats.butterflies || 0, coins: s.coins };
  });
  ok('the butterfly catch is counted in the real store (stats.butterflies)', stat.n >= 1, JSON.stringify(stat));
}

// ------------------------------------------------ 6. MISS startles the butterfly
{
  await park(800);
  await cat.evaluate(() => window.__spawnButterfly());
  await sleep(300);
  await cat.evaluate(() => {
    const b = window.__brain();
    // hold the butterfly HIGH (out of pounce reach, dy=300 > CATCH_DY=180)
    // and just beside the cat so the pounce fires at a guaranteed miss; a
    // cruising butterfly would simply outrun the stalk, so we pin it while
    // the hunt is live (the interval self-clears once the stalk ends)
    window.__holdBfly = setInterval(() => {
      const st = window.__bflyHuntState();
      if (!st.hunting) { clearInterval(window.__holdBfly); return; }
      const bb = window.__brain();
      window.__setButterfly(bb.x + 40, bb.groundY - 300);
    }, 40);
    window.__setButterfly(b.x + 40, b.groundY - 300);
    b.startStalk(b.x + 40, b.groundY - 300, 'butterfly');
    return true;
  });
  let fled = null;
  for (let i = 0; i < 50 && !fled; i++) {   // up to ~10s
    await sleep(200);
    fled = await cat.evaluate(() => {
      const bf = window.__bfly();
      const st = window.__bflyHuntState();
      if (bf && bf.state === 'flee' && st.attempts >= 1) return { bf, st };
      return null;
    });
  }
  await cat.evaluate(() => { clearInterval(window.__holdBfly); }).catch(() => {});
  ok('a pounce at an out-of-reach butterfly MISSES and startles it into fleeing',
    !!fled, JSON.stringify(fled || { bf: await cat.evaluate(() => window.__bfly()), st: await cat.evaluate(() => window.__bflyHuntState()) }));
}

// ------------------------------------------------ 7. laser is lane-relative
{
  await park(2200);
  await cat.evaluate(() => { window.__spawnLaser(); return true; });
  await sleep(250);
  const lz = await cat.evaluate(() => {
    const l = window.__laser();
    const r = window.__region();
    return l ? { x: l.x, region: r, inLane: l.x >= r.x && l.x <= r.x + r.w } : null;
  });
  ok('the laser dot spawns inside the lane ON DISPLAY 2 (was primary-clamped before)',
    !!lz && lz.inLane, JSON.stringify(lz));
}

// ------------------------------------------------ 8. QUIT GATE re-pin
{
  const before = app.pid && !app.signalCode;
  await cat.evaluate(() => window.meow.devForceQuit());
  await sleep(3500);
  const alive = app.pid && !app.signalCode &&
    await fetch('http://127.0.0.1:9456/json/version').then(r => r.ok).catch(() => false);
  ok('AUTO-QUIT CHECK: a non-explicit app.quit() is BLOCKED — the cat lives on', before && !!alive);
  let journaled = false;
  try {
    const cfgRoot = path.join(userData, 'MeowCat');
    const file = readdirSync(cfgRoot).find(f => f === 'meowcat-crash.log');
    if (file) journaled = readFileSync(path.join(cfgRoot, file), 'utf8').includes('blocked-auto-quit');
  } catch {}
  ok('the blocked quit is journaled with forensics', journaled);
  const catStill = await findPage('cat.html', 5);
  ok('cat renderer still alive after the blocked quit', !!catStill);
  // terminal signals must not take the cat down either
  app.kill('SIGTERM');
  await sleep(2500);
  const aliveAfterSig = app.pid && !app.signalCode &&
    await fetch('http://127.0.0.1:9456/json/version').then(r => r.ok).catch(() => false);
  ok('AUTO-QUIT CHECK: SIGTERM is ignored — the cat outlives its terminal', aliveAfterSig);
}

// ------------------------------------------------ summary
const pass = results.filter(r => r.pass).length;
console.log(`\ne2e-v313: ${pass}/${results.length} checks pass`);
await browser.close().catch(() => {});
app.kill('SIGKILL');
await sleep(600);
try { app.kill('SIGKILL'); } catch {}
xvfb?.kill();
rmSync(userData, { recursive: true, force: true });
process.exit(pass === results.length ? 0 : 1);
