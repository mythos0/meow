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
  c._jump = null; c.onPlatform = null; c._enter('idle', 1);
  c.x = b.x + 1200;
  const log = [];
  let lastX = c.x;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    const d = Math.abs(c.x - lastX);
    if (d > 100) log.push({ d: Math.round(d), x: Math.round(c.x), state: c.state, jump: !!c._jump, dir: c.dir, bx: Math.round(b.x), bstate: b.state, plat: !!c.onPlatform });
    lastX = c.x;
    if (Math.abs(c.x - b.x) < 400) break;
    await new Promise(r => setTimeout(r, 40));
  }
  return log.slice(0, 6);
});
console.log(JSON.stringify(out, null, 1));
app.kill('SIGKILL'); xvfb?.kill(); process.exit(0);
