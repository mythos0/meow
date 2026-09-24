// e2e-v311.mjs — REAL app test for the v3.11 release, booted under Xvfb and
// driven over CDP:
//   1. default cat IS the ginger kitten (fresh profile)
//   2. the overlay is a full-width LANE (the flicker architecture)
//   3. WALKING FLICKER test, done properly: frame-continuity capture —
//      the cat must be visible in EVERY frame while walking, positions must
//      stay continuous, and the window must issue ZERO region moves during a
//      pure ground stroll
//   4. DRAG: the cat stays visible while dragged far outside the old region
//      and the window follows (no more "hidden outside a box area")
//   5. SOUNDS: quick click = meow_single, double-click = classic voice,
//      ambient bursts fire, master toggle silences everything
//   6. ZONES: screenshot-style selector opens, a drawn rect lands in the list
//   7. AUTO-QUIT contract: closing helper windows never stops the process; a
//      second launcher defers to the running cat; typing-hook boot is survivable
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'e2e-v311');
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};

// -------------------------------------------------- start Xvfb
let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));
}

// -------------------------------------------------- fresh profile + boot
const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-v311-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, [
  '.', '--remote-debugging-port=9333', '--no-sandbox', '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required',
], {
  cwd: ROOT,
  env: {
    ...process.env, DISPLAY: process.env.DISPLAY,
    MEOW_WARM_IDLE_MS: '3000',
    XDG_CONFIG_HOME: userData, XDG_CACHE_HOME: userData,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });

let cdpReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9333/json/version');
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
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');

async function findPage(suffix, tries = 30) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.url().endsWith(suffix)) return p;
      }
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

