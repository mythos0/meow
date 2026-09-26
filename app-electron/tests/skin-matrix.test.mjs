// skin-matrix.test.mjs — v3.18/3.19 ROBUST skin coverage, v3.20 hats-only:
// every purchasable combination is rendered and pixel-verified, mirrored AND
// facing right, in every state, with pairwise-distinct accessories. The probe
// page (test/matrix.html) renders 3 breeds × (base + 14 hats) × 2 directions
// plus every state with a full hat vs plain — ONE page load — and diffs each
// cell against its base in-page.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PALETTES, HATS, STATES } from '../src/cat-renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'skin-matrix');
mkdirSync(OUT, { recursive: true });
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

const breeds = Object.keys(PALETTES);

describe('skin matrix: every breed × accessory × direction (robust)', () => {
  let srv, port, browser, report;
  before(async () => {
    ({ srv, port } = await startServer());
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(`http://127.0.0.1:${port}/test/matrix.html`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
    report = await page.evaluate(() => window.__report);
    // contact sheets for the eyeball pass
    for (const [id, name] of [['mx', 'accessories.png'], ['sx', 'states.png']]) {
      const cv = await page.$(`#${id}`);
      await cv.screenshot({ path: path.join(OUT, name) });
    }
    await page.close();
  });
  after(async () => { await browser?.close(); srv?.close(); });

  test('probe rendered every combo without an exception', () => {
    assert.equal(report.errors.length, 0, 'draw errors: ' + report.errors.join('; '));
  });

  // ---- every (breed, dir) block ----
  for (const dir of [1, -1]) {
    const D = dir > 0 ? 'R' : 'L';
    for (const breed of breeds) {
      const key = `${D}:${breed}`;

      test(`${key}: plain cat renders fully inside its cell`, () => {
        const b = report.cells[key].base;
        assert.ok(b.opaque > 4000, `base too small: ${b.opaque}px`);
        assert.ok(b.minY > 0, 'cat must not clip the cell top');
        assert.ok(b.minX > 0 && b.maxX < 199, 'cat must not bleed across cells');
      });

      for (const hat of HATS) {
        test(`${key} + ${hat} hat paints the head and stays visible`, () => {
          const b = report.cells[key].base;
          const a = report.cells[key].accs[hat];
          assert.ok(a.opaque > 4000, `cat vanished under ${hat}: ${a.opaque}px`);
          assert.ok(a.diff > 150, `${hat}: barely repaints anything (${a.diff}px)`);
          if (hat === 'shades') {
            // shades ride the FACE — measured empirically at ~0.50-0.57H
            // (below the tall-hat band on every breed)
            assert.ok(a.faceDiff > 40, `${hat}: no face-region change (${a.faceDiff}px)`);
          } else {
            assert.ok(a.topDiff > 60, `${hat}: no head-region change (${a.topDiff}px)`);
            assert.ok(a.minY <= b.minY, `${hat} must sit on top of the head (minY ${a.minY} vs base ${b.minY})`);
          }
        });
      }

      test(`${key}: all ${HATS.length} hats are pairwise distinct`, () => {
        for (let i = 0; i < HATS.length; i++) {
          for (let j = i + 1; j < HATS.length; j++) {
            const d = report.pairs[`${key}:${HATS[i]}|${HATS[j]}`];
            assert.ok(d > 30, `${HATS[i]} vs ${HATS[j]} look identical (${d}px diff)`);
          }
        }
      });
    }
  }

  // ---- full loadout in EVERY state ----
  for (const breed of breeds) {
    for (const st of STATES) {
      test(`${breed} in "${st}" renders with hat+Dress and they still paint`, () => {
        const s = report.states[breed][st];
        assert.ok(s.opaquePlain > 800, `${st}: plain cat too small (${s.opaquePlain}px)`);
        assert.ok(s.opaqueDressed > 800, `${st}: dressed cat too small (${s.opaqueDressed}px)`);
        assert.ok(s.diff > 80, `${st}: accessories painted nothing (${s.diff}px)`);
      });
    }
  }

  // ---- bogus accessory guard (unknown ids must be ignored, not crash) ----
  test('unknown hat/dress ids are rejected without breaking the render', async () => {
    const page = await browser.newPage();
    const grab = async q => {
      await page.goto(`http://127.0.0.1:${port}/test/harness.html?state=stand&t=0.15&bg=alpha&${q}`);
      await page.waitForFunction('window.__ready === true');
      return page.evaluate(() => {
        const cv = document.getElementById('cv');
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
        return n;
      });
    };
    const plain = await grab('');
    const bogusHat = await grab('hat=bogus');
    const bogusDress = await grab('dress=bogus');
    const bogusBoth = await grab('hat=bogus&dress=bogus');
    await page.close();
    assert.ok(plain > 4000, 'plain render too small');
    assert.equal(bogusHat, plain, 'bogus hat must not paint anything');
    assert.equal(bogusDress, plain, 'bogus dress must not paint anything');
    assert.equal(bogusBoth, plain, 'bogus pair must not paint anything');
  });
});
