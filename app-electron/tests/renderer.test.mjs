// renderer.test.mjs — visual regression via Playwright + pixel analysis.
// v3.2: covers all 20 states, all 20 breeds, and all 11 emotes.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STATES, PALETTES, EMOTES } from '../src/cat-renderer.js';

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

  // ---- every state renders a plausible cat ----
  for (const st of STATES) {
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
      // feet must be near the bottom area (ground) — loaf/roll/sit tuck but never fly
      assert.ok(y1 > 170, `${st}: feet at y=${y1}, expected near bottom`);
    });
  }

  // ---- every state animates (two timestamps differ) ----
  for (const st of STATES.filter(s => !['idle', 'loaf'].includes(s))) {
    test(`state "${st}" is animated (frames differ)`, async () => {
      const page = await browser.newPage();
      const grab = async t => {
        await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=${st}&t=${t}`);
        await page.waitForFunction('window.__ready === true');
        return page.evaluate(() => {
          const cv = document.getElementById('cv');
          return cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.join(',');
        });
      };
      const a = await grab(0);
      const b = await grab(0.35);
      await page.close();
      assert.notEqual(a, b, `${st}: frames identical — animation dead`);
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

  // ---- all 20 breeds render distinctly ----
  test('all breeds render distinctly', async () => {
    const page = await browser.newPage();
    const sig = {};
    for (const br of Object.keys(PALETTES)) {
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
    assert.equal(uniq.size, Object.keys(PALETTES).length,
      `breeds should be visually distinct, got ${uniq.size}/${Object.keys(PALETTES).length}`);
  });

  // ---- every store cat keeps feet on the ground while walking ----
  for (const [breed, pal] of Object.entries(PALETTES)) {
    const body = pal.body || 'normal';
    test(`body "${body}" (${breed}) walks with feet near the ground`, async () => {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=walk&t=0.15&breed=${breed}`);
      await page.waitForFunction('window.__ready === true');
      const s = await canvasStats(page);
      await page.close();
      const [, , , y1] = s.bbox;
      assert.ok(y1 > 195, `${body}: feet at y=${y1}, expected planted near the ground`);
    });
  }

  // ---- v3.20: dresses are GONE — a legacy dress id must paint NOTHING ----
  // (the renderer keeps silently ignoring opts.dress so old links/requests
  // never render a garment again)
  const barePx = async (q) => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/test/harness.html?${q}`);
    await page.waitForFunction('window.__ready === true');
    const data = await page.evaluate(() => {
      const cv = document.getElementById('cv');
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const bbox = [cv.width, cv.height, 0, 0];
      const px = [];
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (d[i + 3] > 40) { px.push(d[i], d[i + 1], d[i + 2]); if (x < bbox[0]) bbox[0] = x; if (x > bbox[2]) bbox[2] = x; if (y < bbox[1]) bbox[1] = y; if (y > bbox[3]) bbox[3] = y; }
      }
      return { bbox, px };
    });
    await page.close();
    return data;
  };
  test('legacy dress ids paint NOTHING (v3.20 dresses removed)', async () => {
    const bare = await barePx('state=sit&t=0.2&bg=alpha');
    const dressed = await barePx('state=sit&t=0.2&bg=alpha&dress=red');
    assert.equal(bare.px.length, dressed.px.length, 'same silhouette (no garment pixels)');
    let changed = 0;
    for (let i = 0; i < Math.min(bare.px.length, dressed.px.length); i += 3) {
      if (Math.abs(bare.px[i] - dressed.px[i]) > 24 ||
          Math.abs(bare.px[i + 1] - dressed.px[i + 1]) > 24 ||
          Math.abs(bare.px[i + 2] - dressed.px[i + 2]) > 24) changed++;
    }
    assert.equal(changed, 0, `dress "red" must be ignored (${changed}px changed)`);
  });

  // ---- v3.18 store hats: each hat paints a visible footprint on the head ----
  for (const hat of ['tophat', 'crown', 'bow']) {
    test(`hat "${hat}" paints the head region`, async () => {
      const bare = await barePx('state=sit&t=0.2&bg=alpha');
      const hatted = await barePx(`state=sit&t=0.2&bg=alpha&hat=${hat}`);
      let changed = 0, minChangedY = 1e9;
      const span = bare.bbox[3] - bare.bbox[1];
      for (let i = 0; i < Math.min(bare.px.length, hatted.px.length); i += 3) {
        const px = i / 3, x = px % 360, y = Math.floor(px / 360);
        if (Math.abs(bare.px[i] - hatted.px[i]) > 24 ||
            Math.abs(bare.px[i + 1] - hatted.px[i + 1]) > 24 ||
            Math.abs(bare.px[i + 2] - hatted.px[i + 2]) > 24) {
          changed++;
          if (y < minChangedY) minChangedY = y;
        }
      }
      assert.ok(changed > 250, `hat "${hat}" should paint a visible shape (${changed}px changed)`);
      assert.ok(minChangedY <= bare.bbox[1] + span * 0.45,
        `hat "${hat}" must sit in the head region (top of change y=${minChangedY} vs body top ${bare.bbox[1]})`);
    });
  }

  // ---- every emote renders above the cat ----
  for (const em of EMOTES) {
    test(`emote "${em}" renders visibly`, async () => {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=sit&t=0.15&emote=${em}&emoteT=0.5`);
      await page.waitForFunction('window.__ready === true');
      const s = await canvasStats(page);
      await page.close();
      const [x0, y0] = s.bbox;
      assert.ok(s.frac > 0.02, `${em}: nothing rendered`);
      assert.ok(y0 < 130, `${em}: emote should appear in the upper area (top y=${y0})`);
    });
  }

  test('emote pops in and fades out (life-cycle)', async () => {
    const page = await browser.newPage();
    const grab = async emoteT => {
      await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=sit&t=0.15&emote=heart&emoteT=${emoteT}`);
      await page.waitForFunction('window.__ready === true');
      return canvasStats(page);
    };
    const mid = await grab(0.5);
    const dead = await grab(2.5);   // past life=2.0 → nothing above the cat
    await page.close();
    assert.ok(mid.bbox[1] < 100, 'emote visible mid-life (top=' + mid.bbox[1] + ')');
    assert.ok(dead.bbox[1] >= 100, 'emote gone after life expiry (top=' + dead.bbox[1] + ', ear tips ~112)');
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
    assert.ok(Math.abs(mR - left.bbox[0]) < 8 && Math.abs(MR - left.bbox[2]) < 8,
      `mirror mismatch: R ${right.bbox} vs L ${left.bbox}`);
  });
});
