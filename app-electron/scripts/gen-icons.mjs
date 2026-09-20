// gen-icons.mjs — v3.1: render the procedural background-less cat face to
// icon-src.png, multi-size icon.ico (16..256), and a small tray.png
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, p === '/' ? 'test/icon.html' : p);
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
await page.waitForTimeout(120);

const cvEl = await page.$('#cv');

// master 256px source
const shot256 = await cvEl.screenshot();
writeFileSync(path.join(ROOT, 'assets', 'icon-src.png'), shot256);

// render each size in-page (crisp re-render at native size, not a downscale hack)
const sizes = [256, 128, 64, 48, 32, 24, 16];
const pngs = {};
for (const s of sizes) {
  const buf = await page.evaluate(size => {
    const face = window.__drawFace;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const g = cv.getContext('2d');
    face(g, size / 256);
    return cv.toDataURL('image/png').split(',')[1];
  }, s);
  pngs[s] = Buffer.from(buf, 'base64');
}
await browser.close();
srv.close();

// app icon png (256) + tray (32 with padding for visibility)
writeFileSync(path.join(ROOT, 'assets', 'icon.png'), pngs[256]);
writeFileSync(path.join(ROOT, 'assets', 'tray.png'), pngs[32]);

// ico pack (PNG-compressed entries are fine for Vista+; include classic sizes)
const ico = await pngToIco(sizes.filter(s => s >= 16).map(s => pngs[s]));
writeFileSync(path.join(ROOT, 'assets', 'icon.ico'), ico);

console.log('icons written:',
  'icon-src.png(256)', 'icon.png(256)', 'tray.png(32)',
  'icon.ico(' + sizes.join(',') + ')');
process.exit(0);
