import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
const ROOT = '/home/z/my-project/meow/app-electron';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((req, rq) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, p === '/' ? '/test/harness.html' : p);
  if (!existsSync(fp)) { rq.writeHead(404); rq.end(); return; }
  rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  rq.end(readFileSync(fp));
});
await new Promise(res => srv.listen(0, '127.0.0.1', () => res()));
const port = srv.address().port;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/test/matrix.html`);
await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
const r = await page.evaluate(() => window.__report);
console.log('errors:', r.errors);
for (const k of Object.keys(r.cells)) console.log(k, JSON.stringify(r.cells[k].base));
await browser.close(); srv.close();
