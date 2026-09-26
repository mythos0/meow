// repro-store-close.mjs — reproduce the user's report: "cat is closed if i
// close the cat store". Full flow: boot → open store → buy/equip → close the
// settings window through EVERY close path the user can trigger (Close button
// IPC, renderer window.close() = native X / Alt+F4 equivalent) → watch the
// cat window, the app process, and the window census for 6s after each close.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
mkdirSync(path.join(ROOT, '..', 'artifacts', 'repro-store-close'), { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
  if (!cond) failures++;
};

// Xvfb
let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await sleep(1200);
}

const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9228', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT,
  env: { ...process.env, MEOW_WARM_IDLE_MS: '3000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });
app.on('exit', code => { appLog += `\n[APP EXITED code=${code}]`; });

let cdp = false;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch('http://127.0.0.1:9228/json/version'); if (r.ok) { cdp = true; break; } } catch {}
  await sleep(500);
}
if (!cdp) { console.error('CDP never came up:\n' + appLog.slice(-3000)); app.kill('SIGKILL'); xvfb?.kill(); process.exit(1); }
const browser = await chromium.connectOverCDP('http://127.0.0.1:9228');

async function findPage(suffix, tries = 20) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().endsWith(suffix)) return p;
    await sleep(500);
  }
  return null;
}
async function windowCensus() {
  return browser.evaluate(() => true).catch(() => null); // placeholder, real census below via targets
}
async function censusTargets() {
  try {
    const res = await fetch('http://127.0.0.1:9228/json/list');
    const list = await res.json();
    return list.map(t => t.url.replace(/^file:\/\//, '').split('/').pop()).sort();
  } catch { return ['<cdp-dead>']; }
}

try {
  let cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 });

  const paints0 = await cat.evaluate(() => window.__paintCount || 0).catch(() => -1);

  // ---- open the Cat Store (settings window) the way the user does ----
  await cat.evaluate(() => window.meow.openWindow('settings'));
  let settings = await findPage('settings.html');
  ok('settings window opened', !!settings);
  await sleep(800);

  // ---- exercise the store the way the user does: equip hat + jacket, then close ----
  const coins = await settings.evaluate(async () => {
    // jump to the store page like a user click would
    document.querySelector('.item[data-page="store"]')?.click();
    await new Promise(r => setTimeout(r, 300));
    // v3.21: dress the cat (hat + jacket) through the REAL settings IPC before closing
    await window.meow.setSettings({ hat: 'witch', jacket: 'puffer' });
    return window.meow.getCoins();
  });
  ok('store page reachable', typeof coins === 'number', 'coins=' + coins);
  const worn = await cat.evaluate(() => ({ hat: window.__hat ? window.__hat() : null, jacket: window.__jacket ? window.__jacket() : null }));
  ok('cat is wearing the witch hat + puffer jacket equipped in the store',
    worn.hat === 'witch' && worn.jacket === 'puffer', JSON.stringify(worn));

  // ---- close path 1: the Close button (IPC close-window → closeAll) ----
  await settings.evaluate(() => window.meow.closeWindow('settings')).catch(e => console.log('  (invoke lost as window dies: ' + e.message.split('\n')[0] + ')'));
  await sleep(3000);
  ok('path1: app still alive after Close-button close', app.exitCode === null && !app.signalCode, 'pid=' + app.pid);
  ok('path1: settings target gone', !(await censusTargets()).includes('settings.html'), (await censusTargets()).join(','));
  cat = await findPage('cat.html');
  ok('path1: cat window still exists', !!cat);
  if (cat) {
    const paints1 = await cat.evaluate(() => window.__paintCount || 0).catch(() => -1);
    ok('path1: cat still painting', paints1 > paints0, `${paints0} -> ${paints1}`);
  }

  // ---- close path 2: native X / Alt+F4 equivalent (renderer window.close()) ----
  await cat.evaluate(() => window.meow.openWindow('settings'));
  settings = await findPage('settings.html');
  ok('path2: settings reopened', !!settings);
  await sleep(800);
  await settings.evaluate(() => window.close()).catch(e => console.log('  (window.close lost: ' + e.message.split('\n')[0] + ')'));
  await sleep(3000);
  ok('path2: app still alive after native-style close', app.exitCode === null && !app.signalCode);
  ok('path2: settings target gone', !(await censusTargets()).includes('settings.html'));
  cat = await findPage('cat.html');
  ok('path2: cat window still exists', !!cat);
  if (cat) {
    const paints2 = await cat.evaluate(() => window.__paintCount || 0).catch(() => -1);
    ok('path2: cat still painting', paints2 > 0, 'paints=' + paints2);
  }

  // ---- close path 3: rapid open→close→open→close (race the pool) ----
  for (let i = 0; i < 3; i++) {
    await cat.evaluate(() => window.meow.openWindow('settings'));
    await sleep(400);
    await cat.evaluate(() => window.meow.closeWindow('settings')).catch(() => {});
    await sleep(200);
  }
  await sleep(3000);
  ok('path3: app still alive after open/close bursts', app.exitCode === null && !app.signalCode);
  cat = await findPage('cat.html');
  ok('path3: cat window still exists', !!cat);
  const census = await censusTargets();
  ok('path3: exactly one cat window, zero settings', census.filter(u => u === 'cat.html').length === 1 && !census.includes('settings.html'), census.join(','));

  // ---- path 4: close the store DURING the cat's 250ms resurrection gap ----
  // (if both windows are ever gone at the same instant, window-all-closed
  // fires — the cat must still come back)
  await cat.evaluate(() => window.meow.openWindow('settings'));
  settings = await findPage('settings.html');
  ok('path4: settings reopened for the race', !!settings);
  await sleep(600);
  const raceP = settings.evaluate(() => window.meow.closeWindow('settings')).catch(() => {});
  await cat.evaluate(() => window.close()).catch(() => {});   // kill the cat NOW — 250ms zero-window gap
  await raceP;
  await sleep(4000);
  ok('path4: app still alive after the race', app.exitCode === null && !app.signalCode);
  cat = await findPage('cat.html', 30);
  ok('path4: cat resurrected after the race', !!cat);
  if (cat) {
    await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 }).catch(() => {});
    const paints3 = await cat.evaluate(() => window.__paintCount || 0).catch(() => -1);
    ok('path4: resurrected cat painting', paints3 > 0, 'paints=' + paints3);
  }

  console.log('\n--- app log tail ---\n' + appLog.slice(-1200));
} catch (e) {
  console.error('REPRO CRASHED:', e);
  console.error('app log:\n' + appLog.slice(-3000));
  failures++;
} finally {
  try { app.kill('SIGKILL'); } catch {}
  try { xvfb?.kill(); } catch {}
  setTimeout(() => process.exit(failures ? 1 : 0), 300);
}
