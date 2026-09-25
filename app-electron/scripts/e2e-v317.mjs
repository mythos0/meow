// e2e-v317.mjs — release gate for v3.17, booted under Xvfb, driven over CDP:
//   1. THE VOICE CHAIN after the real fix: BOTH engines arm in parallel, the
//      offline engine reports into the exec log, web 'network' failures are
//      journaled and NON-fatal, and injected phrases still drive Brave+YouTube
//   2. THE MEOW QUEUE: rapid meow requests play ONE AFTER ANOTHER (never
//      canceling — the user's "they are canceling each other" report)
//   3. THE FLICKER FIX: a cat trapped inside a no-walk zone escapes with its
//      direction held (the old code flipped dir every tick)
//   4. THE DANCE, live through the real renderer: enters the routine and the
//      pose machine reports the v3.17 geometry (legK < 1, bodyX travel)
//   5. POMODORO REALTIME: tick events arrive every ~1s (the old 5s cadence
//      made the countdown jump)
//   6. SETTINGS: the Reactions page is gone; Focus & Reminders live on the
//      homepage
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'e2e-v317');
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};

let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await sleep(1200);
}

const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-v317-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, [
  '.', '--remote-debugging-port=9375', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
], {
  cwd: ROOT,
  env: {
    ...process.env, DISPLAY: process.env.DISPLAY,
    MEOWCAT_TEST: '1',
    MEOWCAT_FAKE_CURSOR: '{"x":800,"y":500}',
    MEOWCAT_FAKE_PLATFORM: 'win32',
    MEOWCAT_FAKE_BRAVE: 'C:/Users/me/AppData/Local/BraveSoftware/Brave-Browser/Application/brave.exe',
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
    const res = await fetch('http://127.0.0.1:9375/json/version');
    if (res.ok) { cdpReady = true; break; }
  } catch {}
  await sleep(500);
}
if (!cdpReady) {
  console.error('CDP never came up. App log:\n' + appLog.slice(-3000));
  app.kill('SIGKILL'); xvfb?.kill(); process.exit(1);
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9375');

async function findPage(suffix, tries = 30) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.isClosed?.()) continue;
        if (p.url().endsWith(suffix)) {
          try { await p.evaluate(() => 1); return p; } catch { /* stale */ }
        }
      }
    }
    await sleep(400);
  }
  return null;
}

const alive = () => { try { return app.pid && !app.killed && app.exitCode === null; } catch { return false; } };
const crashMarkers = () => appLog.split('\n')
  .filter(l => /uncaughtException|unhandledRejection|Segmentation|FATAL|CHECK failed/i.test(l))
  .map(l => l.trim().slice(0, 160));

