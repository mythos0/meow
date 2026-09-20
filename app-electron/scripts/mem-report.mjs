// mem-report.mjs — launch the app under Xvfb, wait for settle, then report
// every process of this Electron binary: count + total PSS (Proportional Set
// Size, the fair way to sum shared pages). Mirrors what Task Manager shows.
// Usage: xvfb-run -a node scripts/mem-report.mjs [waitMs]
'use strict';
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WAIT = Number(process.argv[2] || 16000);

const electronBin = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron');
if (!fs.existsSync(electronBin)) {
  console.error('electron binary not found at', electronBin);
  process.exit(1);
}

const child = spawn(electronBin, ['.'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, MEOW_TEST: '1' },
});
child.stdout.on('data', () => {});
child.stderr.on('data', () => {});

const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(WAIT);

// collect the process tree: electron main + all descendants
function listProcs() {
  const out = execFileSync('ps', ['-eo', 'pid,ppid,rss,comm,args'], { encoding: 'utf8' });
  const rows = [];
  for (const line of out.split('\n').slice(1)) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/);
    if (!m) continue;
    rows.push({ pid: +m[1], ppid: +m[2], rss: +m[3], comm: m[4], args: m[5] });
  }
  return rows;
}

function pssOf(pid) {
  try {
    const roll = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
    const m = roll.match(/^Pss:\s+(\d+) kB/m);
    return m ? +m[1] : 0;
  } catch { return 0; }
}

const rows = listProcs();
const byPid = new Map(rows.map(r => [r.pid, r]));
const isElectron = r => /electron/i.test(r.comm) || /electron/i.test(r.args);
const mine = new Set();
// start from our child pid and walk descendants
const queue = [child.pid];
while (queue.length) {
  const pid = queue.pop();
  if (mine.has(pid)) continue;
  mine.add(pid);
  for (const r of rows) if (r.ppid === pid && !mine.has(r.pid)) queue.push(r.pid);
}
const procs = rows.filter(r => mine.has(r.pid) && isElectron(r));
let totalPss = 0, totalRss = 0;
console.log('pid\tppid\tcomm\tRSS_kB\tPSS_kB');
for (const p of procs.sort((a, b) => a.pid - b.pid)) {
  const pss = pssOf(p.pid);
  totalPss += pss;
  totalRss += p.rss;
  const tag = /--utility-sub-type=(\S+)/.exec(p.args)?.[1]
    || /--type=(\S+)/.exec(p.args)?.[1] || 'MAIN';
  console.log(`${p.pid}\t${p.ppid}\t${p.comm}\t${p.rss}\t${pss}\t(${tag})`);
}
console.log('---');
console.log(`processes=${procs.length} rssMB=${(totalRss / 1024).toFixed(1)} pssMB=${(totalPss / 1024).toFixed(1)}`);

try { child.kill('SIGTERM'); } catch {}
process.exit(0);
