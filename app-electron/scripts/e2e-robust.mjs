// e2e-robust.mjs — adversarial scenarios through the REAL pipelines (real IPC,
// real pollers, real timers). Since v3.10 it also pins the two user directives:
//   * NO cat-hiding logic exists anymore — a Zoom-named process must NOT hide
//     the cat, must NOT duck its sounds, and the settings/UI must not offer it.
//   * the cat's process never stops on its own — closing/destroying the cat
//     window without a quit must self-heal with a fresh booted cat window.
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
  let cat = await findPage('cat.html');
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

  // ============ 1. v3.10: NO auto-hide exists — a call app must be ignored ====
  // (the old pipeline sysMonitor -> ps -> parseProcessList -> findCallApp is
  // deleted; a Zoom process must change NOTHING for the cat)
  await calm();
  const appInfo0 = await cat.evaluate(async () => window.meow.appInfo());
  ok('hidden state has only the user flag (call/fullscreen hide deleted)',
    appInfo0.hidden && !('call' in appInfo0.hidden) && !('fullscreen' in appInfo0.hidden) &&
    appInfo0.hidden.user === false, JSON.stringify(appInfo0.hidden));
  const s0 = await cat.evaluate(async () => window.meow.getSettings());
  ok('settings expose no hide toggles anymore',
    !('hideDuringCalls' in s0) && !('duckDuringCalls' in s0) && !('hideInFullscreen' in s0));
  ok('renderer has no duck volume multiplier left',
    await cat.evaluate(() => window.__volumeMul === undefined));

  const zoomBin = '/tmp/meow-e2e-call/zoom';
  mkdirSync('/tmp/meow-e2e-call', { recursive: true });
  copyFileSync('/bin/sleep', zoomBin);
  const zoomProc = spawn(zoomBin, ['600'], { stdio: 'ignore' });
  await sleep(6500);   // > 2 monitor samples: any resurrected detector would have fired
  const duringCall = await cat.evaluate(() => ({
    hidden: window.__catVisible(),
    paints: window.__paintCount || 0,
  }));
  const paintsA = duringCall.paints;
  await sleep(1200);
  const paintsB = await cat.evaluate(() => window.__paintCount || 0);
  ok('live: a process named "zoom" does NOT hide the cat (loop keeps painting)',
    duringCall.hidden === true && paintsB > paintsA, `paints ${paintsA}->${paintsB}`);
  zoomProc.kill('SIGKILL');
  rmSync('/tmp/meow-e2e-call', { recursive: true, force: true });

  // ============ 1b. v3.10: the cat window self-heals without a quit ==========
  // window.close() destroys the overlay — main must notice and resurrect it;
  // the app process must never die.
  const oldPaints = await cat.evaluate(() => window.__paintCount || 0);
  await cat.evaluate(() => window.close()).catch(() => {});   // the evaluate may lose the target as it closes
  let revived = null;
  const tRev = Date.now();
  while (Date.now() - tRev < 15000) {
    cat = await findPage('cat.html', 4);
    if (cat) {
      try {
        await cat.waitForFunction('window.__catBooted === true', null, { timeout: 8000 });
        revived = { atMs: Date.now() - tRev, paintsFresh: await cat.evaluate(() => window.__paintCount || 0) };
        break;
      } catch { cat = null; }
    }
    await sleep(400);
  }
  let procAlive = true;
  try { process.kill(app.pid, 0); } catch { procAlive = false; }
  ok('live: closed cat window resurrects itself (fresh booted renderer, old paints=' + oldPaints + ')',
    !!revived && procAlive && revived.paintsFresh > 0, JSON.stringify({ revived, procAlive }));
  const infoAfterRevive = await cat.evaluate(async () => window.meow.appInfo());
  ok('app process is still the same healthy MeowCat after the revival',
    procAlive && !!infoAfterRevive.version, JSON.stringify({ version: infoAfterRevive.version, hidden: infoAfterRevive.hidden }));

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
    const skin = JSON.stringify({ name: 'DedupCat', base: 'grey_tabby', colors: { fur: '#223355', eye: '#ffcc00' } });   // v3.18: three-cat catalog
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
  // ============ 7/8. (v3.17: build-status file + battery reactions were
  // REMOVED with the Reactions page — their live checks went with them) ========

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
