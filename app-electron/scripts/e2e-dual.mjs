// e2e-dual.mjs — v3.12 REAL app test on a SIMULATED DUAL-MONITOR desktop:
//   Xvfb provides one 3200px-wide screen; MEOWCAT_FAKE_DISPLAYS tells the app
//   it has two 1600px displays side by side. Every clamp, hop and drag runs
//   through the real main-process code paths.
//   1. the renderer sees TWO displays and roams the 3200px union
//   2. DRAG onto the 2nd monitor: the cat crosses x=1600 with the window
//      following, visible the whole way, and drops exactly where released
//   3. AUTO-WALK onto the 2nd monitor: the lane HOP fires as the stroll
//      reaches the lane edge and the cat keeps walking onto display 2
//   4. SINGLE-display invariant: zero lane hops when the union is one display
//      (covered by e2e-v311's ZERO window moves while walking)
//   5. zone base fix: a zone drawn on display 2 is stored UNION-relative
//   6. dblclick plays the classic meow and opens NOTHING
//   7. sound toggles: click / double-click / master gates + click-vs-ambient
//      mutual exclusion + NO footstep sounds while walking
//   8. QUIT GATE: a non-explicit app.quit() is blocked, the cat lives on
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, readdirSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'e2e-dual');
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};

// -------------------------------------------------- start Xvfb (wide screen)
let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':98', '-screen', '0', '3200x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':98';
  await new Promise(r => setTimeout(r, 1200));
}

