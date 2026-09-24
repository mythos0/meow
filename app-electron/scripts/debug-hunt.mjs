// debug-hunt.mjs — focused probe: park, spawn+pin butterfly, startStalk,
// sample the state machine every 80ms and dump the timeline.
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
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await sleep(1200);
}
const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-dbg-'));
const app = spawn(path.join(ROOT, 'node_modules', '.bin', 'electron'), [
  '.', '--remote-debugging-port=9381', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
], {
  cwd: ROOT,
  env: { ...process.env, DISPLAY: process.env.DISPLAY, MEOWCAT_TEST: '1', XDG_CONFIG_HOME: userData, XDG_CACHE_HOME: userData },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch('http://127.0.0.1:9381/json/version'); if (r.ok) break; } catch {}
  await sleep(500);
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9381');
async function findPage(suffix) {
  for (let i = 0; i < 40; i++) {
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
      if (!p.isClosed?.() && p.url().endsWith(suffix)) { try { await p.evaluate(() => 1); return p; } catch {} }
    }
    await sleep(300);
  }
  return null;
}

try {
  const cat = await findPage('cat.html');
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 });
  await cat.evaluate(() => { window.__stopButterfly(); return true; });
  await cat.evaluate(() => {
    const b = window.__brain();
    b.onPlatform = null; b._jump = null; b.stopStalk?.(); b.stopLaser?.();
    b._enter('idle', 45);
    b.x = 800; b.baseY = b.bounds.y + b.bounds.h - 8; b.jumpY = 0;
  });
  await sleep(300);
  await cat.evaluate(() => {
    window.__spawnButterfly();
    const b = window.__brain();
    b.dir = 1;
    window.__pinButterfly(b.x + 26, b.baseY - 104);
    return true;
  });
  await sleep(250);   // let the pin apply on the next tick
  const setup = await cat.evaluate(() => ({ catX: window.__brain().x, baseY: window.__brain().baseY, bf: window.__bfly() }));
  console.log('SETUP', JSON.stringify(setup));
  await cat.evaluate(() => {
    const b = window.__brain();
    const bf = window.__bfly();
    b.startStalk(bf.x, bf.y, 'butterfly');
    return true;
  });
  for (let i = 0; i < 70; i++) {
    await sleep(80);
    const s = await cat.evaluate(() => {
      const p = window.__pose();
      const h = window.__bflyHuntState();
      const b = window.__brain();
      return {
        st: p.state, stT: +(p.stateT || 0).toFixed(2), stalk: b.stalk && { x: b.stalk.x, y: b.stalk.y, k: b.stalk.kind },
        catX: b.x, attempts: h.attempts, pending: h.caughtPending, hunting: h.hunting,
        bf: window.__bfly(),
      };
    });
    console.log(String(i).padStart(3), JSON.stringify(s));
    if (s.pending || s.attempts >= 1) { console.log('EVENT HAPPENED at', i); break; }
  }
  const log = await cat.evaluate(async () => (await window.meow.execLogGet()).entries.filter(e => e.tag === 'hunt' || e.tag === 'action').slice(-12));
  console.log('JOURNAL:'); log.forEach(e => console.log(' ', e.tag, '|', e.msg));
} catch (e) {
  console.error('DBG FAIL', e);
} finally {
  app.kill('SIGKILL'); xvfb?.kill(); browser.close().catch(() => {});
  try { rmSync(userData, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
