// debug-jacket.mjs — is the mystery strip below the hem part of drawJacket?
// Rigorous in-page pixel diff: render cat WITH jacket and WITHOUT jacket on
// two stacked canvases → magenta-highlight every changed pixel. Whatever
// glows magenta IS painted by drawJacket.
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0}canvas{display:block}</style></head>
<body><canvas id="cv"></canvas><canvas id="ref" style="display:none"></canvas><script type="module">
import { drawCat, PALETTES, BODIES } from '../src/cat-renderer.js';
const cv = document.getElementById('cv');
const ref = document.getElementById('ref');
cv.width = ref.width = 1100; cv.height = ref.height = 500;
const g = cv.getContext('2d', { willReadFrequently: true });
const rg = ref.getContext('2d', { willReadFrequently: true });
const breed = 'grey_tabby';
const pal = PALETTES[breed];
const Z = 4;   // raw zoom — no preview shrink, torso fills the frame

function render(ctx, jacket) {
  ctx.save();
  ctx.translate(320, 440);
  ctx.scale(Z, Z);
  const opts = { t: 0.15, state: 'stand', breed, dir: 1, scale: 1, jumpP: 0.5 };
  if (jacket) opts.jacket = 'puffer';
  drawCat(ctx, opts);
  ctx.restore();
}
render(rg, false);          // reference: no jacket (hidden canvas)
render(g, true);            // main: with jacket

// overlay reference OUTLINE: paint reference pixels that differ from jacket
// render in translucent green so the strip (if part of the cat) glows green
const A = g.getImageData(0, 0, cv.width, cv.height);
const B = rg.getImageData(0, 0, ref.width, ref.height);
let diffCount = 0;
for (let i = 0; i < A.data.length; i += 4) {
  const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i+1] - B.data[i+1]) + Math.abs(A.data[i+2] - B.data[i+2]);
  if (d > 24) {
    diffCount++;
    A.data[i] = A.data[i] * 0.25 + 0;       // tint jacket-painted pixels red-ish
    A.data[i+1] = A.data[i+1] * 0.25;
    A.data[i+2] = A.data[i+2] * 0.25 + 60;
  } else if (B.data[i+3] > 0) {
    // cat pixel identical in both: dim it so jacket paint pops
    A.data[i] *= 0.45; A.data[i+1] *= 0.45; A.data[i+2] *= 0.45;
  }
}
g.putImageData(A, 0, 0);
window.__ready = true;
window.__diff = diffCount;
</script></body></html>`;

const srv = http.createServer((req, rq) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/test/debug.html') { rq.writeHead(200, { 'Content-Type': 'text/html' }); rq.end(HTML); return; }
  const fp = path.join(ROOT, p);
  if (!existsSync(fp)) { rq.writeHead(404); rq.end(); return; }
  rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  rq.end(readFileSync(fp));
});
await new Promise(res => srv.listen(0, '127.0.0.1', () => res()));
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 500 } });
await page.goto('http://127.0.0.1:' + port + '/test/debug.html');
await page.waitForFunction('window.__ready === true', null, { timeout: 15000 });
const n = await page.evaluate(() => window.__diff);
console.log('diff pixels painted by the jacket:', n);
await page.locator('#cv').screenshot({ path: path.resolve(ROOT, '..', 'artifacts', 'skin-probe', 'debug-jacket.png') });
console.log('debug-jacket.png done');
await browser.close();
srv.close();
