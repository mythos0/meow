// probe-windows.mjs — real-app probe: close → hide → reopen behavior
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
process.env.DISPLAY = ':99';
await new Promise(r => setTimeout(r, 1200));

const app = spawn(path.join(ROOT, 'node_modules', '.bin', 'electron'),
  ['.', '--remote-debugging-port=9223', '--no-sandbox', '--disable-gpu'], { cwd: ROOT });
let log = '';
app.stdout.on('data', d => { log += d; });
app.stderr.on('data', d => { log += d; });

for (let i = 0; i < 60; i++) {
  try { const r = await fetch('http://127.0.0.1:9223/json/version'); if (r.ok) break; } catch {}
  await new Promise(r => setTimeout(r, 500));
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');

async function findPage(suffix) {
  for (const ctx of browser.contexts())
    for (const p of ctx.pages())
      if (p.url().endsWith(suffix)) return p;
  return null;
}

// warm wait
await new Promise(r => setTimeout(r, 1800));
let set = await findPage('settings.html');
console.log('1. settings page exists (warm):', !!set);
if (set) console.log('   visibilityState:', await set.evaluate(() => document.visibilityState));

await set.evaluate(() => window.meow.openWindow('settings'));
await new Promise(r => setTimeout(r, 300));
console.log('2. after openWindow → visibility:', await set.evaluate(() => document.visibilityState));

await set.evaluate(() => window.close());
await new Promise(r => setTimeout(r, 500));
console.log('3. after window.close() → target alive?', !!(await findPage('settings.html')));
if (await findPage('settings.html')) {
  console.log('   visibility:', await set.evaluate(() => document.visibilityState).catch(e => 'EVAL FAIL: ' + e.message));
}
// count targets
const pages = [];
for (const ctx of browser.contexts()) for (const p of ctx.pages()) pages.push(p.url().split('/').pop());
console.log('   all targets:', pages.join(', '));

await set.evaluate(() => window.meow.openWindow('settings')).catch(e => console.log('   reopen eval fail:', e.message));
await new Promise(r => setTimeout(r, 300));
const set2 = await findPage('settings.html');
console.log('4. after reopen → target alive?', !!set2);
if (set2) console.log('   visibility:', await set2.evaluate(() => document.visibilityState).catch(e => 'EVAL FAIL'));

app.kill('SIGKILL'); xvfb.kill();
await browser.close().catch(() => {});
process.exit(0);
