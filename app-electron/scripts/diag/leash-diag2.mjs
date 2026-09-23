import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
const ROOT = '/home/z/my-project/meow/app-electron';
let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));
}
const app = spawn(path.join(ROOT, 'node_modules/.bin/electron'), ['.', '--remote-debugging-port=9231', '--no-sandbox', '--disable-gpu'], { cwd: ROOT, env: { ...process.env }, stdio: ['ignore','pipe','pipe'] });
for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:9231/json/version'); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
const browser = await chromium.connectOverCDP('http://127.0.0.1:9231');
let cat = null;
for (let i = 0; i < 20 && !cat; i++) {
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().endsWith('cat.html')) cat = p;
  if (!cat) await new Promise(r => setTimeout(r, 500));
}
await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 });
await cat.evaluate(() => window.meow.setSettings({ companionCat: true }));
await new Promise(r => setTimeout(r, 500));
const out = await cat.evaluate(async () => {
  const b = window.__brain();
  const c = window.__companionBrain();
  b._enter('idle', 60); b.x = 800; b.baseY = b.groundY;
  // trap: intercept writes to c.x > 100px in one write
  const log = [];
  let realX = c.x;
  Object.defineProperty(c, 'x', {
    configurable: true,
    get() { return realX; },
    set(v) {
      if (Math.abs(v - realX) > 100) {
        log.push({ from: Math.round(realX), to: Math.round(v), d: Math.round(v - realX), state: c.state, jump: !!c._jump });
      }
      realX = v;
    },
  });
  c._jump = null; c.onPlatform = null; c._enter('idle', 1);
  c.x = b.x + 1200;   // logged as the fling itself — pop it
  log.length = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    if (Math.abs(c.x - b.x) < 400) break;
    await new Promise(r => setTimeout(r, 40));
  }
  return log.slice(0, 8);
});
console.log(JSON.stringify(out, null, 1));
app.kill('SIGKILL'); xvfb?.kill(); process.exit(0);
