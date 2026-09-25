// dance-probe.mjs — render the v3.16 six-step dance phases + the salute to
// PNGs so the geometry can be eyeballed (and measured) before release.
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'dance-probe');
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const srv = http.createServer((req, rq) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, p === '/' ? 'test/harness.html' : p);
  if (!existsSync(fp)) { rq.writeHead(404); rq.end(); return; }
  rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  rq.end(readFileSync(fp));
});
await new Promise(res => srv.listen(0, '127.0.0.1', () => res()));
const port = srv.address().port;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 420, height: 320 } });

const FRAMES = [
  ['1-step-right', 0.3], ['1-step-right-b', 1.1],
  ['2-step-left', 2.0], ['2-step-left-b', 2.8],
  ['3-hands-up', 4.5],
  ['4-spin', 6.0], ['4-back', 6.9],
  ['5-whip', 8.0], ['5-whip-face', 8.8],
  ['6-finish', 10.2],
  ['salute', null],
];

for (const [name, st] of FRAMES) {
  const q = st == null
    ? `state=salute&t=0.9&st=0.9`
    : `state=dance&t=${st}&st=${st}`;
  await page.goto(`http://127.0.0.1:${port}/test/harness.html?${q}`);
  await page.waitForFunction(() => document.title.startsWith('single-ready'));
  await page.waitForTimeout(60);
  const stats = await page.evaluate(() => {
    const cv = document.getElementById('cv');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i + 3] > 10) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    return { n, minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
  });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: 360, height: 260 } });
  console.log(name.padEnd(14), JSON.stringify(stats));
}
await browser.close();
srv.close();
console.log('PNGs →', OUT);
