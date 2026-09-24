// gen-zone-shot.mjs — retryable capture of the zone-select overlay screenshot
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'shots');
mkdirSync(OUT, { recursive: true });

let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));
}
const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-zone-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9345', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT,
  env: { ...process.env, DISPLAY: process.env.DISPLAY, MEOW_WARM_IDLE_MS: '3000',
         XDG_CONFIG_HOME: userData, XDG_CACHE_HOME: userData },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let cdp = false;
for (let i = 0; i < 60 && !cdp; i++) {
  try { cdp = (await fetch('http://127.0.0.1:9345/json/version')).ok; } catch {}
  if (!cdp) await new Promise(r => setTimeout(r, 500));
}
if (!cdp) { console.error('CDP failed'); process.exit(1); }
const browser = await chromium.connectOverCDP('http://127.0.0.1:9345');

async function findPage(suffix, tries = 30) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) for (const p of ctx.pages())
      if (p.url().endsWith(suffix)) return p;
    await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

try {
  const cat = await findPage('cat.html');
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 });
  await cat.evaluate(() => window.meow.selectZone());   // straight to the overlay
  const zone = await findPage('zone-select.html');
  if (!zone) throw new Error('no zone page');
  await zone.waitForFunction('window.__zoneCfg && window.__zoneCfg().union', null, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await zone.evaluate(() => {
    const fire = (type, x, y) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
    fire('mousedown', 420, 330);
    fire('mousemove', 950, 620);
  });
  // freeze the marching ants so the frame is stable, then shoot a clipped area
  await zone.evaluate(() => { window.__frozenShots = true; });
  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    try {
      await zone.screenshot({
        path: path.join(OUT, 'raw_zone_select.png'),
        omitBackground: true,
        clip: { x: 240, y: 180, width: 1120, height: 660 },
      });
      done = true;
    } catch (e) {
      console.log('attempt', attempt, 'failed:', String(e).slice(0, 120));
      await new Promise(r => setTimeout(r, 800));
    }
  }
  if (!done) throw new Error('zone screenshot failed 3x');
  console.log('shot raw_zone_select.png');
} catch (e) {
  console.error('ZONE SHOT ERROR:', e);
  process.exitCode = 1;
} finally {
  try { app.kill('SIGKILL'); } catch {}
  try { xvfb?.kill(); } catch {}
  try { rmSync(userData, { recursive: true, force: true }); } catch {}
}
