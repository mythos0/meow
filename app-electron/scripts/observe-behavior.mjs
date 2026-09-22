// observe-behavior.mjs — boots the real app under Xvfb, then observes the
// cat's live behavior for ~70s: state timeline (verifies the v3.2 "no random
// walking" behavior contract), emote anchor events, and how often the v3.3
// region window slides (RAM diet movement cost).
// Usage: node scripts/observe-behavior.mjs   (spawns its own Xvfb)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'observe');
mkdirSync(OUT, { recursive: true });

const SAMPLE_MS = 500;
const DURATION_MS = 70000;

let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));
}

const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9223', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });

for (let i = 0; i < 60; i++) {
  try { const r = await fetch('http://127.0.0.1:9223/json/version'); if (r.ok) break; } catch {}
  await new Promise(r => setTimeout(r, 500));
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');

function findCat(tries = 20) {
  return (async () => {
    for (let i = 0; i < tries; i++) {
      for (const ctx of browser.contexts()) for (const p of ctx.pages())
        if (p.url().endsWith('cat.html')) return p;
      await new Promise(r => setTimeout(r, 500));
    }
    return null;
  })();
}

const failures = [];
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
  if (!cond) failures.push(name + (extra ? ` (${extra})` : ''));
};

const cat = await findCat();
if (!cat) { console.error('cat window never appeared'); app.kill('SIGKILL'); xvfb?.kill(); process.exit(1); }
await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 }).catch(() => {});

// ---------------- long observation ----------------
const timeline = [];
const t0 = Date.now();
while (Date.now() - t0 < DURATION_MS) {
  const s = await cat.evaluate(() => {
    const b = window.__brain && window.__brain();
    const r = window.__region && window.__region();
    if (!b) return null;
    return {
      t: Math.round(b.t * 10) / 10, state: b.state, x: Math.round(b.x), y: Math.round(b.baseY),
      onPlat: !!b.onPlatform, emote: b.emote ? b.emote.kind : null,
      ox: r.x, oy: r.y,
    };
  }).catch(() => null);
  if (s) timeline.push(s);
  await new Promise(r => setTimeout(r, SAMPLE_MS));
}

// ---------------- analysis ----------------
const states = {};
for (const s of timeline) states[s.state] = (states[s.state] || 0) + 1;

// contract 1: no open-field roaming — every walking segment must be an
// edge-to-edge ground stroll or a platform stroll, never leave the bounds,
// and never "teleport" (per-sample |dx| bounded by run speed x sample time)
let maxDx = 0, teleport = null;
for (let i = 1; i < timeline.length; i++) {
  const a = timeline[i - 1], b = timeline[i];
  const dx = Math.abs(b.x - a.x);
  const limit = 150 * (SAMPLE_MS / 1000) * 1.35 + 2;   // runSpeed cap per sample
  if (dx > limit) { teleport = { at: a.t, from: a.x, to: b.x }; break; }
  maxDx = Math.max(maxDx, dx);
}
ok('no teleporting movement (bounded per-sample displacement)', !teleport,
  teleport ? JSON.stringify(teleport) : `max dx/sample ${maxDx}px`);

const outOfBounds = timeline.find(s => s.x < 0 || s.x > 1600 || s.y < 0 || s.y > 1000);
ok('cat stays on the desktop (never leaves the workArea)', !outOfBounds,
  outOfBounds ? JSON.stringify(outOfBounds) : 'all samples in bounds');

const roamy = Object.keys(states).filter(k => k === 'roam' || k === 'wander');
ok('no roam/wander states exist (random walking removed)', roamy.length === 0, statesStr(states));

// contract 2: cat LIVES — state variety over the run
const distinct = Object.keys(states).length;
ok('behavior shows state variety (alive, not frozen)', distinct >= 4, `${distinct} states: ${statesStr(states)}`);

// contract 3: emotes fire contextually during natural behavior
const emotes = new Set(timeline.map(s => s.emote).filter(Boolean));
ok('contextual emotes appeared during behavior', emotes.size >= 1, [...emotes].join(',') || 'none');

// contract 4: region window slid smoothly (few moves, cat always covered —
// already guaranteed by the renderer; here we just record the cost)
let slides = 0;
for (let i = 1; i < timeline.length; i++) {
  if (timeline[i].ox !== timeline[i - 1].ox || timeline[i].oy !== timeline[i - 1].oy) slides++;
}
ok('region slides stayed rare (movement cost is low)', slides < timeline.length * 0.15,
  `${slides} slides / ${timeline.length} samples`);

// platform hop sanity: with no real windows open, ground behavior only
console.log('\nstate histogram:', statesStr(states));
console.log('region slides:', slides);
console.log('samples:', timeline.length, 'over', DURATION_MS / 1000 + 's');

// compact timeline strip for the report
const strip = timeline.map(s => {
  const map = { idle: '_', walk: 'w', run: 'R', sit: 's', sleep: 'z', dance: 'd', eat: 'e',
    jump: 'j', scratch: 'x', groom: 'g', stretch: 't', pounce: 'p', knead: 'k', loaf: 'l',
    yawn: 'y', startle: '!', waddle: 'W', bamboo: 'b', roll: 'o', happy: 'h' };
  return map[s.state] || '?';
}).join('');
console.log('timeline:', strip);
writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 1));
writeFileSync(path.join(OUT, 'app.log'), appLog.slice(-4000));

function statesStr(states) {
  return Object.entries(states).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ');
}

app.kill('SIGKILL');
xvfb?.kill();
await browser.close().catch(() => {});
process.exit(failures.length ? 1 : 0);
