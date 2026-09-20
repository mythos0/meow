// gen-icons.mjs — render the procedural cat to icon PNGs (tray + app icon source)
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, p === '/' ? 'test/harness.html' : p);
  if (!existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  res.end(readFileSync(fp));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
await page.goto(`http://127.0.0.1:${port}/test/icon.html`);
await page.waitForFunction('window.__ready === true');
await page.waitForTimeout(100);
const shot = await page.locator('#cv').screenshot();
writeFileSync(path.join(ROOT, 'assets', 'icon-src.png'), shot);
await browser.close();
srv.close();
process.exit(0);
