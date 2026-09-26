// leg-probe.mjs — v3.22 natural-legs visual probe. Renders labeled contact
// sheets (walk cycle, run cycle, the six-step dance, and every state) for all
// three store breeds so the leg geometry can be EYEBALLED after the honest-
// bones + paw-clamp fix ("when cat is dancing or walking why the cat upper
// 2 leg gotten long?").
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'leg-probe');
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const srv = http.createServer((req, rq) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, p === '/' ? 'test/leg-probe.html' : p);
  if (!existsSync(fp)) { rq.writeHead(404); rq.end(); return; }
  rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  rq.end(readFileSync(fp));
});
await new Promise(res => srv.listen(0, '127.0.0.1', () => res()));
const port = srv.address().port;

const browser = await chromium.launch({ args: ['--no-sandbox'] });

const BREEDS = ['grey_tabby', 'ginger_kitten', 'smokey_kitten'];
const sheets = [];

// ---- 1. walk cycle: one full stride (f=7 -> T=0.8976) in 8 phases
{
  const cells = [];
  for (const b of BREEDS)
    for (let i = 0; i < 8; i++)
      cells.push({ label: `${b} walk t=${(i * 0.8976 / 8).toFixed(2)}`, state: 'walk', breed: b, t: i * 0.8976 / 8 });
  sheets.push({ name: 'leg-walk', cells, cols: 8, cw: 210, ch: 210 });
}
// ---- 2. run cycle: one full stride (f=12.5 -> T=0.5027) in 6 phases
{
  const cells = [];
  for (const b of BREEDS)
    for (let i = 0; i < 6; i++)
      cells.push({ label: `${b} run t=${(i * 0.5027 / 6).toFixed(3)}`, state: 'run', breed: b, t: i * 0.5027 / 6 });
  sheets.push({ name: 'leg-run', cells, cols: 6, cw: 210, ch: 210 });
}
// ---- 3. dance: the six steps, 12 snapshots covering stateT 0 -> 10.4
{
  const STS = [0.3, 1.1, 1.9, 2.8, 3.6, 4.2, 4.6, 5.1, 6.0, 6.9, 8.0, 8.8, 9.9, 10.3];
  const cells = [];
  for (const b of BREEDS)
    for (const st of STS)
      cells.push({ label: `${b} dance st=${st}`, state: 'dance', breed: b, t: st, st });
  sheets.push({ name: 'leg-dance', cells, cols: 7, cw: 210, ch: 230 });
}
// ---- 4. every state, 2 phases each, all breeds — chunked sheets of 8 rows
{
  const STATES = ['idle', 'sit', 'sleep', 'happy', 'eat', 'stretch', 'groom', 'pounce',
                  'knead', 'loaf', 'yawn', 'startle', 'waddle', 'bamboo', 'roll',
                  'sneeze', 'hairball', 'zoomies', 'laser', 'stalk', 'bop', 'mope',
                  'nuzzle', 'investigate', 'sniff', 'curl'];
  const TIMES = [0.2, 0.55];
  const cells = [];
  for (const st of STATES)
    for (const tt of TIMES)
      for (const b of BREEDS)
        cells.push({ label: `${st} t=${tt} ${b}`, state: st, breed: b, t: tt });
  for (let chunk = 0; chunk * 8 < cells.length; chunk++)
    sheets.push({ name: `leg-states-${chunk + 1}`, cells: cells.slice(chunk * 8, chunk * 8 + 8), cols: 6, cw: 210, ch: 210 });
}
// ---- 5. jump arc
{
  const cells = [];
  for (const b of BREEDS)
    for (const p of [0.1, 0.35, 0.5, 0.65, 0.9])
      cells.push({ label: `${b} jump p=${p}`, state: 'jump', breed: b, t: 0.3, jumpP: p });
  sheets.push({ name: 'leg-jump', cells, cols: 5, cw: 210, ch: 210 });
}

for (const s of sheets) {
  const page = await browser.newPage({ viewport: { width: s.cols * s.cw, height: 800 } });
  const url = `http://127.0.0.1:${port}/test/leg-probe.html?spec=${encodeURIComponent(JSON.stringify(s))}`;
  await page.goto(url);
  await page.waitForFunction(() => document.title.startsWith('legprobe-ready'));
  await page.waitForTimeout(60);
  await page.screenshot({ path: path.join(OUT, `${s.name}.png`), fullPage: true });
  console.log('rendered', s.name, `(${s.cells.length} cells)`);
  await page.close();
}
await browser.close();
srv.close();
console.log('PNGs →', OUT);
