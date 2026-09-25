import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
const ROOT = '/home/z/my-project/meow/app-electron';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
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
const page = await browser.newPage({ viewport: { width: 500, height: 400 } });
await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=salute&t=0.5&st=0.9&scale=2.4`);
await page.waitForFunction(() => document.title.startsWith('single-ready'));
await page.screenshot({ path: '/home/z/my-project/meow/artifacts/dance-probe/salute-zoom.png' });
await browser.close(); srv.close();
console.log('done');
