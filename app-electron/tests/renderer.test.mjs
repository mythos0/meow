// renderer.test.mjs — visual regression via Playwright + pixel analysis (pure logic part)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

function startServer() {
  return new Promise(res => {
    const srv = http.createServer((req, rq) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const fp = path.join(ROOT, p === '/' ? 'test/harness.html' : p);
      if (!existsSync(fp)) { rq.writeHead(404); rq.end(); return; }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      rq.end(readFileSync(fp));
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

// extract canvas pixel stats in-page (cat pixels = anything not the checker bg)
async function canvasStats(page) {
  return page.evaluate(() => {
    const cv = document.getElementById('cv');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const isBg = (r, gr, b) =>
      (Math.abs(r - 0xec) < 10 && Math.abs(gr - 0xef) < 10 && Math.abs(b - 0xf4) < 10) ||
      (Math.abs(r - 0xe0) < 10 && Math.abs(gr - 0xe4) < 10 && Math.abs(b - 0xec) < 10);
    let opaque = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (d[i + 3] > 40 && !isBg(d[i], d[i + 1], d[i + 2])) {
          opaque++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return { opaque, frac: opaque / (cv.width * cv.height), bbox: [minX, minY, maxX, maxY] };
  });
}

describe('cat-renderer visual', () => {
  let srv, port, browser;
  before(async () => {
    ({ srv, port } = await startServer());
    browser = await chromium.launch();
  });
  after(async () => { await browser?.close(); srv?.close(); });

  const states = ['walk', 'run', 'idle', 'sit', 'sleep', 'dance', 'scratch', 'jump', 'happy', 'eat'];

  for (const st of states) {
    test(`state "${st}" renders a visible cat`, async () => {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=${st}&t=0.2`);
      await page.waitForFunction('window.__ready === true');
      const s = await canvasStats(page);
      await page.close();
      assert.ok(s.frac > 0.02, `${st}: cat too small (${(s.frac * 100).toFixed(1)}% opaque)`);
      assert.ok(s.frac < 0.9, `${st}: canvas nearly full — suspicious`);
      const [x0, y0, x1, y1] = s.bbox;
      assert.ok(x1 > x0 && y1 > y0, `${st}: has bbox`);
      // feet must be near bottom area (ground)
      assert.ok(y1 > 170, `${st}: feet at y=${y1}, expected near bottom`);
    });
  }

  test('two walk frames differ (animation is alive)', async () => {
    const page = await browser.newPage();
    const grab = async t => {
      await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=walk&t=${t}`);
      await page.waitForFunction('window.__ready === true');
      return page.evaluate(() => {
        const cv = document.getElementById('cv');
        return cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.join(',');
      });
    };
    const a = await grab(0);
    const b = await grab(0.35);
    await page.close();
    assert.notEqual(a, b, 'frames identical — animation dead');
  });

  test('all breeds render distinctly', async () => {
    const page = await browser.newPage();
    const sig = {};
    for (const br of ['grey_tabby', 'orange_tabby', 'siamese', 'calico', 'persian', 'tuxedo']) {
      await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=walk&t=0.15&breed=${br}`);
      await page.waitForFunction('window.__ready === true');
      sig[br] = await page.evaluate(() => {
        const cv = document.getElementById('cv');
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let h = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 40) h = (h * 31 + d[i] * 7 + d[i + 1] * 13 + d[i + 2] * 3) | 0; }
        return h;
      });
    }
    await page.close();
    const uniq = new Set(Object.values(sig));
    assert.equal(uniq.size, 6, `breeds should be visually distinct, got ${uniq.size}/6`);
  });

  test('flipped cat mirrors correctly', async () => {
    const page = await browser.newPage();
    const grab = async dir => {
      await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=walk&t=0.2&dir=${dir}`);
      await page.waitForFunction('window.__ready === true');
      return canvasStats(page);
    };
    const right = await grab(1);
    const left = await grab(-1);
    await page.close();
    // mirrored bbox x should be mirrored around center 180
    const mR = 360 - right.bbox[2], MR = 360 - right.bbox[0];
    assert.ok(Math.abs(mR - left.bbox[0]) < 8 && Math.abs(MR - left.bbox[1 + 1]) < 8,
      `mirror mismatch: R ${right.bbox} vs L ${left.bbox}`);
  });
});
