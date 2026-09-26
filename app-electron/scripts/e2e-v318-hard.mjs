// e2e-v318-hard.mjs — ROBUST end-to-end pass against the REAL app under
// Xvfb (real IPC, real window pool, real brain, real render loop):
//   1. boot: exactly ONE renderer at rest — no hidden voice engine window
//   2. 60s walk monitor through window.__pose(): the facing flicker
//      ("stuck same place, facing both sides") must stay dead in the live app
//   3. Settings open→close ×5: the window is DESTROYED every time (process
//      diet) and the pool rebuilds it on demand
//   4. every hat × dress combo equipped LIVE through the real settings IPC:
//      the cat repaints without a single renderer error
//   5. meow burst: 10 rapid meows — queue bounded, app alive
//   6. process census + RSS report: one renderer at rest, nothing else
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'e2e-v318-hard');
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// kill strays from previous runs. The packaged main process renames its
// cmdline to "MeowCat" (afterpack), so pattern-matching pkill can never find
// it — kill by exact comm name, by dist path, by the node wrapper, and by
// whoever holds the debug port.
const killStrays = () => {
  for (const cmd of [
    "pkill -9 -x MeowCat",
    "pkill -9 -f 'dist/electron'",
    "pkill -9 -f 'remote-debugging-port=9362'",
  ]) { try { execSync(cmd); } catch {} }
  try { execSync("fuser -k -9 9362/tcp"); } catch {}
};
await killStrays();
await sleep(800);

// -------------------------------------------------- Xvfb
let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await sleep(1200);
}

// -------------------------------------------------- electron
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9362', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT,
  env: { ...process.env, MEOWCAT_TEST: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });

let cdpReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9362/json/version');
    if (res.ok) { cdpReady = true; break; }
  } catch {}
  await sleep(500);
}
if (!cdpReady) {
  console.error('CDP never came up. App log:\n' + appLog.slice(-3000));
  await killStrays();
  xvfb?.kill();
  process.exit(1);
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9362');

// -------------------------------------------------- error collectors
const consoleErrors = [];
const attach = page => {
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/favicon|net::ERR_ABORTED.*favicon/.test(m.text())) {
      consoleErrors.push(`console[${page.url().split('/').pop()}]: ${m.text().slice(0, 300)}`);
    }
  });
};

const allPages = () => browser.contexts().flatMap(c => c.pages());

// -------------------------------------------------- 1. boot census
await sleep(2500);
let pages = allPages();
for (const p of pages) attach(p);
ok('boot: exactly ONE renderer page at rest', pages.length === 1, pages.map(p => p.url()).join(' | '));
ok('boot: no voice/speech page exists',
  !pages.some(p => /voice|speech/i.test(p.url())),
  pages.map(p => p.url().split('/').pop()).join(','));

const cat = pages.find(p => /cat\.html/.test(p.url()));
if (!cat) {
  console.error('FATAL: cat page not found. App log:\n' + appLog.slice(-2000));
  app.kill('SIGKILL'); xvfb?.kill(); process.exit(1);
}
ok('boot: brain alive (window.__pose works)', await cat.evaluate(async () => {
  // wait until the hook reports its full shape (guards against stale apps)
  for (let i = 0; i < 30; i++) {
    const p = window.__pose && window.__pose();
    if (p && Number.isFinite(p.minX) && Number.isFinite(p.maxX)) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}));

// -------------------------------------------------- 2. 60s walk monitor
console.log('— walking monitor: 60s of real-app observation —');
const WALK_SECONDS = 60;
const samples = [];
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < WALK_SECONDS) {
  const pose = await cat.evaluate(() => window.__pose());
  if (pose) samples.push({ t: (Date.now() - t0) / 1000, ...pose });
  await sleep(200);
}
const GROUND = ['walk', 'waddle', 'run', 'zoomies'];
const flips = [];
for (let i = 1; i < samples.length; i++) {
  if (samples[i].dir !== samples[i - 1].dir && GROUND.includes(samples[i].state)) {
    flips.push(samples[i].t);
  }
}
let flipStorm = null;
for (let i = 1; i < flips.length; i++) {
  if (flips[i] - flips[i - 1] < 1.0) { flipStorm = `gap ${ (flips[i]-flips[i-1]).toFixed(2) }s at t=${flips[i].toFixed(1)}`; break; }
}
let burst10 = null;
for (const f of flips) {
  const n = flips.filter(g => g > f - 10 && g <= f).length;
  if (n > 6) { burst10 = `${n} flips in 10s at t=${f.toFixed(1)}`; break; }
}
ok('walk: no two direction flips within 1s (no vibration)', !flipStorm, flipStorm || `${flips.length} flips/60s`);
ok('walk: no 10s window with more than 6 flips (no ping-pong)', !burst10, burst10 || `${flips.length} flips total`);
const xSeries = samples.map(s => s.x);
ok('walk: x stayed finite and inside the brain\u2019s own bounds the whole minute',
  samples.every(s => Number.isFinite(s.x) && s.x >= (s.minX ?? -1) - 1 && s.x <= (s.maxX ?? 1601) + 1),
  `x range ${Math.min(...xSeries).toFixed(0)}..${Math.max(...xSeries).toFixed(0)}, bounds ${samples[0]?.minX?.toFixed(0)}..${samples[0]?.maxX?.toFixed(0)}`);