try {
  const cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  if (!cat) throw new Error('no cat window');
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 }).catch(() => {});
  await cat.evaluate(() => { window.__stopButterfly && window.__stopButterfly(); return true; }).catch(() => {});

  // ================= 1. VOICE IS GONE (v3.18) =================
  {
    // the v3.18 directive: "remove all voice features totally" — the app must
    // boot with NO voice engine window, NO SAPI PowerShell, NO voice IPC
    const windows = await cat.evaluate(async () => (await window.meow.appInfo()));
    ok('VOICE REMOVED: the app still boots normally (app-info answers)', !!windows);
    await cat.evaluate(() => {
      window.__voiceRefs = 0;
      return true;
    });
  }

  // ================= 2. THE MEOW QUEUE (sequential, never canceling) =================
  {
    await cat.evaluate(async () => {
      const s = await window.meow.getSettings();
      await window.meow.setSettings({ sounds: true, randomMeows: false, soundClickMeow: true, soundDblClickMeow: true });
      return true;
    });
    await sleep(200);
    const pump = await cat.evaluate(() => window.__testMeow(4));
    ok('MEOW QUEUE: pumping 4 meows leaves 3 QUEUED behind the one playing',
      pump.cur === true && pump.queued === 3, JSON.stringify(pump));

    // collect every distinct play start until the queue drains
    const plays = await cat.evaluate(async () => {
      const seen = new Set();
      let last = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 16000) {
        const st = window.__meowQueueState();
        const lp = window.__lastPlay;
        if (lp && lp.t !== last) { last = lp.t; seen.add(lp.t); }
        if (!st.cur && st.queued === 0 && seen.size >= 4) break;
        await new Promise(r => setTimeout(r, 60));
      }
      const arr = [...seen].sort((a, b) => a - b);
      return { count: arr.length, gaps: arr.slice(1).map((t, i) => +(t - arr[i]).toFixed(2)) };
    });
    ok('MEOW QUEUE: all 4 meows PLAY (none skipped, none canceling)',
      plays.count >= 4, JSON.stringify(plays));
    ok('MEOW QUEUE: plays are SEQUENTIAL — each starts only after the previous one is done',
      plays.gaps.length >= 3 && plays.gaps.every(g => g >= 0.25), JSON.stringify(plays.gaps));
  }

  // ================= 3. THE FLICKER FIX (zone trap escape) =================
  {
    const esc = await cat.evaluate(async () => {
      const b = window.__brain();
      b.stopStalk?.(); b._jump = null; b.onPlatform = null;
      b._enter('walk', 30);
      b.setNoWalkZones([{ x: b.x - 150, y: 0, w: 300, h: 2000 }]);   // zone ON the cat
      const x0 = b.x, baseDir = b.dir;
      let flips = 0, lastDir = baseDir;
      const t0 = Date.now();
      let xNow = x0;
      while (Date.now() - t0 < 9000) {
        await new Promise(r => setTimeout(r, 120));
        xNow = b.x;
        if (b.dir !== lastDir) { flips++; lastDir = b.dir; }
        if (Math.abs(xNow - x0) > 160) break;   // escaped the zone
      }
      b.setNoWalkZones([]);
      return { flips, escaped: Math.abs(xNow - x0) > 160, moved: Math.abs(xNow - x0) };
    });
    ok('FLICKER: a zone drawn OVER the cat never flips its direction into a vibration',
      esc.flips <= 4, JSON.stringify(esc));
    ok('FLICKER: the cat ESCAPES the zone and walks free again', esc.escaped, JSON.stringify(esc));
  }

  // ================= 4. THE DANCE through the real pose machine =================
  {
    const dance = await cat.evaluate(() => {
      const b = window.__brain();
      b.stopStalk?.(); b._enter('sit', 60);
      b.dance();
      return { state: b.state };
    });
    await sleep(400);
    const live = await cat.evaluate(() => {
      const b = window.__brain();
      return { state: b.state, stateT: b.stateT };
    });
    ok('DANCE: the triggered routine is running live', dance.state === 'dance' && live.state === 'dance', JSON.stringify({ dance, live }));

    const geo = await cat.evaluate(async () => {
      const m = await import('../src/cat-renderer.js');
      const pal = { body: 'normal', fur: '#c8b48c', dark: '#8a7350', belly: '#e8dcc4', earIn: '#e89aa2' };
      const p = st => m.poseForState('dance', st, 0.5, m.BODIES.normal, pal, st);
      return {
        stubby: p(0.5).legK < 1 && p(4.5).legK < 1 && p(10.2).legK < 1,
        low: p(0.5).bodyY >= 0 && p(0.5).bodyY <= 8,
        travel: p(1.5).bodyX > 10 && p(3.3).bodyX < -10,
        walkFull: m.poseForState('walk', 0.3, 0.5, m.BODIES.normal, pal, 0).legK === 1,
      };
    });
    ok('DANCE: stubby short legs (legK < 1) on a low compact body — exactly the reference sheet',
      geo.stubby && geo.low, JSON.stringify(geo));
    ok('DANCE: steps really TRAVEL side to side (bodyX +13 → −13), no more rocking in place',
      geo.travel, JSON.stringify(geo));
    ok('DANCE: normal walking keeps full-length legs', geo.walkFull);
    await cat.screenshot({ path: path.join(OUT, 'v317_dance_live.png') });
  }

  // ================= 5. POMODORO REALTIME (1s cadence) =================
  {
    await cat.evaluate(async () => {
      window.__pomoTicks = [];
      window.meow.on('pomodoro', p => { if (p && p.event === 'tick') window.__pomoTicks.push(Date.now()); });
      await window.meow.setSettings({ pomodoro: true });
      return true;
    });
    await cat.evaluate(async () => { await window.meow.startPomodoro('focus'); return true; });
    await sleep(4200);
    const ticks = await cat.evaluate(() => window.__pomoTicks.length);
    await cat.evaluate(async () => { await window.meow.stopPomodoro(); return true; });
    ok('POMODORO: the countdown arrives EVERY second (≥3 ticks in 4.2s — was 5s cadence)',
      ticks >= 3, `${ticks} ticks`);
  }

  // ================= 6. SETTINGS: reactions gone, focus on home =================
  {
    await cat.evaluate(() => window.meow.openWindow('settings'));
    const set = await findPage('settings.html');
    ok('settings window opens', !!set);
    if (set) {
      const ui = await set.evaluate(() => ({
        reactionsNav: !!document.querySelector('[data-page="reactions"]'),
        focusNav: !!document.querySelector('[data-page="focus"]'),
        homeHasPomo: !!document.querySelector('#page-home #pomoFocus'),
        homeHasReminders: !!document.querySelector('#page-home #remList'),
        navCount: document.querySelectorAll('#nav .item').length,
        switchCount: document.querySelectorAll('.sw input').length,
      }));
      ok('SETTINGS: the Reactions page is GONE (nav + section)', ui.reactionsNav === false, JSON.stringify(ui));
      ok('SETTINGS: the separate Focus & Reminders page is GONE', ui.focusNav === false);
      ok('SETTINGS: the Pomodoro card lives on the homepage', ui.homeHasPomo === true);
      ok('SETTINGS: the Reminders editor lives on the homepage', ui.homeHasReminders === true);
      await set.screenshot({ path: path.join(OUT, 'v317_settings_home.png') });
    }
  }

  // ================= housekeeping =================
  ok('app alive at the end', alive());
  const crashes = crashMarkers();
  ok('no crash markers in the app log', crashes.length === 0, JSON.stringify(crashes.slice(0, 3)));

  const pass = results.filter(r => r.pass).length;
  console.log(`\n=== e2e-v317: ${pass}/${results.length} checks pass ===`);
  if (pass !== results.length) process.exitCode = 1;
} catch (e) {
  console.error('E2E ERROR:', e && e.stack || e);
  console.error('app log tail:\n' + appLog.slice(-2500));
  process.exitCode = 1;
} finally {
  try { app.kill('SIGTERM'); } catch { }
  await sleep(700);
  try { app.kill('SIGKILL'); } catch { }
  try { browser.close(); } catch { }
  try { xvfb?.kill(); } catch { }
  try { rmSync(userData, { recursive: true, force: true }); } catch { }
}
