// cpu-states-probe.mjs — v3.9: per-state CPU (sleep quantization vs walking
// with the chase camera). Boots the app, forces a state, measures the electron
// tree CPU over 10s via /proc tick deltas (100Hz resolution).
// Usage: DISPLAY=:98 node scripts/cpu-states-probe.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.env.DISPLAY = process.env.DISPLAY || ':98';

const electron = spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron'), ['.', '--remote-debugging-port=9229', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, MEOW_TEST: '1' },
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try { const v = await fetch('http://127.0.0.1:9229/json/version'); if (v.ok) break; } catch {}
  await sleep(500);
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9229');
let cat = null;
for (const pg of browser.contexts()[0].pages()) if (/cat\.html/.test(pg.url())) { cat = pg; break; }
await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 });
await sleep(2500);   // settle

function treeTicks() {
  let total = 0;
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let cmd = '';
    try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
    if (!/electron/.test(cmd)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      total += (+rest[11]) + (+rest[12]);
    } catch {}
  }
  return total;
}

async function measure(label, setupFn) {
  await cat.evaluate(setupFn);
  await sleep(1500);            // let the state settle
  const t0 = treeTicks();
  const w0 = Date.now();
  await sleep(10000);
  const pct = ((treeTicks() - t0) / 100 / ((Date.now() - w0) / 1000)) * 100;
  console.log(`${label}: ${pct.toFixed(1)}% of one core`);
  return pct;
}

const sPct = await measure('sleep (quantized ~7.5fps)', () => { const b = window.__brain(); b._enter('sleep', 120); });
await measure('idle (throttled 15fps)', () => { const b = window.__brain(); b._enter('idle', 120); });
const wPct = await measure('walk + chase camera (60fps)', () => { const b = window.__brain(); b.dir = 1; b._enter('walk', 60); });

// RAM of the tree
let rss = 0, procs = 0;
for (const d of fs.readdirSync('/proc')) {
  if (!/^\d+$/.test(d)) continue;
  let cmd = '';
  try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
  if (!/electron/.test(cmd)) continue;
  try {
    const s = fs.readFileSync(`/proc/${d}/statm`, 'utf8').trim().split(' ')[1];
    rss += (+s) * 4; procs++;    // pages × 4KB
  } catch {}
}
console.log(`procs=${procs} treeRSS=${(rss / 1024).toFixed(0)}MB`);
electron.kill('SIGKILL');
process.exit(0);