// -------------------------------------------------- fresh profile + boot
const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-dual-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, [
  '.', '--remote-debugging-port=9444', '--no-sandbox', '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required',
], {
  cwd: ROOT,
  env: {
    ...process.env, DISPLAY: process.env.DISPLAY,
    MEOW_WARM_IDLE_MS: '3000',
    MEOWCAT_TEST: '1',
    // two 1600x1000 displays side by side — the union is 3200x1000
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

let cdpReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9444/json/version');
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
const browser = await chromium.connectOverCDP('http://127.0.0.1:9444');

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

const cat = await findPage('cat.html');
ok('cat renderer booted on the simulated dual display', !!cat);
if (!cat) { app.kill('SIGKILL'); xvfb?.kill(); process.exit(1); }
await cat.waitForFunction(() => window.__catBooted && window.__brain(), null, { timeout: 15000 }).catch(() => {});
// v3.13: pin butterfly spawns to manual — ambient hunts must not steal the
// cat's state from the live drag/walk checks below
await cat.evaluate(() => { window.__stopButterfly && window.__stopButterfly(); return true; }).catch(() => {});

// ------------------------------------------------ 1. dual-display geometry
const geo = await cat.evaluate(async () => {
  const s = await window.meow.getSettings();
  return { workAreas: s.workAreas, wa: s.workArea, bounds: window.__brain().bounds, region: window.__region() };
});
ok('settings:get returns TWO work areas', Array.isArray(geo.workAreas) && geo.workAreas.length === 2, JSON.stringify(geo.workAreas));
ok('the brain roams the 3200px union',
  geo.bounds && geo.bounds.w === 3200 && geo.bounds.x === 0, JSON.stringify(geo.bounds));
ok('the lane window is display-1 sized (≤1600 wide)',
  geo.region && geo.region.w <= 1600 && geo.region.w >= 320, JSON.stringify(geo.region));

// ------------------------------------------------ 2. DRAG onto the 2nd monitor
{
  const prep = await cat.evaluate(() => {
    const b = window.__brain();
    b.onPlatform = null; b._jump = null;
    b._enter('idle', 30);
    b.x = 800; b.baseY = b.bounds.y + b.bounds.h - 8;
    return { x: b.pose.x, y: b.pose.y };
  });
  await new Promise(r => setTimeout(r, 250));
  const drag = await cat.evaluate(async () => {
    const b = window.__brain();
    const p = b.pose;
    const reg = window.__region();
    const cv = document.getElementById('cv');
    const readVisible = () => {
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return n;
    };
    const grab = { x: p.x, y: p.y - 20 };
    await window.meow.devMoveCursor(grab);
    const fire = (type, cx, cy) => window.dispatchEvent(new MouseEvent(type, { clientX: cx, clientY: cy, button: 0, bubbles: true }));
    fire('mousedown', p.x - reg.x, p.y - 20 - reg.y);
    await new Promise(r => setTimeout(r, 80));
    const samples = [];
    const target = { x: 2300, y: 950 };   // well onto display 2
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      await window.meow.devMoveCursor({
        x: grab.x + ((target.x - grab.x) / steps) * i,
        y: grab.y + ((target.y - grab.y) / steps) * i,
      });
      if (i % 5 === 0) {
        await new Promise(r => requestAnimationFrame(r));
        const pose = window.__brain().pose;
        const r2 = window.__region();
        const local = { x: pose.x - r2.x, y: pose.y - r2.y };
        samples.push({
          onSecond: pose.x > 1600,
          vis: readVisible(),
          inside: local.x >= 0 && local.x <= cv.width && local.y >= 0 && local.y <= cv.height,
          mainDrag: window.__mainDragActive(),
        });
      }
      await new Promise(r => setTimeout(r, 16));
    }
    fire('mouseup', 100, 100);
    await new Promise(r => setTimeout(r, 120));
    return {
      samples,
      afterPose: { x: window.__brain().pose.x, y: window.__brain().pose.y },
      afterVis: readVisible(),
      region: window.__region(),
    };
  }).catch(e => ({ err: String(e) }));
  if (drag.err) { ok('drag onto the 2nd monitor runs', false, drag.err); }
  else {
    ok('main-driven drag engaged', drag.samples.every(s => s.mainDrag === true));
    ok('drag carries the cat ACROSS onto display 2',
      drag.samples.some(s => s.onSecond) && drag.afterPose.x > 1600,
      `afterX=${drag.afterPose.x.toFixed(0)}`);
    ok('cat visible in EVERY sample crossing monitors',
      drag.samples.every(s => s.vis > 300), drag.samples.map(s => s.vis).join(','));
    ok('cat stays on the canvas the whole way', drag.samples.every(s => s.inside));
    ok('cat still visible after the drop', drag.afterVis > 300, String(drag.afterVis));
    ok('the window followed onto display 2', drag.region.x > 600, JSON.stringify(drag.region));
    ok('drop landed where released (no snap-back)',
      Math.abs(drag.afterPose.x - 2300) < 60, `dx=${(drag.afterPose.x - 2300).toFixed(0)}`);
  }
}

// ------------------------------------------------ 3. AUTO-WALK onto display 2 (lane hop)
{
  await cat.evaluate(async () => {
    const b = window.__brain();
    b.onPlatform = null; b._jump = null;
    // start on DISPLAY 1, mid-ground, and re-center the lane on the cat the
    // way the app itself does (a same-size settings apply triggers syncRegion)
    b.x = 800; b.baseY = b.bounds.y + b.bounds.h - 8;
    const s = await window.meow.getSettings();
    await window.meow.setSettings({ speed: 220, size: s.size });
    await new Promise(r => setTimeout(r, 400));   // syncRegion lands the lane
    window.__hops = 0;
    window.__driveWalk = setInterval(() => {
      const bb = window.__brain();
      if (!['walk'].includes(bb.state)) bb._enter('walk', 30);
      bb.dir = 1;   // keep strolling right, into the 2nd monitor
    }, 16);
  });
  let crossed = null;
  const visSamples = [];
  for (let i = 0; i < 120; i++) {   // up to 24s
    await new Promise(r => setTimeout(r, 200));
    crossed = await cat.evaluate(() => {
      const cv = document.getElementById('cv');
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i3 = 3; i3 < d.length; i3 += 4) if (d[i3] > 40) n++;
      return {
        x: window.__brain().pose.x,
        ox: window.__region().x,
        hops: window.__hops || 0,
        state: window.__brain().state,
        vis: n,
      };
    });
    visSamples.push(crossed.vis);
    if (crossed.x > 1750 && crossed.hops >= 1) break;
  }
  await cat.evaluate(() => { clearInterval(window.__driveWalk); });
  ok('LANE HOP fired while strolling into the 2nd monitor', crossed && crossed.hops >= 1,
    JSON.stringify({ x: crossed && crossed.x, ox: crossed && crossed.ox, hops: crossed && crossed.hops }));
  ok('the cat WALKED onto the 2nd monitor (x past 1600)',
    crossed && crossed.x > 1600, `x=${crossed && crossed.x ? crossed.x.toFixed(0) : '?'}`);
  ok('the lane window followed the walk (origin advanced)',
    crossed && crossed.ox > 200, `ox=${crossed && crossed.ox ? crossed.ox.toFixed(0) : '?'}`);
  const visOk = visSamples.filter(v => v > 300).length;
  ok('cat covered by the lane at ~every sample of the stroll (no off-canvas)',
    visOk >= visSamples.length * 0.95 && visSamples.length > 5,
    `${visOk}/${visSamples.length} visible samples`);
}

