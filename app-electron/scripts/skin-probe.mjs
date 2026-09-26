// skin-probe.mjs — v3.19: render EVERY store hat and costume on every breed
// to labeled PNG contact sheets so each skin can be EYEBALLED before release.
// One PNG per accessory (3 breeds side by side on a checker background),
// plus plain sheets of the restored real ginger cat in a few states.
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'skin-probe');
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

// the probe page: draws one accessory across all breeds, big cells, labels
const PROBE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;}canvas{display:block;}</style></head>
<body><canvas id="cv"></canvas><script type="module">
import { drawCat, drawParticles, PALETTES, BODIES } from '../src/cat-renderer.js';
const q = new URLSearchParams(location.search);
const breeds = Object.keys(PALETTES);
const hat = q.get('hat'), dress = q.get('dress'), jacket = q.get('jacket');
const state = q.get('state') || 'stand';
const CELL_W = 230, CELL_H = 250, FEET_PAD = 34;
const cv = document.getElementById('cv');
cv.width = breeds.length * CELL_W; cv.height = CELL_H + 22;
const g = cv.getContext('2d');
g.fillStyle = '#eceff4'; g.fillRect(0, 0, cv.width, cv.height);
for (let y = 0; y < cv.height; y += 16)
  for (let x = 0; x < cv.width; x += 16)
    if ((x / 16 + y / 16) % 2 === 0) { g.fillStyle = '#e0e4ec'; g.fillRect(x, y, 16, 16); }
breeds.forEach((breed, i) => {
  const ox = i * CELL_W;
  g.fillStyle = '#333'; g.font = '12px sans-serif';
  const label = (hat ? 'hat:' + hat : '') + (jacket ? ' jacket:' + jacket : '') + (dress ? ' dress:' + dress : '') + (!hat && !jacket && !dress ? 'plain' : '') + ' — ' + breed;
  g.fillText(label, ox + 8, 15);
  const pal = PALETTES[breed];
  const k = (BODIES[pal.body || 'normal'] || BODIES.normal).preview;
  g.save();
  g.translate(ox + CELL_W / 2, CELL_H - FEET_PAD);
  const opts = { t: 0.15, state, breed, dir: 1, scale: k * 1.6, jumpP: 0.5 };
  if (hat) opts.hat = hat;
  if (dress) opts.dress = dress;
  if (jacket) opts.jacket = jacket;
  try { drawCat(g, opts); drawParticles(g, opts); }
  catch (e) { g.fillStyle = '#c00'; g.fillText('ERROR ' + e.message, ox + 8, 60); }
  g.restore();
});
document.title = 'probe-ready';
window.__ready = true;
</script></body></html>`;

const srv = http.createServer((req, rq) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/test/skin-probe.html') {
    rq.writeHead(200, { 'Content-Type': 'text/html' });
    rq.end(PROBE_HTML);
    return;
  }
  const fp = path.join(ROOT, p === '/' ? 'test/harness.html' : p);
  if (!existsSync(fp)) { rq.writeHead(404); rq.end(); return; }
  rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  rq.end(readFileSync(fp));
});
await new Promise(res => srv.listen(0, '127.0.0.1', () => res()));
const port = srv.address().port;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 720, height: 280 } });

async function shot(query, name) {
  await page.goto(`http://127.0.0.1:${port}/test/skin-probe.html?${query}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 15000 });
  await page.waitForTimeout(40);
  await page.locator('#cv').screenshot({ path: path.join(OUT, name + '.png') });
  console.log('✓', name + '.png');
}

const HATS = ['pumpkin', 'santa', 'flower', 'shades', 'tophat', 'crown', 'bow',
  'witch', 'party', 'chef', 'cowboy', 'beanie', 'halo', 'horns'];
// v3.20: dresses/costumes are REMOVED — the probe covers hats only, plus a
// legacy-dress sheet proving the renderer paints NOTHING for an old id.

// the restored REAL ginger cat, plain, in a few states
await shot('state=sit', 'plain-ginger-sit');
await shot('state=walk', 'plain-ginger-walk');
await shot('state=stand', 'plain-ginger-stand');

for (const h of HATS) await shot('hat=' + h, 'hat-' + h);

// v3.21 WINTER JACKETS — every jacket on every breed, eyeballed before release
const JACKETS = ['puffer', 'parka', 'santa_coat', 'sweater', 'snowsuit', 'cardigan'];
for (const j of JACKETS) await shot('jacket=' + j, 'jacket-' + j);

// jacket + hat combos (the wardrobe stacks)
await shot('jacket=puffer&hat=witch', 'combo-puffer-witch');
await shot('jacket=santa_coat&hat=santa', 'combo-santa-santa');
await shot('jacket=cardigan&hat=beanie&state=sit', 'combo-cardigan-beanie-sit');

// v3.21 negative sheet: an unknown jacket id must paint NOTHING (plain look)
await shot('jacket=legacy_dress_x', 'unknown-jacket-ignored');

// v3.20 negative sheet: a legacy dress id must render exactly like plain
await shot('dress=hero', 'legacy-dress-ignored');

// one full-loadout sheet: ginger cat + witch hat (headline combo)
await page.setViewportSize({ width: 760, height: 300 });
await shot('hat=witch&state=sit', 'full-loadout-ginger');

await browser.close();
srv.close();
console.log('skin-probe: ' + (3 + HATS.length + JACKETS.length + 4) + ' sheets → ' + OUT);
