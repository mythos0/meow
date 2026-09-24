// repro-zone-crash.mjs — reproduce "when no-walk zone is selected with drawer,
// app crashes". Drives the REAL user path: settings → Select area on screen →
// real mousedown/mousemove/mouseup on the overlay → finishZone → overlay close.
// Watches for: process death, render-process-gone, uncaughtException, overlay
// stuck, cat gone. Also exercises Esc-cancel and the click-no-drag path.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'repro-zone');
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};

let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));
}

const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-zone-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, [
  '.', '--remote-debugging-port=9361', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
], {
  cwd: ROOT,
  env: {
    ...process.env, DISPLAY: process.env.DISPLAY,
    MEOWCAT_TEST: '1',
    MEOWCAT_FAKE_CURSOR: '{"x":800,"y":500}',
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
    const res = await fetch('http://127.0.0.1:9361/json/version');
    if (res.ok) { cdpReady = true; break; }
  } catch {}
  await new Promise(r => setTimeout(r, 500));
}
if (!cdpReady) {
  console.error('CDP never came up. App log:\n' + appLog.slice(-3000));
  app.kill('SIGKILL'); xvfb?.kill(); process.exit(1);
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9361');

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

const alive = () => { try { return app.pid && !app.killed && app.exitCode === null; } catch { return false; } };
const crashMarkers = () => {
  const marks = [];
  for (const line of appLog.split('\n')) {
    if (/uncaughtException|unhandledRejection|child-process-gone|render-process-gone|Segmentation|FATAL|CHECK failed|crash/i.test(line)) {
      marks.push(line.trim().slice(0, 200));
    }
  }
  return marks;
};

let cat = null;
async function openZoneOverlay() {
  await cat.evaluate(() => window.meow.openWindow('settings'));
  const st = await findPage('settings.html');
  if (!st) return null;
  await st.waitForFunction(() => !!document.getElementById('zoneSelect'), null, { timeout: 8000 }).catch(() => {});
  await st.evaluate(() => {
    const btn = document.querySelector('[data-page="behavior"], [data-tab="behavior"], .nav [data-id="behavior"]');
    if (btn) btn.click();
    else document.querySelectorAll('section.page').forEach(p => p.classList.remove('on'));
    const sec = document.getElementById('page-behavior');
    if (sec) sec.classList.add('on');
  }).catch(() => {});
  await st.click('#zoneSelect');
  return findPage('zone-select.html');
}

try {
  cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 }).catch(() => {});

  // ---- round 1: the real draw path, driven with REAL mouse events ----
  let zone = await openZoneOverlay();
  ok('zone overlay opened', !!zone);

  if (zone) {
    await zone.waitForFunction('window.__zoneCfg && window.__zoneCfg().union', null, { timeout: 8000 }).catch(() => {});
    ok('overlay got union config', await zone.evaluate(() => {
      const c = window.__zoneCfg(); return !!c && !!c.union && c.union.width > 0;
    }));

    // REAL mouse events: press, move in steps, release (matches a human drag)
    await zone.mouse.move(400, 300);
    await zone.mouse.down();
    for (let i = 1; i <= 10; i++) await zone.mouse.move(400 + i * 30, 300 + i * 30);
    await zone.mouse.up();
    // how do we know finish fired? watch the page get closed by main
    let closed = false;
    for (let i = 0; i < 20; i++) {
      if (zone.isClosed()) { closed = true; break; }
      await new Promise(r => setTimeout(r, 250));
    }
    ok('overlay closed by main after draw', closed);
  }

  await new Promise(r => setTimeout(r, 1500));
  ok('app process still alive after draw', alive(), `exitCode=${app.exitCode} signal=${app.exitSignal || ''}`);
  ok('cat renderer still responsive', !cat.isClosed() && await cat.evaluate(() => window.__catBooted === true).catch(() => false));
  const zones1 = await cat.evaluate(async () => (await window.meow.getSettings()).noWalkZoneList).catch(() => null);
  ok('zone was stored', Array.isArray(zones1) && zones1.length === 1, JSON.stringify(zones1));
  ok('no crash markers in log round 1', crashMarkers().length === 0, crashMarkers().join(' | ').slice(0, 400));

  // ---- round 2: cancel path (Esc) ----
  if (alive()) {
    const z2 = await openZoneOverlay();
    ok('zone overlay reopened', !!z2);
    if (z2) {
      await z2.keyboard.press('Escape');
      let closed2 = false;
      for (let i = 0; i < 20; i++) { if (z2.isClosed()) { closed2 = true; break; } await new Promise(r => setTimeout(r, 250)); }
      ok('Esc cancels + closes overlay', closed2);
    }
    await new Promise(r => setTimeout(r, 1200));
    ok('app alive after cancel', alive());
    ok('no crash markers after cancel', crashMarkers().length === 0, crashMarkers().join(' | ').slice(0, 400));
  }

  // ---- round 3: rapid draw→immediate-drag-again race (user does 2 zones fast) ----
  if (alive()) {
    const z3 = await openZoneOverlay();
    if (z3) {
      await z3.mouse.move(200, 200);
      await z3.mouse.down();
      await z3.mouse.move(500, 500, { steps: 5 });
      await z3.mouse.up();
      // immediately try to draw again without waiting (the race)
      await z3.mouse.move(600, 200).catch(() => {});
      await z3.mouse.down().catch(() => {});
      await z3.mouse.move(900, 500, { steps: 5 }).catch(() => {});
      await z3.mouse.up().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
    ok('app alive after rapid double-draw', alive());
    const zones3 = await cat.evaluate(async () => (await window.meow.getSettings()).noWalkZoneList).catch(() => null);
    ok('zones accumulated (1-2 valid)', Array.isArray(zones3) && zones3.length >= 1 && zones3.length <= 2, JSON.stringify(zones3));
    ok('no crash markers after race', crashMarkers().length === 0, crashMarkers().join(' | ').slice(0, 400));
  }

  // ---- final: everything still standing ----
  ok('FINAL: app process alive', alive());
  ok('FINAL: cat still visible/painting', !cat.isClosed() && await cat.evaluate(() => {
    const cv = document.getElementById('cv') || document.querySelector('canvas');
    return !!cv;
  }).catch(() => false));
} catch (e) {
  ok('repro script completed without throwing', false, String(e && e.message || e));
} finally {
  const report = { results, log: appLog.slice(-8000) };
  (await import('fs')).writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  app.kill('SIGKILL');
  xvfb?.kill();
  browser.close().catch(() => {});
  try { rmSync(userData, { recursive: true, force: true }); } catch {}
  const fails = results.filter(r => !r.pass);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  process.exit(fails.length ? 1 : 0);
}
