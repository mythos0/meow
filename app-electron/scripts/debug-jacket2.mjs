// debug-jacket2.mjs — print the bounding boxes of jacket-painted pixel
// clusters below the torso, plus sample colors, to pin the leak exactly.
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body><canvas id="cv" width="1100" height="500" style="display:none"></canvas><script type="module">
import { drawCat, PALETTES, BODIES } from '../src/cat-renderer.js';
const cv = document.getElementById('cv');
const g = cv.getContext('2d', { willReadFrequently: true });
const breed = 'grey_tabby';
const Z = 4;
function render(ctx, jacket) {
  ctx.save(); ctx.translate(320, 440); ctx.scale(Z, Z);
  const opts = { t: 0.15, state: 'stand', breed, dir: 1, scale: 1, jumpP: 0.5 };
  if (jacket) opts.jacket = 'puffer';
  drawCat(ctx, opts); ctx.restore();
}
const withJ = document.createElement('canvas'); withJ.width = 1100; withJ.height = 500;
const noJ = document.createElement('canvas'); noJ.width = 1100; noJ.height = 500;
render(withJ.getContext('2d', { willReadFrequently: true }), true);
render(noJ.getContext('2d', { willReadFrequently: true }), false);
const A = withJ.getContext('2d').getImageData(0, 0, 1100, 500);
const B = noJ.getContext('2d').getImageData(0, 0, 1100, 500);
// cluster diff pixels below the torso belly line (screen y > 320) into a bbox
const pts = [];
for (let y = 0; y < 500; y++) {
  for (let x = 0; x < 1100; x++) {
    const i = (y * 1100 + x) * 4;
    const d = Math.abs(A.data[i]-B.data[i]) + Math.abs(A.data[i+1]-B.data[i+1]) + Math.abs(A.data[i+2]-B.data[i+2]);
    if (d > 24) pts.push([x, y]);
  }
}
const below = pts.filter(([x, y]) => y > 320);
const bbox = r => r.length ? {
  minX: Math.min(...r.map(p=>p[0])), maxX: Math.max(...r.map(p=>p[0])),
  minY: Math.min(...r.map(p=>p[1])), maxY: Math.max(...r.map(p=>p[1])), n: r.length } : null;
// body-space conversion: bx=(x-320)/4, by=(y-440)/4 + 44  (standY offset)
const toBody = b => b && ({ bx: [(b.minX-320)/4, (b.maxX-320)/4].map(v=>v.toFixed(1)),
  by: [((b.minY-440)/4+44), ((b.maxY-440)/4+44)].map(v=>v.toFixed(1)), n: b.n });
window.__res = {
  totalDiff: pts.length,
  belowBelly: toBody(bbox(below)),
  sample: (() => {
    // sample the deepest strip pixel color in withJ (bottom-most diff pixel)
    const deepest = pts.reduce((a, p) => (p[1] > a[1] ? p : a), [0, 0]);
    const i = (deepest[1] * 1100 + deepest[0]) * 4;
    return { x: deepest[0], y: deepest[1],
      with: [A.data[i], A.data[i+1], A.data[i+2]],
      without: [B.data[i], B.data[i+1], B.data[i+2]] };
  })(),
};
window.__ready = true;
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
const page = await browser.newPage();
await page.goto('http://127.0.0.1:' + port + '/test/debug.html');
await page.waitForFunction('window.__ready === true', null, { timeout: 15000 });
console.log(JSON.stringify(await page.evaluate(() => window.__res), null, 1));
await browser.close();
srv.close();