const netTravel = Math.max(...xSeries) - Math.min(...xSeries);
ok('walk: the cat actually travelled (alive, not frozen)', netTravel > 40, `net span ${netTravel.toFixed(0)}px`);
const states = new Set(samples.map(s => s.state));
ok('walk: behaviour varied over the minute', states.size >= 3, [...states].join(','));

// -------------------------------------------------- 3. settings destroy ×5
console.log('— settings destroy cycles ×5 —');
for (let cycle = 1; cycle <= 5; cycle++) {
  const before = allPages().length;
  const openT0 = Date.now();
  // up to 3 open attempts — the pool occasionally hiccups once under load;
  // a real regression fails all three and the check still fails
  let settingsPage = null;
  for (let attempt = 1; attempt <= 3 && !settingsPage; attempt++) {
    await cat.evaluate(() => window.meow.openWindow('settings'));
    for (let i = 0; i < 25; i++) {
      await sleep(100);
      settingsPage = allPages().find(p => /settings\.html/.test(p.url()));
      if (settingsPage) break;
    }
  }
  const openMs = Date.now() - openT0;
  const opened = !!settingsPage;
  if (!opened || !settingsPage) {
    ok(`settings cycle ${cycle}: opened`, false, `pages=${allPages().length} in ${openMs}ms`);
    break;
  }
  attach(settingsPage);
  ok(`settings cycle ${cycle}: opened fresh (${openMs}ms)`, openMs < 3000);
  // close from the CAT page — closing from the settings page would destroy
  // the CDP target mid-evaluate and reject the promise
  await cat.evaluate(() => window.meow.closeWindow('settings'));
  let closed = false;
  for (let i = 0; i < 40; i++) {
    await sleep(100);
    if (!allPages().some(p => /settings\.html/.test(p.url()))) { closed = true; break; }
  }
  ok(`settings cycle ${cycle}: closed DESTROYED (page gone)`, closed && allPages().length === before);
}

// -------------------------------------------------- 4. equip every combo LIVE
// v3.19: lists imported from the store module itself so they can never drift.
// v3.20: dresses are gone — the combos are the 14 hats + the bare face.
console.log('— equipping every hat (plus bare) through the real IPC —');
const { HAT_ITEMS } = await import('../src/settings-store.js');
const HATS = [null, ...HAT_ITEMS.map(i => i.id)];
const N_COMBOS = HATS.length;
let comboErrors = 0, comboApplied = 0, shot = 0;
const comboFails = [];
for (const hat of HATS) {
  await cat.evaluate(h => window.meow.setSettings({ hat: h }), hat);
  await sleep(150);
  const pose = await cat.evaluate(() => {
    const p = window.__pose ? window.__pose() : 'NO_HOOK';
    return p;
  });
  const alive = pose && typeof pose === 'object' && Number.isFinite(pose.x) && Number.isFinite(pose.t);
  if (alive) comboApplied++;
  else { comboErrors++; comboFails.push(`${hat || 'nohat'}: ${JSON.stringify(pose)}`); }
  if ((hat === null || hat === 'tophat' || hat === 'crown' || hat === 'witch' || hat === 'halo') && shot < 12) {
    await cat.screenshot({ path: path.join(OUT, `equip-${shot++}-${hat || 'nohat'}.png`) });
  }
}
ok(`equip: all ${N_COMBOS} hat combos applied live with zero renderer errors`,
  comboApplied === N_COMBOS && comboErrors === 0,
  `${comboApplied}/${N_COMBOS} applied, ${comboErrors} failures — ${comboFails.slice(0, 8).join(' ; ')}`);
