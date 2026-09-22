// e2e-robust.mjs — v3.6.1 robustness pass: adversarial scenarios through the
// REAL pipelines (real process detection, real pollers, real IPC, real timers).
// Every scenario pins a bug that shipped in v3.6.0 and is fixed in v3.6.1.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'e2e-electron-robust');
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// -------------------------------------------------- start Xvfb
let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));
}

// -------------------------------------------------- start electron
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9227', '--no-sandbox', '--disable-gpu'], {
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
    const res = await fetch('http://127.0.0.1:9227/json/version');
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

const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');

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
    return b.state;
  });

  // ============ 1. REAL call-app detection: a process named "zoom" ============
  // (the v3.6 e2e drove the duck handler directly; this one exercises the full
  // main-process pipeline: sysMonitor -> ps -> parseProcessList -> findCallApp)
  await calm();
  const hiddenState = () => cat.evaluate(async () => (await window.meow.appInfo()).hidden);
  const zoomBin = '/tmp/meow-e2e-call/zoom';
  mkdirSync('/tmp/meow-e2e-call', { recursive: true });
  copyFileSync('/bin/sleep', zoomBin);
  const zoomProc = spawn(zoomBin, ['600'], { stdio: 'ignore' });
  let callSeen = null;
  const tCall = Date.now();
  while (Date.now() - tCall < 30000) {
    const h = await hiddenState();
    if (h.call) { callSeen = { hiddenAtMs: Date.now() - tCall }; break; }
    await sleep(500);
  }
  ok('live: a process named "zoom" hides the cat (real ps -> call-app path)',
    !!callSeen, JSON.stringify(callSeen));
  await cat.screenshot({ path: path.join(OUT, 'robust_call_hidden.png') }).catch(() => {});

  // duck must also be active now
  const duckLive = await cat.evaluate(() => window.__volumeMul());
  ok('live: call detection ducks the cat sounds to 22%', duckLive === 0.22, String(duckLive));

  // ---- the regression: toggle "hide during calls" OFF while hidden ----
  // v3.6.0 bug: the stale hiddenByCall flag kept the cat invisible forever.
  await cat.evaluate(() => window.meow.setSettings({ hideDuringCalls: false }));
  let unhidden = null;
  const tUn = Date.now();
  while (Date.now() - tUn < 5000) {
    const h = await hiddenState();
    if (!h.call) { unhidden = { atMs: Date.now() - tUn }; break; }
    await sleep(300);
  }
  ok('regression: toggling hide-during-calls OFF unhides the cat instantly',
    !!unhidden, JSON.stringify(unhidden));

  // kill zoom: on the next process snapshot the duck lifts and the flag clears
  zoomProc.kill('SIGKILL');
  rmSync('/tmp/meow-e2e-call', { recursive: true, force: true });
  let duckRestored = 0;
  const tDk = Date.now();
  while (Date.now() - tDk < 25000) {
    duckRestored = await cat.evaluate(() => window.__volumeMul());
    if (duckRestored === 1) break;
    await sleep(500);
  }
  ok('call app exits -> duck lifts on the next process snapshot', duckRestored === 1, String(duckRestored));
  const visAfterKill = await hiddenState();
  ok('cat remains visible after the call app exits', visAfterKill.call === false, JSON.stringify(visAfterKill));
  await cat.evaluate(() => window.meow.setSettings({ hideDuringCalls: true, duckDuringCalls: true }));

  // ============ 2. reminder: real scheduler + chosen anim + single stat bump ==
  await calm();
  const rem0 = await cat.evaluate(async () => (await window.meow.getSettings()).stats.reminders || 0);
  await cat.evaluate(async () => {
    await window.meow.addReminder({
      label: 'E2E anim sleep', at: Date.now() + 1500, repeat: 'once', anim: 'sleep', sound: false,
    });
  });
  let remRes = null;
  const tRem = Date.now();
  while (Date.now() - tRem < 8000) {
    const s = await cat.evaluate(() => ({
      fired: (window.__firedReminders || []).some(l => l === 'E2E anim sleep'),
      state: window.__brain().state,
    }));
    if (s.fired) { remRes = s; break; }
    await sleep(400);
  }
  const rem1 = await cat.evaluate(async () => (await window.meow.getSettings()).stats.reminders || 0);
  ok('reminder fires through the real 1s scheduler', !!remRes, JSON.stringify(remRes));
  ok('reminder honors the chosen animation ("Cat does: sleep")',
    remRes && remRes.state === 'sleep', remRes ? remRes.state : 'no fire');
  ok('regression: reminder stat counted exactly once', rem1 - rem0 === 1, `delta=${rem1 - rem0}`);

  // ============ 3. hostile settings through the REAL IPC ============
  const poison = await cat.evaluate(async () => {
    await window.meow.setSettings({ noWalkZoneList: 'garbage' });
    await window.meow.setSettings({ stats: 'oops' });
    const coinsBefore = (await window.meow.getSettings()).coins;
    await window.meow.setSettings({ coins: -5 });
    const s = await window.meow.getSettings();
    return { zones: s.noWalkZoneList, statsOk: s.stats && typeof s.stats === 'object', coinsBefore, coinsAfter: s.coins };
  });
  ok('hostile setSettings cannot poison the live store',
    Array.isArray(poison.zones) && poison.zones.length === 0 &&
    poison.statsOk && poison.coinsAfter === poison.coinsBefore,
    JSON.stringify(poison));

  // ============ 4. region:move NaN guard (main-side hardening) ============
  const regionOk = await cat.evaluate(async () => {
    const r0 = window.__region();
    await window.meow.moveRegion({ x: NaN, y: NaN, w: NaN, h: NaN });
    const r1 = window.__region();
    return { r0, r1, finite: [r1.x, r1.y, r1.w, r1.h].every(Number.isFinite) };
  });
  ok('regression: moveRegion with NaN cannot poison the region', regionOk.finite,
    JSON.stringify(regionOk.r1));

  // ============ 5. photo guards ============
  const photoBad = await cat.evaluate(async () => window.meow.savePhoto('not-a-data-url'));
  ok('photo save rejects malformed payloads', photoBad && photoBad.ok === false &&
    photoBad.reason === 'bad-data', JSON.stringify(photoBad));

  // ============ 6. perks activate in production ============
  await calm();
  const perkRes = await cat.evaluate(async () => {
    // top up pets until pets_100 is guaranteed (may already be unlocked)
    for (let i = 0; i < 130; i++) {
      const s = await window.meow.getSettings();
      if ((s.unlocked || []).includes('pets_100')) break;
      await window.meow.petAffection();
    }
    await new Promise(r => setTimeout(r, 800));   // achievement event -> perk refresh
    return { perks: window.__perks(), unlocked: (await window.meow.getSettings()).unlocked };
  });
  ok('regression: rainbow perk activates once "Purring Machine" unlocks',
    (perkRes.unlocked || []).includes('pets_100') && perkRes.perks.rainbowPet === true,
    JSON.stringify({ unlocked: perkRes.unlocked, perks: perkRes.perks }));

  // ============ 6b. community skin import dedupes ============
  const dedup = await cat.evaluate(async () => {
    const skin = JSON.stringify({ name: 'DedupCat', base: 'bombay', colors: { fur: '#223355', eye: '#ffcc00' } });
    const r1 = await window.meow.importSkin(skin);
    const n1 = (await window.meow.getSettings()).customSkins.length;
    const r2 = await window.meow.importSkin(skin);          // same file again
    const s2 = await window.meow.getSettings();
    return { r1, r2, grew: s2.customSkins.length - n1, n: s2.customSkins.length };
  });
  ok('regression: importing the same community skin twice does not duplicate it',
    dedup.r1.ok && dedup.r2.ok && dedup.r2.deduped === true && dedup.r2.id === dedup.r1.id && dedup.grew === 0,
    JSON.stringify(dedup));

  // ============ 7. build-status poller: REAL file + verdict-change gating ==
  await calm();
  const statusFile = '/tmp/meow-e2e-status.txt';
  writeFileSync(statusFile, 'all tests pass ✓\n');
  await cat.evaluate(sf => window.meow.setSettings({ reactBuildStatus: true, statusFile: sf }), statusFile);
  let buildHappy = null;
  const tB = Date.now();
  while (Date.now() - tB < 4000) {
    const st = await cat.evaluate(() => window.__brain().state);
    if (st === 'happy') { buildHappy = { atMs: Date.now() - tB }; break; }
    await sleep(300);
  }
  ok('live: green status file -> celebration (real 5s poller)', !!buildHappy, JSON.stringify(buildHappy));
  writeFileSync(statusFile, 'tests FAILED, 3 errors\n');
  let buildMope = null;
  const tM = Date.now();
  while (Date.now() - tM < 9000) {
    const st = await cat.evaluate(() => window.__brain().state);
    if (st === 'mope') { buildMope = { atMs: Date.now() - tM }; break; }
    await sleep(400);
  }
  ok('live: red status file -> moping (verdict change only)', !!buildMope, JSON.stringify(buildMope));
  await cat.evaluate(() => window.meow.setSettings({ reactBuildStatus: false, statusFile: '' }));
  await cat.screenshot({ path: path.join(OUT, 'robust_build_mope.png') }).catch(() => {});

  // ============ 8. battery event shape from main (renderer reaction) ========
  await calm();
  const batE2 = await cat.evaluate(async () => {
    window.__testEvent('system-event', { type: 'battery', level: 0.1, charging: false });
    await new Promise(r => setTimeout(r, 300));
    const low = { state: window.__brain().state, low: window.__brain()._batteryLow,
      battery: window.__battery() };
    window.__testEvent('system-event', { type: 'battery', level: 0.9, charging: true });
    await new Promise(r => setTimeout(r, 300));
    return { low, high: { low: window.__brain()._batteryLow, battery: window.__battery() } };
  });
  ok('battery events from main drive the curl reaction (both directions)',
    batE2.low.state === 'curl' && batE2.low.low === true && batE2.high.low === false,
    JSON.stringify(batE2));

  // ============ 9. app still healthy ============
  const alive = await cat.evaluate(() => ({
    booted: window.__catBooted === true,
    brain: !!window.__brain(),
    state: window.__brain().state,
  }));
  ok('cat renderer still healthy after the whole torture pass',
    alive.booted && alive.brain, JSON.stringify(alive));

  results.push({ name: 'v3.6.1 robust e2e complete', pass: true });
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:', failed.map(f => f.name).join(' | '));
    process.exitCode = 1;
  }
} catch (e) {
  console.error('E2E crashed:', e);
  console.error('App log tail:\n' + appLog.slice(-2500));
  process.exitCode = 1;
} finally {
  app.kill('SIGKILL');
  xvfb?.kill();
  await browser.close().catch(() => {});
}
