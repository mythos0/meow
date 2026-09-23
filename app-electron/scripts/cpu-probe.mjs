// cpu-probe.mjs — measure the app's total CPU% over a window while it idles
// and while it performs bops/hops (the flap-prone states). Usage:
//   DISPLAY=:99 node scripts/cpu-probe.mjs [observeMs]
'use strict';
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OBSERVE = Number(process.argv[2] || 15000);

const child = spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron'), ['.'], {
  cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'],
  env: { ...process.env, MEOW_TEST: '1' },
});
let err = '';
child.stderr.on('data', d => { err += d; });
await new Promise(r => setTimeout(r, 9000));   // settle

function cpuTicks() {
  // sum utime+stime (ticks) of the electron process tree
  const out = execFileSync('ps', ['-eo', 'pid,ppid,comm,etime,time'], { encoding: 'utf8' });
  let totalSec = 0, procs = 0;
  for (const line of out.split('\n').slice(1)) {
    if (!/electron/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const t = parts[parts.length - 1];          // TIME = cumulative cpu time
    const m = t.match(/^(?:(\d+):)?(\d+):(\d+)$/);
    if (!m) continue;
    totalSec += (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]);
    procs++;
  }
  return { sec: totalSec, procs };
}

const nproc = Number(execFileSync('nproc', { encoding: 'utf8' }).trim()) || 1;
const s0 = cpuTicks();
const t0 = Date.now();
await new Promise(r => setTimeout(r, OBSERVE));
const s1 = cpuTicks();
const wall = (Date.now() - t0) / 1000;
const cpuPct = ((s1.sec - s0.sec) / wall) * 100;   // % of ONE core
console.log(`procs=${s1.procs} cpuTotal=${(s1.sec - s0.sec).toFixed(1)}s over ${wall.toFixed(0)}s wall -> ${cpuPct.toFixed(1)}% of one core (${nproc} cores)`);
child.kill('SIGKILL');
process.exit(0);