// ------------------------------------------------ 4. footstep silence while walking
{
  const heard = await cat.evaluate(async () => {
    const b = window.__brain();
    b._enter('walk', 10); b.dir = 1;
    const seen = new Set();
    const t0 = performance.now() / 1000;
    for (let i = 0; i < 30; i++) {
      const lp = window.__lastPlayInfo();
      if (lp && lp.t >= t0 - 0.05) seen.add(lp.name);
      await new Promise(r => setTimeout(r, 100));
    }
    return [...seen];
  });
  ok('NO footstep sounds while walking (patter/run_patter/glass gone)',
    !heard.some(n => ['patter', 'run_patter', 'glass_real'].includes(n)), heard.join(','));
}

// ------------------------------------------------ 5. zone base fix (union-relative)
{
  // v3.12: driven directly through the same IPC the Settings button uses —
  // this suite targets the UNION geometry; the settings-UI path is covered
  // by e2e-v311's zone test on a single display.
  let zone = null;
  let sel = null;
  for (let attempt = 0; attempt < 3 && !zone; attempt++) {
    sel = await cat.evaluate(() => window.meow.selectZone());
    zone = await findPage('zone-select.html', 10);
    if (!zone) {
      await cat.evaluate(() => window.meow.cancelZone()).catch(() => {});
      await new Promise(r => setTimeout(r, 700));
    }
  }
  ok('zone overlay opened across the union', !!zone, `selectZone=${sel}`);
  let cfg = null;
  if (zone) {
    await zone.waitForFunction('window.__zoneCfg && window.__zoneCfg().union', null, { timeout: 8000 }).catch(() => {});
    try {
      cfg = await zone.evaluate(() => {
        const c = window.__zoneCfg();
        return c && c.union && c.union.width > 0 ? c : null;
      });
    } catch { /* overlay died */ }
  }
  ok('zone overlay received the 3200px union', !!cfg && cfg.union.width === 3200, JSON.stringify(cfg && cfg.union));
  if (zone && cfg) {
    let drawn = false;
    try {
      await zone.evaluate(() => {
        const fire = (type, x, y) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
        fire('mousedown', 1800, 300);
        fire('mousemove', 2050, 470);
        fire('mouseup', 2050, 470);
      });
      drawn = true;
    } catch {
      // the overlay closes itself on mouseup (zone-select:finish) — the
      // evaluate can die after the events were already dispatched. The
      // stored-zone assertion below is the ground truth either way.
      drawn = true;
    }
    await new Promise(r => setTimeout(r, 600));
    const zones = await cat.evaluate(async () => (await window.meow.getSettings()).noWalkZoneList);
    ok('zone drawn on display 2 is stored UNION-relative (x=1800)',
      drawn && Array.isArray(zones) && zones.length >= 1 && zones[zones.length - 1].x === 1800,
      JSON.stringify(zones));
    try { await zone.evaluate(() => window.meow.cancelZone()); } catch {}
  }
}

// ------------------------------------------------ 6. dblclick = sound only (nothing opens)
{
  await cat.evaluate(async () => {
    const b = window.__brain();
    const reg = window.__region();
    await window.meow.devMoveCursor({ x: b.pose.x, y: b.pose.y - 20 });
    const lx = b.pose.x - reg.x, ly = b.pose.y - 20 - reg.y;
    const fire = (type, cx, cy) => window.dispatchEvent(new MouseEvent(type, { clientX: cx, clientY: cy, button: 0, bubbles: true }));
    fire('mousedown', lx, ly); fire('mouseup', lx, ly);
    await new Promise(r => setTimeout(r, 60));
    fire('mousedown', lx, ly); fire('mouseup', lx, ly);
    fire('dblclick', lx, ly);
    await new Promise(r => setTimeout(r, 150));
  });
  const dbl = await cat.evaluate(() => window.__lastPlayInfo());
  ok('double click plays the CLASSIC meow', dbl && /^meow_real/.test(dbl.name), JSON.stringify(dbl));
  await new Promise(r => setTimeout(r, 1500));
  const pages = browser.contexts().flatMap(c => c.pages()).map(p => p.url());
  ok('double click opened NO window (no settings/store)',
    !pages.some(u => u.includes('settings.html')), pages.join(' | '));
}

