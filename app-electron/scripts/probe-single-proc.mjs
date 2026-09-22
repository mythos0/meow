// probe-single-proc.mjs — verify TRUE single-process mode under Xvfb:
// process count, process names, boot health, rendering, multi-window support.
'use strict';
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const xvfb = spawn('Xvfb', [':98', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
process.env.DISPLAY = ':98';
await sleep(1200);

const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const extra = (process.env.PROBE_FLAGS || '').split(' ').filter(Boolean);
const app = spawn(electronBin, ['.', '--remote-debugging-port=9223', ...extra], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env },
});
let log = '';
app.stdout.on('data', d => { log += d; });
app.stderr.on('data', d => { log += d; });

let cdp = false;
for (let i = 0; i < 50; i++) {
  try { const r = await fetch('http://127.0.0.1:9223/json/version'); if (r.ok) { cdp = true; break; } } catch {}
  await sleep(400);
}
console.log('CDP ready:', cdp);
if (!cdp) { console.error('LOG:\n' + log.slice(-3000)); app.kill('SIGKILL'); xvfb.kill(); process.exit(1); }

await sleep(3000); // let the cat window settle

// ---- process tree detail
const out = execFileSync('ps', ['-eo', 'pid,ppid,comm,args'], { encoding: 'utf8' });
const rows = out.split('\n').slice(1).map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean)
  .map(m => ({ pid: +m[1], ppid: +m[2], comm: m[3], args: m[4] }));
const kids = new Map();
for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r.pid); }
const tree = [];
const walk = pid => { const r = rows.find(x => x.pid === pid); if (r) tree.push(r); for (const c of kids.get(pid) || []) walk(c); };
walk(app.pid);
console.log('tree from launcher pid', app.pid + ':');
for (const t of tree) console.log('  pid', t.pid, 'ppid', t.ppid, 'comm', t.comm, '|', t.args.slice(0, 130));
const fam = tree.filter(t => t.comm === 'electron' || t.comm === 'MeowCat' || t.comm.startsWith('crashpad'));
const famNoZygote = fam.filter(t => !t.args.includes('--type=zygote'));
console.log('electron-family procs:', fam.length, '| excluding zygotes:', famNoZygote.length,
  '| renderers:', famNoZygote.filter(t => t.args.includes('--type=renderer')).length,
  '| utilities:', famNoZygote.filter(t => t.args.includes('--type=utility')).length);

// ---- health via CDP
const { chromium } = await import('playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
let cat = null;
for (let i = 0; i < 10 && !cat; i++) {
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().endsWith('cat.html')) cat = p;
  if (!cat) await sleep(500);
}
if (!cat) { console.error('no cat.html page'); app.kill('SIGKILL'); xvfb.kill(); process.exit(1); }
await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 }).catch(() => {});
const booted = await cat.evaluate(() => window.__catBooted === true);
const pixels = await cat.evaluate(() => {
  const cv = document.getElementById('cv');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
  return n;
});
const pose = await cat.evaluate(() => window.__pose && window.__pose());
console.log('cat booted:', booted, '| opaque pixels:', pixels, '| pose:', JSON.stringify(pose));
await cat.screenshot({ path: '/home/z/my-project/meow/artifacts/probe-single-proc-cat.png' });

// multi-window in single-process mode: settings must open + render
await cat.evaluate(() => window.meow.openWindow('settings'));
let set = null;
for (let i = 0; i < 10 && !set; i++) {
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().endsWith('settings.html')) set = p;
  if (!set) await sleep(400);
}
console.log('settings window opens in single-process mode:', !!set);
if (set) {
  await set.waitForTimeout(800);
  const breeds = await set.evaluate(() => document.querySelectorAll('.breed').length).catch(e => 'ERR:' + e.message);
  console.log('settings breed cards:', breeds);
  await set.screenshot({ path: '/home/z/my-project/meow/artifacts/probe-single-proc-settings.png' });
  await set.evaluate(() => window.meow.closeWindow('settings')).catch(() => {});
}

// ---- recount AFTER the settings window opened (renderer-process-limit check)
{
  const out2 = execFileSync('ps', ['-eo', 'pid,ppid,comm,args'], { encoding: 'utf8' });
  const rows2 = out2.split('\n').slice(1).map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean)
    .map(m => ({ pid: +m[1], ppid: +m[2], comm: m[3], args: m[4] }));
  const fam2 = rows2.filter(r => (r.comm === 'electron' || r.comm === 'MeowCat' || r.comm.startsWith('crashpad')) && r.args.includes(ROOT));
  const noZyg = fam2.filter(t => !t.args.includes('--type=zygote'));
  console.log('AFTER settings: family', fam2.length, '| no-zygote', noZyg.length,
    '| renderers', noZyg.filter(t => t.args.includes('--type=renderer')).length,
    '| utilities', noZyg.filter(t => t.args.includes('--type=utility')).length,
    '| crashpad', fam2.filter(t => t.comm.startsWith('crashpad')).length);
}

// does the app still quit cleanly?
app.kill('SIGTERM');
await sleep(1500);
const alive = (() => { try { process.kill(app.pid, 0); return true; } catch { return false; } })();
console.log('app exits on SIGTERM:', !alive);
browser.close().catch(() => {});
xvfb.kill();
