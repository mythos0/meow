// profile-mem.mjs — where does the RAM go? 
// 1) boots MeowCat, reads renderer JS heap via CDP (performance.memory)
// 2) measures MeowCat proc-tree PSS
// 3) measures a BLANK Electron window proc-tree PSS as the framework baseline
'use strict';
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const electronBin = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function treePss(rootPid) {
  const out = execFileSync('ps', ['-eo', 'pid,ppid,rss,args'], { encoding: 'utf8' });
  const rows = [];
  for (const line of out.split('\n').slice(1)) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (m) rows.push({ pid: +m[1], ppid: +m[2], rss: +m[3], args: m[4] });
  }
  const byPid = new Map(rows.map(r => [r.pid, r]));
  const procs = [];
  const walk = pid => {
    const r = byPid.get(pid);
    if (!r) return;
    procs.push(r);
    for (const row of rows) if (row.ppid === pid) walk(row.pid);
  };
  walk(rootPid);
  let pss = 0;
  for (const p of procs) {
    try {
      const rollup = fs.readFileSync(`/proc/${p.pid}/smaps_rollup`, 'utf8');
      const m = rollup.match(/^Pss:\s+(\d+) kB/m);
      if (m) pss += +m[1];
    } catch {}
  }
  return { count: procs.length, pssMB: Math.round(pss / 1024), rssMB: Math.round(procs.reduce((a, p) => a + p.rss, 0) / 1024) };
}

// ---------------- 1. MeowCat live profile ----------------
const xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
await sleep(1200);
const app = spawn(electronBin, ['.', '--remote-debugging-port=9224', '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: ':99' },
});
await sleep(15000);

const { chromium } = await import('playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224').catch(() => null);
let heap = null;
if (browser) {
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
    if (!p.url().endsWith('cat.html')) continue;
    heap = await p.evaluate(() => window.performance && performance.memory ? {
      jsHeapUsedMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      jsHeapTotalMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
      jsHeapLimitMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
      canvasW: document.getElementById('cv')?.width,
      canvasH: document.getElementById('cv')?.height,
    } : { err: 'no performance.memory' }).catch(() => null);
  }
}
console.log('MeowCat renderer JS heap:', JSON.stringify(heap));

// find the electron root pid (the one whose parent is NOT electron/meowcat)
const psOut = execFileSync('ps', ['-eo', 'pid,ppid,comm'], { encoding: 'utf8' });
const rows = psOut.split('\n').slice(1).map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)/)).filter(Boolean)
  .map(m => ({ pid: +m[1], ppid: +m[2], comm: m[3] }));
const isApp = c => c === 'electron' || c === 'MeowCat' || c.startsWith('crashpad');
const electronRoots = rows.filter(r => isApp(r.comm) && !rows.some(c => c.pid === r.ppid && isApp(c.comm)));
console.log('MeowCat tree:', JSON.stringify(treePss(electronRoots[0]?.pid)));
app.kill('SIGKILL');

// ---------------- 2. blank Electron baseline ----------------
const blankDir = '/tmp/meow-blank';
fs.mkdirSync(blankDir, { recursive: true });
fs.writeFileSync(path.join(blankDir, 'package.json'), JSON.stringify({ name: 'blank', main: 'main.js', type: 'commonjs' }));
fs.writeFileSync(path.join(blankDir, 'main.js'), `
const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 480, height: 384, show: true });
  w.loadURL('data:text/html,<html><body>hi</body></html>');
});
`);
const blank = spawn(electronBin, ['.', '--no-sandbox'], {
  cwd: blankDir, stdio: 'ignore', env: { ...process.env, DISPLAY: ':99' },
});
await sleep(12000);
const blankRoots = rows2();
function rows2() {
  const out = execFileSync('ps', ['-eo', 'pid,ppid,comm'], { encoding: 'utf8' });
  const rs = out.split('\n').slice(1).map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)/)).filter(Boolean)
    .map(m => ({ pid: +m[1], ppid: +m[2], comm: m[3] }));
  return rs.filter(r => r.comm === 'electron' && !rs.some(c => c.pid === r.ppid && c.comm === 'electron' && c.pid !== r.pid));
}
console.log('Blank Electron tree:', JSON.stringify(treePss(blankRoots[0]?.pid)));
blank.kill('SIGKILL');
xvfb.kill();
process.exit(0);