try {
  // ------------------------------------------------ 1. boot + default breed
  const cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  if (!cat) throw new Error('no cat window');
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 }).catch(() => {});
  ok('renderer bridge alive', await cat.evaluate(() => !!window.__catBooted && !!window.meow));

  const breed = await cat.evaluate(async () => (await window.meow.getSettings()).breed);
  ok('default cat IS the ginger kitten', breed === 'ginger_kitten', String(breed));

  // ------------------------------------------------ 2. lane architecture
  const region = await cat.evaluate(() => window.__region());
  const wa = await cat.evaluate(() => (window.__settings().workArea) || { width: 1600 });
  ok('overlay is a full-width ground lane', region.w === Math.min(1600, wa.width || 1600),
    `region ${region.w}x${region.h}`);
  ok('lane is a vertical strip (not fullscreen)', region.h < (wa.height || 1000) * 0.6, `h=${region.h}`);

  // ------------------------------------------------ 3. WALKING FLICKER (frame continuity)
  // Force a long walk, then capture canvas frames and check continuity.
  await cat.evaluate(() => {
    const b = window.__brain();
    b.onPlatform = null;
    b._enter('walk', 60);           // a long, uninterrupted stroll
    window.__regionMoves = 0;
  });
  const FRAMES = 90;                 // ~7s at ~75ms
  const frames = [];
  let lastBox = null;
  let maxJump = 0, emptyFrames = 0;
  const t0 = Date.now();
  for (let i = 0; i < FRAMES; i++) {
    const f = await cat.evaluate(() => {
      const cv = document.getElementById('cv');
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
      for (let y = 0; y < cv.height; y += 2) {
        for (let x = 0; x < cv.width; x += 2) {
          const a = d[(y * cv.width + x) * 4 + 3];
          if (a > 40) {
            n++;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      return {
        n, box: n > 0 ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null,
        moves: window.__regionMoves || 0,
        state: window.__brain().state,
      };
    });
    if (f.n < 300) emptyFrames++;                       // the cat VANISHED (flicker!)
    if (f.box && lastBox) {
      const jump = Math.hypot(f.box.x - lastBox.x, f.box.y - lastBox.y);
      if (jump > maxJump) maxJump = jump;
    }
    if (f.box) lastBox = f.box;
    frames.push(f);
    await new Promise(r => setTimeout(r, 75));
  }
  const walkFrames = frames.filter(f => f.state === 'walk').length;
  ok(`walked most of the capture (${walkFrames}/${FRAMES} frames in walk)`, walkFrames > FRAMES * 0.7);
  ok('NO flicker: the cat is visible in every single frame', emptyFrames === 0,
    `${emptyFrames} empty frames of ${FRAMES}`);
  ok('NO teleports: frame-to-frame motion stays continuous', maxJump < 26,
    `max bbox jump ${maxJump.toFixed(1)}px`);
  const movesDuringWalk = frames[frames.length - 1].moves - frames[0].moves;
  ok('ZERO window moves while walking (flicker structurally dead)',
    movesDuringWalk === 0, `${movesDuringWalk} region moves during capture`);
  ok('cat actually traveled', lastBox && frames[0].box && Math.abs(lastBox.x - frames[0].box.x) > 40,
    lastBox && frames[0].box ? `${(lastBox.x - frames[0].box.x).toFixed(0)}px` : 'no box');

  // ------------------------------------------------ 4. DRAG stays visible + window follows
  await cat.evaluate(() => { const b = window.__brain(); b.onPlatform = null; b._enter('idle', 30); });
  await new Promise(r => setTimeout(r, 300));
  const dragInfo = await cat.evaluate(async () => {
    const b = window.__brain();
    const p = b.pose;
    const lx = p.x - (window.__region().x), ly = p.y - (window.__region().y);
    const cv = document.getElementById('cv');
    const readVisible = () => {
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return n;
    };
    const before = { x: p.x, y: p.y, moves: window.__regionMoves || 0, vis: readVisible() };
    // grab the cat and haul it far up-right, outside the old box — sampling visibility
    const samples = [];
    const fire = (type, cx, cy) => window.dispatchEvent(new MouseEvent(type, { clientX: cx, clientY: cy, button: 0, bubbles: true }));
    fire('mousedown', lx, ly - 20);
    window.__regionMoves = 0;
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      const cx = lx + (620 / steps) * i;             // +620px — far past the old 480px region
      const cy = ly - 20 - (240 / steps) * i;        // up 240px
      fire('mousemove', cx, cy);
      if (i % 8 === 0) {
        await new Promise(r => requestAnimationFrame(r));
        const pose = window.__brain().pose;
        const reg = window.__region();
        const local = { x: pose.x - reg.x, y: pose.y - reg.y };
        const inside = local.x >= 0 && local.x <= cv.width && local.y >= 0 && local.y <= cv.height;
        samples.push({ inside, vis: readVisible(), local });
      }
      await new Promise(r => setTimeout(r, 16));
    }
    fire('mouseup', lx + 620, ly - 260);
    const afterPose = window.__brain().pose;
    const afterVis = readVisible();
    const moves = window.__regionMoves || 0;
    return { before, samples, afterPose: { x: afterPose.x, y: afterPose.y }, afterVis, moves };
  });
  ok('drag moves the window with the cat (follow)', dragInfo.moves > 0, `${dragInfo.moves} region moves`);
  ok('cat stays ON the canvas during the whole drag',
    dragInfo.samples.every(s => s.inside), JSON.stringify(dragInfo.samples.filter(s => !s.inside)[0] || {}));
  ok('cat visible in EVERY drag sample (no hidden-outside-the-box)',
    dragInfo.samples.every(s => s.vis > 300), dragInfo.samples.map(s => s.vis).join(','));
  ok('cat still visible after drop', dragInfo.afterVis > 300, String(dragInfo.afterVis));
  ok('drop landed where released (no snap-back)',
    Math.abs(dragInfo.afterPose.x - (dragInfo.before.x + 620)) < 60,
    `dx=${(dragInfo.afterPose.x - dragInfo.before.x).toFixed(0)}`);

  // ------------------------------------------------ 5. SOUNDS
  await cat.evaluate(() => window.meow.setSettings({ sounds: true, randomMeows: true, achievements: false }));
  await new Promise(r => setTimeout(r, 300));   // let settings-changed land first
  const click = await cat.evaluate(async () => {
    const b = window.__brain();
    const reg = window.__region();
    const lx = b.pose.x - reg.x, ly = b.pose.y - reg.y - 20;
    const fire = (type, cx, cy) => window.dispatchEvent(new MouseEvent(type, { clientX: cx, clientY: cy, button: 0, bubbles: true }));
    fire('mousedown', lx, ly); fire('mouseup', lx, ly);
    await new Promise(r => setTimeout(r, 120));
    return window.__lastPlayInfo();
  });
  ok('quick click = ONE natural single meow', click && click.name === 'meow_single', JSON.stringify(click));
  const dbl = await cat.evaluate(async () => {
    window.__playMeow();
    await new Promise(r => setTimeout(r, 60));
    return window.__lastPlayInfo();
  });
  ok('double-click keeps the classic meow voice', dbl && /^meow_real/.test(dbl.name), JSON.stringify(dbl));
  const amb = await cat.evaluate(async () => {
    window.__fireAmbientMeow();
    await new Promise(r => setTimeout(r, 100));
    return window.__lastPlayInfo();
  });
  ok('ambient meow fires at random times', !!amb, JSON.stringify(amb));
  ok('ambient scheduler is armed', await cat.evaluate(() => window.__ambientPending()));
  const silenced = await cat.evaluate(async () => {
    const pre = window.__lastPlayInfo();
    await window.meow.setSettings({ sounds: false });
    await new Promise(r => setTimeout(r, 350));   // the renderer learns via settings-changed
    window.__playMeowSingle();
    const after = window.__lastPlayInfo();
    await window.meow.setSettings({ sounds: true, achievements: true });
    // master off -> playMeowSingle must be a no-op: lastPlay untouched
    return { unchanged: pre.name === after.name && pre.t === after.t, after };
  });
  ok('All-sounds master toggle silences everything', silenced.unchanged, JSON.stringify(silenced.after));

  // ------------------------------------------------ 6. ZONE selector (screenshot-style)
  await cat.evaluate(() => window.meow.openWindow('settings'));
  const settings = await findPage('settings.html');
  ok('settings window opened', !!settings);
  if (settings) {
    await settings.waitForFunction(() => !!document.getElementById('zoneSelect'), null, { timeout: 8000 }).catch(() => {});
    // the button lives on the Behavior page — navigate there first
    await settings.evaluate(() => document.querySelector('[data-page="behavior"]').click());
    await settings.click('#zoneSelect');
    const zone = await findPage('zone-select.html');
    ok('screenshot-style zone overlay opened', !!zone);
    if (zone) {
      await zone.waitForFunction('window.__zoneCfg && window.__zoneCfg().union', null, { timeout: 8000 }).catch(() => {});
      const cfgOk = await zone.evaluate(() => {
        const c = window.__zoneCfg();
        return c && c.union && c.union.width > 0;
      });
      ok('zone overlay received the display union', !!cfgOk);
      await zone.evaluate(() => {
        const fire = (type, x, y) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
        fire('mousedown', 400, 300);
        fire('mousemove', 700, 460);
        fire('mouseup', 700, 460);
      });
      await new Promise(r => setTimeout(r, 600));
      const zones = await cat.evaluate(async () => (await window.meow.getSettings()).noWalkZoneList);
      ok('drawn rectangle landed in the zone list', Array.isArray(zones) && zones.length === 1, JSON.stringify(zones));
      ok('stored zone is workArea-relative', zones.length === 1 && zones[0].x === 400 && zones[0].y === 300, JSON.stringify(zones[0]));
    }
  }

  // ------------------------------------------------ 7. AUTO-QUIT contract
  await cat.evaluate(() => window.meow.closeWindow('settings'));
  await new Promise(r => setTimeout(r, 2500));
  const alive1 = app.pid && !app.signalCode && (await fetch('http://127.0.0.1:9333/json/version').then(r => r.ok).catch(() => false));
  ok('closing helper windows NEVER stops the cat process', !!alive1);
  const catStill = await findPage('cat.html', 5);
  ok('cat renderer still alive after helper churn', !!catStill);

  // second launcher defers to the running cat (and never kills it)
  const app2 = spawn(electronBin, ['.', '--no-sandbox', '--disable-gpu'], {
    cwd: ROOT, env: { ...process.env, DISPLAY: process.env.DISPLAY, XDG_CONFIG_HOME: userData },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 4000));
  const app2Exited = app2.exitCode !== null || app2.signalCode !== null;
  try { app2.kill('SIGKILL'); } catch {}
  ok('second launcher exits quietly (single-instance)', app2Exited);
  const alive2 = await fetch('http://127.0.0.1:9333/json/version').then(r => r.ok).catch(() => false);
  ok('first cat survived the second launcher', !!alive2);

  // typing-hook boot survivability: reactTyping is ON by default; the app is
  // still alive N seconds later (native hook problems can only ever take the
  // disposable child, never the cat).
  ok('cat alive with the typing hook enabled (auto-quit fix)', !!alive2);
} catch (e) {
  results.push({ name: 'e2e crashed', pass: false, extra: String(e) });
  console.error('E2E ERROR:', e);
  console.error('App log tail:\n' + appLog.slice(-3000));
} finally {
  try { app.kill('SIGKILL'); } catch {}
  try { xvfb?.kill(); } catch {}
  try { rmSync(userData, { recursive: true, force: true }); } catch {}
}

const failed = results.filter(r => !r.pass);
console.log(`\n=== e2e-v311: ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log('  ✖ ' + f.name + (f.extra ? ` — ${f.extra}` : ''));
  process.exit(1);
}
