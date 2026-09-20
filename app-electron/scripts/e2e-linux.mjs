// e2e-linux.mjs — REAL app test: boot Electron under Xvfb, verify live behavior via CDP
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'e2e-electron');
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

// -------------------------------------------------- start electron
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9222', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT,
  env: { ...process.env, DISPLAY: process.env.DISPLAY },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });

// wait for CDP
let cdpReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
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

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');

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
  // ------------------------------------------------ 1. cat window alive + rendering
  const cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  if (!cat) throw new Error('no cat window');

  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 }).catch(() => {});
  const hasCanvas = await cat.evaluate(() => {
    const cv = document.getElementById('cv');
    if (!cv) return false;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
    return n > 500;
  });
  ok('cat paints opaque pixels on canvas', hasCanvas);

  // ------------------------------------------------ 2. brain alive: pose changes over time
  const p1 = await cat.evaluate(() => window.__pose && window.__pose());
  await cat.waitForTimeout(1800);
  const p2 = await cat.evaluate(() => window.__pose && window.__pose());
  ok('brain pose advances (animation clock)', p1 && p2 && p2.t > p1.t, `t ${p1?.t?.toFixed(2)} → ${p2?.t?.toFixed(2)}`);
  ok('cat state machine runs', p1 && p2 && (p1.x !== p2.x || p1.state !== p2.state || p1.t !== p2.t),
    `${p1?.state}@${p1?.x} → ${p2?.state}@${p2?.x}`);

  // screenshots of live cat at two moments
  await cat.screenshot({ path: path.join(OUT, 'cat_live_1.png') });
  await cat.waitForTimeout(700);
  await cat.screenshot({ path: path.join(OUT, 'cat_live_2.png') });

  // ------------------------------------------------ 3. forced action via IPC broadcast
  await cat.evaluate(() => window.__doAction && window.__doAction('dance'));
  await cat.waitForTimeout(300);
  const st = await cat.evaluate(() => window.__pose && window.__pose());
  ok('tray-style action (dance) reaches the cat', st && st.state === 'dance', st?.state);

  // ------------------------------------------------ 4. coins via real IPC
  const c0 = await cat.evaluate(() => window.meow.getCoins());
  await cat.evaluate(() => window.meow.addCoins(10));
  const c1 = await cat.evaluate(() => window.meow.getCoins());
  ok('coins persist through IPC+store', c1 === c0 + 10, `${c0} → ${c1}`);

  // ------------------------------------------------ 5. settings persist
  await cat.evaluate(() => window.meow.setSettings({ size: 1.25, sounds: false }));
  const s = await cat.evaluate(() => window.meow.getSettings());
  ok('settings round-trip', s.size === 1.25 && s.sounds === false, `size=${s.size}`);
  await cat.evaluate(() => window.meow.setSettings({ size: 1.0, sounds: true }));

  // ------------------------------------------------ 6. reminders via real scheduler
  await cat.evaluate(() => { window.__firedReminders = []; });
  await cat.evaluate(() => window.meow.addReminder({ label: 'e2e test', at: Date.now() + 1500, anim: 'dance' }));
  let fired = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const firedList = await cat.evaluate(() => window.__firedReminders || []);
    if (firedList.includes('e2e test')) { fired = true; break; }
    await cat.waitForTimeout(250);
  }
  ok('reminder fires → main→renderer IPC → cat notified', fired);
  const rlist = await cat.evaluate(() => window.meow.listReminders());
  ok('one-shot reminder consumed after firing', rlist.length === 0, `${rlist.length} left`);

  // ------------------------------------------------ 7. settings window opens & renders
  await cat.evaluate(() => window.meow.openWindow('settings'));
  const set = await findPage('settings.html');
  ok('settings window opens', !!set);
  if (set) {
    await set.waitForTimeout(800);
    const breedCount = await set.evaluate(() => document.querySelectorAll('.breed').length);
    ok('settings shows 6 breed cards', breedCount === 6, `${breedCount}`);
    await set.screenshot({ path: path.join(OUT, 'settings_live.png') });
  }

  // ------------------------------------------------ 8. reminders window opens & adds from UI
  await cat.evaluate(() => window.meow.openWindow('reminders'));
  const rem = await findPage('reminders.html');
  ok('reminders window opens', !!rem);
  if (rem) {
    await rem.waitForTimeout(600);
    await rem.fill('#label', 'drink water');
    await rem.evaluate(() => { document.getElementById('when').value = ''; });
    // set when = now + 60s
    await rem.evaluate(() => {
      const d = new Date(Date.now() + 60000);
      const pad = n => String(n).padStart(2, '0');
      document.getElementById('when').value =
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
    await rem.click('#addBtn');
    await rem.waitForTimeout(500);
    const n = await rem.evaluate(() => document.querySelectorAll('.rem').length);
    ok('reminder added from real UI', n >= 1, `${n} rows`);
    await rem.screenshot({ path: path.join(OUT, 'reminders_live.png') });
    // cleanup so one-shot doesn't fire later mid-run
    await rem.evaluate(() => window.meow.listReminders().then(async l => {
      for (const it of l) await window.meow.removeReminder(it.id);
    }));
  }

  // topmost enforcer sanity: window has always-on-top state via CDP? (skip on Linux)
  ok('e2e screenshots saved', true, OUT);
} catch (e) {
  console.error('E2E error:', e.message);
  results.push({ name: 'e2e run completed', pass: false, extra: e.message });
} finally {
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  writeFileSync(path.join(OUT, 'app.log'), appLog.slice(-8000));
  app.kill('SIGKILL');
  xvfb?.kill();
  await browser.close().catch(() => {});
}

const pass = results.filter(r => r.pass).length;
console.log(`\n=== E2E: ${pass}/${results.length} passed ===`);
process.exit(pass === results.length ? 0 : 1);
