// e2e-probe-companion.mjs — observe region/kitten dynamics after a fling
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.env.DISPLAY = process.env.DISPLAY || ':98';

const electron = spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron'), ['.', '--remote-debugging-port=9229', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, MEOW_TEST: '1' },
});
let log = '';
electron.stderr.on('data', d => { log += d; });
electron.stdout.on('data', d => { log += d; });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser = null;
for (let i = 0; i < 60; i++) {
  try {
    const v = await fetch('http://127.0.0.1:9229/json/version');
    if (v.ok) break;
  } catch {}
  await sleep(500);
}
browser = await chromium.connectOverCDP('http://127.0.0.1:9229');
const ctx = browser.contexts()[0];
let cat = null;
for (const pg of ctx.pages()) {
  if (/cat\.html/.test(pg.url())) { cat = pg; break; }
}
if (!cat) { console.error('no cat page. log:', log.slice(-2000)); process.exit(1); }
await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 });

await cat.evaluate(() => window.meow.setSettings({ companionCat: true }));
await sleep(600);
const trace = await cat.evaluate(async () => {
  const b = window.__brain();
  const c = window.__companionBrain();
  c.x = b.x + 1200;
  const out = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const r = window.__region();
    out.push({
      t: Math.round((Date.now() - t0) / 100) / 10,
      main: Math.round(b.x), kit: Math.round(c.x), kitState: c.state,
      ox: r.x, kitLocal: Math.round(c.x - r.x), mainLocal: Math.round(b.x - r.x),
      dist: Math.round(Math.abs(c.x - b.x)),
    });
    await new Promise(r2 => setTimeout(r2, 300));
  }
  return out;
});
console.log('t | main | kit | kitState | ox | kitLocal | mainLocal | dist');
for (const s of trace) console.log(`${s.t} | ${s.main} | ${s.kit} | ${s.kitState} | ${s.ox} | ${s.kitLocal} | ${s.mainLocal} | ${s.dist}`);
electron.kill('SIGKILL');
process.exit(0);
