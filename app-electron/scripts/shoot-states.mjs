// shoot-states.mjs — Playwright: capture the contact sheet + individual states
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || '/tmp/catshots';

// tiny static server (ES modules blocked on file:// by CORS)
import http from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
mkdirSync(outDir, { recursive: true });
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, p === '/' ? 'test/harness.html' : p);
  if (!existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  res.end(readFileSync(fp));
});
await new Promise(r => server.listen(8123, r));
const BASE = 'http://localhost:8123/test/harness.html';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });

// contact sheet
const url = BASE;
await page.goto(url + '?sheet=1');
await page.waitForFunction('window.__ready === true');
await page.waitForTimeout(150);
await page.locator('#grid').screenshot({ path: path.join(outDir, 'sheet.png') });

// individual states for detail
const shots = [
  ['walk', 0.0, 'grey_tabby', 1],
  ['walk', 0.35, 'grey_tabby', 1],
  ['run', 0.2, 'orange_tabby', 1],
  ['sit', 0.1, 'siamese', 1],
  ['sleep', 0.2, 'persian', 1],
  ['dance', 0.13, 'calico', 1],
  ['scratch', 0.08, 'tuxedo', 1],
  ['jump', 0.5, 'grey_tabby', 1],
  ['happy', 0.1, 'orange_tabby', 1],
  ['eat', 0.2, 'grey_tabby', 1],
  ['walk', 0.0, 'grey_tabby', -1], // flipped
];
for (const [st, t, breed, dir] of shots) {
  const u = `${url}?state=${st}&t=${t}&breed=${breed}&dir=${dir}`;
  await page.goto(u);
  await page.waitForFunction('window.__ready === true');
  await page.locator('#cv').screenshot({ path: path.join(outDir, `${st}_${breed}_d${dir}_t${t}.png`) });
}
await browser.close();
server.close();
process.exit(0);
