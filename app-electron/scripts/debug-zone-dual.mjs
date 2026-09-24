// debug-zone-dual.mjs — probe per-display zone overlays under fake dual displays
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '3200x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await sleep(1200);
}
const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-zdbg-'));
const app = spawn(path.join(ROOT, 'node_modules', '.bin', 'electron'), [
  '.', '--remote-debugging-port=9383', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
], {
  cwd: ROOT,
  env: {
    ...process.env, DISPLAY: process.env.DISPLAY,
    MEOWCAT_TEST: '1',
    MEOWCAT_FAKE_DISPLAYS: JSON.stringify([{ x: 0, y: 0, width: 1600, height: 1000 }, { x: 1600, y: 0, width: 1600, height: 1000 }]),
    XDG_CONFIG_HOME: userData, XDG_CACHE_HOME: userData,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch('http://127.0.0.1:9383/json/version'); if (r.ok) break; } catch {}
  await sleep(500);
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9383');
async function findCat() {
  for (let i = 0; i < 40; i++) {
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
      if (!p.isClosed?.() && p.url().endsWith('cat.html')) return p;
    }
    await sleep(300);
  }
  return null;
}
try {
  const cat = await findCat();
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 });
  console.log('selectZone:', await cat.evaluate(() => window.meow.selectZone()));
  for (let k = 0; k < 12; k++) {
    await sleep(500);
    const pages = [];
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.url().endsWith('zone-select.html')) {
          let cfg = null, alive = true;
          try { cfg = await p.evaluate(() => window.__zoneCfg()); } catch { alive = false; }
          pages.push({ alive, closed: p.isClosed(), cfg: cfg && { origin: cfg.origin, w: cfg.width, gen: cfg.gen } });
        }
      }
    }
    console.log('t+' + (k * 0.5).toFixed(1) + 's', JSON.stringify(pages));
  }
  console.log('--- appLog zone lines ---');
  console.log(appLog.split('\n').filter(l => /zone|Zone|gone/.test(l)).slice(-8).join('\n'));
} catch (e) {
  console.error('DBG FAIL', e);
} finally {
  app.kill('SIGKILL'); xvfb?.kill(); browser.close().catch(() => {});
  try { rmSync(userData, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
