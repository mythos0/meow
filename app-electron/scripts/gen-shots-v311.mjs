// gen-shots-v311.mjs — regenerate the README screenshots from the REAL app.
// Boots MeowCat under Xvfb, drives it into specific states, and exports the
// live canvas (with alpha) plus real settings-window captures. Composition
// over a Win11-style wallpaper happens in the Python step that follows.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'shots');
mkdirSync(OUT, { recursive: true });

let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));
}
const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-shots-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9344', '--no-sandbox', '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required'], {
  cwd: ROOT,
  env: { ...process.env, DISPLAY: process.env.DISPLAY, MEOW_WARM_IDLE_MS: '3000',
         XDG_CONFIG_HOME: userData, XDG_CACHE_HOME: userData },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let cdp = false;
for (let i = 0; i < 60 && !cdp; i++) {
  try { cdp = (await fetch('http://127.0.0.1:9344/json/version')).ok; } catch {}
  if (!cdp) await new Promise(r => setTimeout(r, 500));
}
if (!cdp) { console.error('CDP failed'); app.kill('SIGKILL'); xvfb?.kill(); process.exit(1); }
const browser = await chromium.connectOverCDP('http://127.0.0.1:9344');

async function findPage(suffix, tries = 30) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) for (const p of ctx.pages())
      if (p.url().endsWith(suffix)) return p;
    await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

try {
  const cat = await findPage('cat.html');
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // helper: screenshot JUST the cat canvas with transparency (omitBackground)
  async function catPng(name, setup) {
    if (setup) await cat.evaluate(setup);
    await sleep(350);
    const clip = await cat.evaluate(() => {
      const r = window.__region();
      return { x: 0, y: 0, width: Math.min(r.w, 1600), height: r.h };
    });
    await cat.screenshot({ path: path.join(OUT, name), omitBackground: true, clip });
    console.log('shot', name);
  }

  // 1. hero: ginger kitten strolling
  await cat.evaluate(() => {
    const b = window.__brain();
    b.onPlatform = null; b._jump = null;
    b._enter('walk', 12); b.dir = 1;
  });
  await catPng('raw_hero_walk.png');

  // 2. sit pose (portrait-ish)
  await catPng('raw_ginger_sit.png', () => {
    const b = window.__brain(); b.onPlatform = null; b._enter('sit', 30);
  });

  // 3. the kitten litter: ginger + 4 new kittens side by side on one canvas
  await cat.evaluate(() => {
    const b = window.__brain();
    b.onPlatform = null; b._jump = null;
    b._enter('sit', 60); b.dir = 1;
    window.__shotKittens = true;
  });
  // draw the litter via the page's own renderer into a wide offscreen export
  const litterPng = await cat.evaluate(async () => {
    const { drawCat } = await import('../src/cat-renderer.js');
    const breeds = ['ginger_kitten', 'milky_kitten', 'cocoa_kitten', 'smokey_kitten', 'midnight_kitten', 'sakura', 'mochi'];
    const cv = document.createElement('canvas');
    cv.width = 980; cv.height = 260;
    const g = cv.getContext('2d');
    let t = 0.15;
    breeds.forEach((breed, i) => {
      g.save();
      g.translate(90 + i * 135, 215);
      g.scale(0.9, 0.9);
      drawCat(g, { t, state: 'sit', breed, dir: 1, scale: 0.95 });
      g.restore();
    });
    return cv.toDataURL('image/png');
  });
  writeFileSync(path.join(OUT, 'raw_kitten_litter.png'), Buffer.from(litterPng.split(',')[1], 'base64'));
  console.log('shot raw_kitten_litter.png');

  // 4. companion mode
  await cat.evaluate(() => window.meow.setSettings({ companionCat: true }));
  await sleep(900);
  await catPng('raw_companion.png', () => {
    const b = window.__brain(); b.onPlatform = null;
    b._enter('walk', 20); b.dir = 1;
  });
  await cat.evaluate(() => window.meow.setSettings({ companionCat: false }));

  // 5. dance + emote
  await catPng('raw_dance.png', () => {
    const b = window.__brain(); b.onPlatform = null;
    b._enter('dance', 8);
    b.emote = { kind: 'note', t0: b.t };
  });

  // 6. settings: Sounds page (real Fluent UI)
  await cat.evaluate(() => window.meow.openWindow('settings'));
  const settings = await findPage('settings.html');
  await settings.waitForFunction(() => !!document.getElementById('randomMeows'), null, { timeout: 10000 });
  await settings.evaluate(() => document.querySelector('[data-page="sounds"]').click());
  await sleep(400);
  await settings.screenshot({ path: path.join(OUT, 'raw_settings_sounds.png') });
  // 7. Cat Store page (24 breeds incl. the new kittens)
  await settings.evaluate(() => document.querySelector('[data-page="store"]').click());
  await sleep(900);
  await settings.screenshot({ path: path.join(OUT, 'raw_store.png') });
  // 8. Behavior page with the screenshot-style zone button
  await settings.evaluate(() => document.querySelector('[data-page="behavior"]').click());
  await sleep(300);
  await settings.screenshot({ path: path.join(OUT, 'raw_settings_zones.png') });

  // 9. zone selector overlay with a live selection
  await settings.click('#zoneSelect');
  const zone = await findPage('zone-select.html');
  if (zone) {
    await zone.waitForFunction('window.__zoneCfg && window.__zoneCfg().union', null, { timeout: 8000 });
    await sleep(300);
    await zone.evaluate(() => {
      window.__zoneDraw(420, 330, 950, 620);
      // keep the ants marching for the shot
      const fire = (type, x, y) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
      fire('mousedown', 420, 330);
      fire('mousemove', 950, 620);
    });
    await sleep(200);
    await zone.screenshot({ path: path.join(OUT, 'raw_zone_select.png') });
    await zone.evaluate(() => window.meow.cancelZone());
    console.log('shot raw_zone_select.png');
  }

  console.log('ALL SHOTS DONE');
} catch (e) {
  console.error('SHOTS ERROR:', e);
  process.exitCode = 1;
} finally {
  try { app.kill('SIGKILL'); } catch {}
  try { xvfb?.kill(); } catch {}
  try { rmSync(userData, { recursive: true, force: true }); } catch {}
}
