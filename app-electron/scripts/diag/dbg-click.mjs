// dbg-click.mjs — probe why the in-page dblclick does not reach the handler
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
const ROOT = '/home/z/my-project/meow/app-electron';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const userData = mkdtempSync(path.join(os.tmpdir(), 'meow-dbg-'));
const app = spawn(path.join(ROOT, 'node_modules', '.bin', 'electron'), ['.', '--remote-debugging-port=9376', '--no-sandbox'], {
  cwd: ROOT,
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', MEOWCAT_TEST: '1', MEOWCAT_FAKE_CURSOR: '{"x":800,"y":500}', XDG_CONFIG_HOME: userData, XDG_CACHE_HOME: userData },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
app.stdout.on('data', d => { log += d; });
app.stderr.on('data', d => { log += d; });
for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:9376/json/version'); if (r.ok) break; } catch {} await sleep(500); }
const browser = await chromium.connectOverCDP('http://127.0.0.1:9376');
let cat = null;
for (let i = 0; i < 30 && !cat; i++) {
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
    if (p.url().endsWith('cat.html')) { try { await p.evaluate(() => 1); cat = p; } catch {} }
  }
  if (!cat) await sleep(400);
}
await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 }).catch(() => {});
const info = await cat.evaluate(() => {
  const b = window.__brain();
  const O = window.__offset();
  const p = b.pose;
  // instrument the handler chain
  window.__hits = [];
  window.addEventListener('dblclick', e => {
    window.__hits.push({ cx: e.clientX, cy: e.clientY, ts: performance.now() });
  });
  return { pose: { x: p.x, y: p.y }, O, size: (window.__getS ? window.__getS() : null), inner: { w: window.innerWidth, h: window.innerHeight } };
});
console.log('info:', JSON.stringify(info));
await cat.evaluate(() => {
  const p = window.__brain().pose;
  const O = window.__offset();
  window.dispatchEvent(new MouseEvent('dblclick', { clientX: p.x - O.x, clientY: p.y - O.y - 24, bubbles: true }));
  return true;
});
await sleep(400);
console.log('hits:', JSON.stringify(await cat.evaluate(() => window.__hits)));
console.log('lastPlay:', JSON.stringify(await cat.evaluate(() => window.__lastPlay || null)));
console.log('voiceDblLen probe:', await cat.evaluate(() => {
  // reach the module scope through a fresh dblclick on the REAL handler:
  // can't — but S/voiceDbl are module-private. Probe visible effects instead.
  return { lastPlay: !!window.__lastPlay };
}));
console.log('catHit mirror:', await cat.evaluate(() => {
  const p = window.__brain().pose;
  const O = window.__offset();
  const m = { x: p.x, y: p.y - 24 };   // what toScreen(client) yields
  const bb = { x: -88, y: -160, w: 180, h: 165 };
  return m.x >= p.x + bb.x && m.x <= p.x + bb.x + bb.w && m.y >= p.y + bb.y && m.y <= p.y + bb.y + bb.h;
}));
app.kill('SIGKILL');
try { rmSync(userData, { recursive: true, force: true }); } catch {}
process.exit(0);
