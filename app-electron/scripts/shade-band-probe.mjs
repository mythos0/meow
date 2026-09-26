// shade-band-probe.mjs — where do the shades actually paint? (row histogram
// of base-vs-shades diff per breed) — calibrates the matrix test's bands.
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((req, rq) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, p === '/' ? 'test/harness.html' : p);
  if (!existsSync(fp)) { rq.writeHead(404); rq.end(); return; }
  rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  rq.end(readFileSync(fp));
});
await new Promise(res => srv.listen(0, '127.0.0.1', () => res(srv.address().port)));
const port = srv.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
const grab = async q => {
  await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=stand&t=0.15&bg=alpha&${q}`);
  await page.waitForFunction('window.__ready === true');
  return page.evaluate(() => {
    const cv = document.getElementById('cv');
    return cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  });
};
for (const breed of ['grey_tabby', 'ginger_kitten', 'smokey_kitten']) {
  const base = await grab(`breed=${breed}`);
  const sh = await grab(`breed=${breed}&hat=shades`);
  const rows = [];
  for (let y = 0; y < 260; y++) {
    let n = 0;
    for (let x = 0; x < 360; x++) {
      const i = (y * 360 + x) * 4;
      if (Math.abs(base[i] - sh[i]) > 8 || Math.abs(base[i + 1] - sh[i + 1]) > 8 || Math.abs(base[i + 2] - sh[i + 2]) > 8) n++;
    }
    if (n > 0) rows.push(y + ':' + n);
  }
  console.log(breed.padEnd(15), 'diff rows:', rows.join(' '));
}
await browser.close();
srv.close();