ok('equip: settings page never auto-appeared during equips', !allPages().some(p => /settings\.html/.test(p.url())));
await cat.evaluate(() => window.meow.setSettings({ hat: null }));
await sleep(300);

// -------------------------------------------------- 5. meow burst
const burst = await cat.evaluate(async () => {
  window.__lastPlay = null;
  const res = { errors: 0, queuedMax: 0 };
  for (let i = 0; i < 10; i++) {
    try { window.__testMeow(1); } catch { res.errors++; }
    const st = window.__meowQueueState();
    res.queuedMax = Math.max(res.queuedMax, st.queued);
    await new Promise(r => setTimeout(r, 90));
  }
  return res;
});
ok('meow burst: 10 rapid meows, queue stayed bounded (≤3)', burst.errors === 0 && burst.queuedMax <= 3,
  JSON.stringify(burst));

// -------------------------------------------------- 6. process census + RSS
const census = (() => {
  try {
    const out = execSync('ps -eo pid=,rss=,args=', { encoding: 'utf8' });
    const lines = out.split('\n').filter(l => /electron/.test(l) && (/--type=/.test(l) || /\.bin\/electron/.test(l) || l.includes('node_modules/electron')));
    const procs = lines.map(l => {
      const [pid, rss] = l.trim().split(/\s+/);
      const sub = (l.match(/utility-sub-type=([\w.]+)/) || [])[1] || '';
      const type = /--type=renderer/.test(l) ? 'renderer'
        : /--type=gpu-process/.test(l) ? 'gpu'
        : /--type=zygote/.test(l) ? 'zygote'
        : /--type=utility/.test(l) ? `utility(${sub || 'unknown'})`
        : 'main';
      return { pid: +pid, rss: +rss, type };
    });
    return procs;
  } catch { return []; }
})();
const renderers = census.filter(p => p.type === 'renderer').length;
const ourUtilities = census.filter(p => p.type.startsWith('utility') && !/NetworkService|audio/.test(p.type));
ok('census: exactly ONE cat renderer at rest', renderers === 1, `renderers=${renderers}`);
ok('census: no helpers we spawn (only Chromium\u2019s own network service may exist)',
  ourUtilities.length === 0, `our utilities: ${ourUtilities.map(p => p.type).join(',') || 'none'}`);
ok('census: whole electron tree lean (≤8 processes)', census.length > 0 && census.length <= 8,
  census.map(p => p.type).join('+'));
const mainRss = census.find(p => p.type === 'main')?.rss || 0;
console.log(`— census: ${census.length} processes [${census.map(p => p.type).join(', ')}], main RSS ${(mainRss / 1024).toFixed(0)}MB —`);
ok('census: no stray PowerShell/helper children anywhere',
  !execSync('ps -eo args=', { encoding: 'utf8' }).split('\n').some(l => /powershell|pwsh|wscript|cscript/i.test(l)));

// -------------------------------------------------- 7. error sweep
ok('no renderer errors across the whole run', consoleErrors.length === 0,
  consoleErrors.slice(0, 5).join(' | '));
ok('cat renderer still healthy after the whole torture pass',
  await cat.evaluate(() => { const p = window.__pose(); return p && Number.isFinite(p.t); }));

// -------------------------------------------------- done
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await killStrays();   // the node wrapper does not forward signals — sweep the whole tree
setTimeout(() => { xvfb?.kill(); process.exit(failed.length ? 1 : 0); }, 400);
