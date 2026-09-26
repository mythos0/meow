// debug-close.mjs — what exactly happens when the cat renderer calls window.close()?
import { chromium } from 'playwright';
import { spawn } from 'child_process';
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
const app = spawn(path.join(ROOT, 'node_modules', '.bin', 'electron'), ['.', '--remote-debugging-port=9229', '--no-sandbox', '--disable-gpu'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
app.stderr.on('data', d => { log += d; });
let browser = null;
for (let i = 0; i < 40; i++) {
  try { const r = await fetch('http://127.0.0.1:9229/json/version'); if (r.ok) break; } catch {}
  await sleep(500);
}
browser = await chromium.connectOverCDP('http://127.0.0.1:9229');
const find = async () => {
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().endsWith('cat.html')) return p;
  return null;
};
let cat = await find();
console.log('cat found:', !!cat);
await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 });
const p0 = await cat.evaluate(() => window.__paintCount || 0);
console.log('paints before:', p0);

// attempt the close and catch any error text
await cat.evaluate(() => { window.__myToken = 'ORIGINAL_PAGE'; });
const res = await cat.evaluate(() => {
  try { window.close(); return 'close() returned'; } catch (e) { return 'threw: ' + e.message; }
});
console.log('close result:', res);
await sleep(2500);

cat = await find();
console.log('cat still found:', !!cat, cat ? cat.url() : '');
if (cat) {
  const p1 = await cat.evaluate(() => window.__paintCount || 0).catch(e => 'ERR ' + e.message.split('\n')[0]);
  const tok = await cat.evaluate(() => window.__myToken || 'NO_TOKEN(resurrected page)').catch(e => 'ERR');
  console.log('paints after:', p1, '| token:', tok);
}
const alive = (() => { try { process.kill(app.pid, 0); return true; } catch { return false; } })();
console.log('app alive:', alive);
console.log('--- app log tail ---\n' + log.slice(-1500));
app.kill('SIGKILL'); xvfb?.kill();
setTimeout(() => process.exit(0), 300);