// ------------------------------------------------ 7. sound toggles + mutual exclusion
{
  const t1 = await cat.evaluate(async () => {
    const pre = window.__lastPlayInfo();
    await window.meow.setSettings({ soundClickMeow: false });
    await new Promise(r => setTimeout(r, 250));
    window.__playMeowSingle();
    const after = window.__lastPlayInfo();
    await window.meow.setSettings({ soundClickMeow: true });
    return { unchanged: pre.name === after.name && pre.t === after.t };
  });
  ok('Single-click meow toggle silences the click voice', t1.unchanged);

  const t2 = await cat.evaluate(async () => {
    const pre = window.__lastPlayInfo();
    await window.meow.setSettings({ soundDblClickMeow: false });
    await new Promise(r => setTimeout(r, 250));
    window.__playMeow();
    const after = window.__lastPlayInfo();
    await window.meow.setSettings({ soundDblClickMeow: true });
    return { unchanged: pre.name === after.name && pre.t === after.t };
  });
  ok('Double-click meow toggle silences the classic voice', t2.unchanged);

  // mutual exclusion: while the classic voice sounds, a random meow is SKIPPED
  const t3 = await cat.evaluate(async () => {
    window.__playMeow();                       // classic voice starts (~2s)
    await new Promise(r => setTimeout(r, 80));
    const busy = window.__meowBusy();
    window.__fireAmbientMeow();                // random meow tries to fire
    await new Promise(r => setTimeout(r, 120));
    const last = window.__lastPlayInfo();
    return { busy, stillClassic: /^meow_real/.test(last.name) };
  });
  ok('random meow does NOT play while a click meow is sounding',
    t3.busy && t3.stillClassic, JSON.stringify(t3));

  // ambient alone works (no user voice active) — poll until the click voice
  // has fully ended (the 0.93s sample can still be draining its tail)
  await cat.evaluate(() => window.__playMeowSingle());
  await cat.waitForFunction(() => !window.__meowBusy(), null, { timeout: 6000 }).catch(() => {});
  const t4 = await cat.evaluate(async () => {
    window.__fireAmbientMeow();
    await new Promise(r => setTimeout(r, 120));
    return window.__lastPlayInfo();
  });
  ok('ambient meow fires when the airwaves are free', t4 && t4.exclusive === 'ambient', JSON.stringify(t4));

  // the settings page carries every toggle
  await cat.evaluate(() => window.meow.openWindow('settings'));
  const settings = await findPage('settings.html');
  if (settings) {
    await settings.waitForFunction(() => !!document.getElementById('soundClickMeow'), null, { timeout: 8000 }).catch(() => {});
    const ui = await settings.evaluate(() => ({
      click: !!document.getElementById('soundClickMeow'),
      dbl: !!document.getElementById('soundDblClickMeow'),
      rem: !!document.getElementById('soundReminders'),
      rnd: !!document.getElementById('randomMeows'),
      master: !!document.getElementById('sounds'),
    }));
    ok('Sounds settings expose ALL toggles (master/click/dbl/random/reminders)',
      ui.click && ui.dbl && ui.rem && ui.rnd && ui.master, JSON.stringify(ui));
    try { await settings.evaluate(() => window.meow.closeWindow('settings')); } catch {}
  } else ok('Sounds settings expose ALL toggles', false, 'settings page never opened');
}

// ------------------------------------------------ 8. QUIT GATE
{
  const before = app.pid && !app.signalCode;
  await cat.evaluate(() => window.meow.devForceQuit());
  await new Promise(r => setTimeout(r, 3500));
  const alive = app.pid && !app.signalCode &&
    await fetch('http://127.0.0.1:9444/json/version').then(r => r.ok).catch(() => false);
  ok('a non-explicit app.quit() is BLOCKED — the cat lives on', before && !!alive);
  // the journal records the blocked attempt with a stack trace
  let journaled = false;
  try {
    const cfgRoot = path.join(userData, 'MeowCat');
    const file = readdirSync(cfgRoot).find(f => f === 'meowcat-crash.log');
    if (file) journaled = readFileSync(path.join(cfgRoot, file), 'utf8').includes('blocked-auto-quit');
  } catch {}
  ok('the blocked quit is journaled with forensics', journaled);
  const catStill = await findPage('cat.html', 5);
  ok('cat renderer still alive after the blocked quit', !!catStill);
}

// ------------------------------------------------ summary
const pass = results.filter(r => r.pass).length;
console.log(`\ne2e-dual: ${pass}/${results.length} checks pass`);
await browser.close().catch(() => {});
app.kill('SIGTERM');
await new Promise(r => setTimeout(r, 800));
try { app.kill('SIGKILL'); } catch {}
xvfb?.kill();
rmSync(userData, { recursive: true, force: true });
process.exit(pass === results.length ? 0 : 1);
