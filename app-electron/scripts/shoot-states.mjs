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

// individual states for detail — v3.1 set (new actions + panda + new breeds)
const shots = [
  ['walk', 0.0, 'grey_tabby', 1], ['walk', 0.35, 'grey_tabby', 1],
  ['run', 0.2, 'ginger_kitten', 1], ['sit', 0.1, 'siamese', 1],
  ['sleep', 0.2, 'persian', 1], ['dance', 0.13, 'calico', 1],
  ['scratch', 0.08, 'tuxedo', 1], ['jump', 0.5, 'grey_tabby', 1],
  ['happy', 0.1, 'ginger_kitten', 1],
  // v3.2 eat: bite / chew / swallow phases
  ['eat', 0.35, 'grey_tabby', 1], ['eat', 0.9, 'grey_tabby', 1], ['eat', 1.3, 'grey_tabby', 1],
  ['eat', 1.75, 'grey_tabby', 1], ['eat', 3.1, 'grey_tabby', 1], ['eat', 4.5, 'grey_tabby', 1],
  // v3.1 new actions
  ['stretch', 0.6, 'grey_tabby', 1], ['groom', 0.5, 'russian_blue', 1],
  ['pounce', 0.2, 'bengal', 1], ['pounce', 0.75, 'bengal', 1],
  ['knead', 0.3, 'ragdoll', 1], ['loaf', 0.3, 'bombay', 1],
  ['yawn', 0.6, 'ginger_kitten', 1], ['startle', 0.2, 'tuxedo', 1],
  // panda: research-backed gaits + phases
  ['waddle', 0.3, 'panda', 1], ['waddle', 0.9, 'panda', 1],
  ['bamboo', 0.3, 'panda', 1], ['bamboo', 0.8, 'panda', 1],
  ['bamboo', 1.2, 'panda', 1], ['bamboo', 1.45, 'panda', 1],
  ['roll', 0.45, 'panda', 1], ['sit', 0.1, 'panda', 1], ['sleep', 0.2, 'panda', 1],
  // v3.2 new breeds (design verification)
  ['sit', 0.1, 'mochi', 1], ['walk', 0.15, 'mochi', 1],
  ['sit', 0.1, 'scottish_fold', 1], ['sit', 0.1, 'snow_angora', 1],
  ['walk', 0.15, 'somali', 1], ['sit', 0.1, 'british_plush', 1],
  ['walk', 0.15, 'choco_munchkin', 1], ['sit', 0.1, 'sakura', 1],
  // original v3.1 breeds walking
  ['walk', 0.15, 'bombay', 1], ['walk', 0.15, 'russian_blue', 1],
  ['walk', 0.15, 'ginger_kitten', 1], ['walk', 0.15, 'ragdoll', 1],
  ['walk', 0.15, 'bengal', 1], ['walk', 0.15, 'maine_coon', 1],
  ['walk', 0.15, 'panda', 1],
  // flipped
  ['walk', 0.0, 'grey_tabby', -1],
];
for (const [st, t, breed, dir] of shots) {
  const u = `${url}?state=${st}&t=${t}&breed=${breed}&dir=${dir}`;
  await page.goto(u);
  await page.waitForFunction('window.__ready === true');
  await page.locator('#cv').screenshot({ path: path.join(outDir, `${st}_${breed}_d${dir}_t${t}.png`) });
}

// emote strip
for (const em of ['heart', 'love', 'note', 'question', 'exclaim', 'sweat', 'angry', 'laugh', 'star', 'zzz', 'fish']) {
  const u = `${url}?state=sit&t=0.15&emote=${em}&emoteT=0.5`;
  await page.goto(u);
  await page.waitForFunction('window.__ready === true');
  await page.locator('#cv').screenshot({ path: path.join(outDir, `emote_${em}.png`) });
}

await browser.close();
server.close();
process.exit(0);
