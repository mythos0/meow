// v321.test.mjs — the "the store still killed the cat + winter jackets" release.
//
//  1. STORE-CLOSE BUG, ROUND TWO ("still cat store closing, quits the cat"):
//     the v3.20 JS-level backstops cannot stop the ONE death class that
//     survives them — a native crash of the in-process GPU/compositor thread.
//     v3.21 removes --in-process-gpu (GPU work back in its own process: a
//     crash there is survivable + auto-respawned), makes the cat window
//     UNCLOSEABLE outside an explicit quit, and teaches the 2s watchdog to
//     re-SHOW an invisible-but-alive cat window.
//  2. WINTER JACKETS return to the Cat Store at the user's request — six
//     procedural coats wired end-to-end (store economy, sanitize, renderer,
//     cat.html, settings page, companion) with the same hard gates as hats.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createSettings, DEFAULTS, ITEM_PRICES, JACKET_ITEMS, KNOWN_JACKETS,
  HAT_ITEMS, CAT_ITEMS,
} from '../src/settings-store.js';
import { JACKETS, JACKET_STYLES, validateSkinDef } from '../src/cat-renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');
const code = p => read(p).split('\n').filter(l => !/^\s*\/\//.test(l.trim())).join('\n');

describe('v3.21: the store close can still never take the cat down', () => {
  const main = read('main.js');
  const liveMain = main.split('\n').filter(l => !/^\s*\/\//.test(l.trim())).join('\n');

  test('LAYER 1: --in-process-gpu is GONE (a GPU-thread crash must not be fatal)', () => {
    assert.ok(!liveMain.includes("appendSwitch('in-process-gpu')"),
      'in-process-gpu still present — a compositor crash inside main kills the whole app');
    assert.ok(liveMain.includes('disableHardwareAcceleration'),
      'software rendering stays (the point is crash isolation, not GPU features)');
    assert.ok(liveMain.includes("'child-process-gone'"),
      'a GPU-process crash is at least journaled via child-process-gone');
  });

  test('LAYER 2: the cat window is UNCLOSEABLE outside an explicit quit', () => {
    const mk = main.slice(main.indexOf('function makeCatWindow'));
    const guard = mk.slice(mk.indexOf("catWin.on('close'"));
    assert.ok(guard.includes('e.preventDefault()'), 'the close guard must preventDefault');
    assert.ok(guard.includes('if (!quitting)'), 'an explicit user Quit still closes the window');
    assert.ok(guard.includes("logCrash('cat-close-blocked'"), 'blocked closes are journaled');
    // the revival path must keep working: destroy() bypasses 'close'
    const revive = mk.slice(mk.indexOf("'render-process-gone'"));
    assert.ok(revive.includes('catWin?.destroy()'), 'render-process-gone revival still uses destroy()');
  });

  test('LAYER 3: the watchdog also re-SHOWS an invisible-but-alive cat window', () => {
    const wd = main.slice(main.indexOf('watchdogTimer = setInterval'));
    const end = wd.indexOf('\n  }, 2000);');
    const body = wd.slice(0, end);
    assert.ok(body.includes('isVisible'), 'the watchdog must sweep visibility, not just existence');
    assert.ok(body.includes('catWin.show()'), 'an invisible cat window is re-shown');
    assert.ok(body.includes('!hiddenByUser'), 'a user-hidden cat is respected');
    assert.ok(body.includes("'cat-watchdog-show'"), 'the re-show is journaled');
    assert.ok(body.includes('createCatWindow()'), 'a destroyed cat window is still re-created');
  });

  test('LAYER 3b: the renderer window.close() bypass is sealed (no close event fires!)', () => {
    // live-proven in v3.21 dev: a renderer-initiated window.close() destroys
    // the window WITHOUT the BrowserWindow 'close' event — only a main-world
    // patch of window.close() can stop it.
    const patchAt = main.indexOf("did-finish-load'");
    assert.ok(patchAt > -1, 'the main-world window.close patch hook is missing');
    const patch = main.slice(patchAt, patchAt + 900);
    assert.ok(patch.includes('window.close = () =>'), 'window.close must be replaced in the page main world');
    assert.ok(patch.includes('rendererCloseDenied'), 'denied closes must report to main');
    assert.ok(code('preload.cjs').includes('rendererCloseDenied'), 'the preload bridge exposes rendererCloseDenied');
    assert.ok(liveMain.includes("'renderer-close-denied'"), 'main journals the denied close attempt');
    assert.ok(liveMain.includes("'cat-close-blocked'"), 'the attempt is journaled as cat-close-blocked');
  });

  test('the v3.20 backstops are all still in place (no regression)', () => {
    assert.ok(liveMain.includes("logCrash('cat-show-fallback'"), 'ready-to-show fallback missing');
    const wac = main.slice(main.indexOf("app.on('window-all-closed'"));
    assert.ok(wac.includes('createCatWindow()'), 'window-all-closed resurrect missing');
    const handler = code('main.js').slice(code('main.js').indexOf("ipcMain.handle('close-window'"));
    assert.ok(!/fastWins\.closeAll\(\)/.test(handler.slice(0, handler.indexOf('});'))),
      'close-window IPC regressed to closeAll()');
  });
});

describe('v3.21: winter jackets end-to-end', () => {
  test('six jackets, all priced, ids in sync with the renderer', () => {
    assert.equal(JACKET_ITEMS.length, 6);
    assert.equal(JACKETS.length, 6);
    assert.deepEqual([...KNOWN_JACKETS].sort(), [...JACKETS].sort(), 'store ids must match renderer ids');
    for (const j of JACKET_ITEMS) {
      assert.ok(j.id in ITEM_PRICES, `jacket ${j.id} not priced`);
      assert.ok(Number.isFinite(j.price) && j.price > 0, `jacket ${j.id} price must be positive`);
    }
    // every jacket has a distinct style + palette
    const styles = new Set(JACKET_ITEMS.map(j => JACKET_STYLES[j.id]?.style));
    assert.equal(styles.size, 6, 'the six jackets must be visually distinct styles');
    for (const j of JACKET_ITEMS) {
      const s = JACKET_STYLES[j.id];
      assert.ok(s && /^#[0-9a-f]{6}$/i.test(s.base) && /^#[0-9a-f]{6}$/i.test(s.dark) && /^#[0-9a-f]{6}$/i.test(s.trim),
        `jacket ${j.id} palette malformed`);
    }
  });

  test('jacket is a nullable DEFAULTS key; buying follows the shared economy', () => {
    assert.ok('jacket' in DEFAULTS && DEFAULTS.jacket === null);
    let saved = null;
    const st = createSettings({
      read: () => JSON.stringify({ coins: 500, unlimitedCoins: false }),   // exercise the PAID path
      write: s => { saved = s; },
    });
    const r = st.buyItem('santa_coat');
    assert.equal(r.ok, true, 'a 500-coin purse buys the 100-coin santa coat');
    assert.equal(st.get('coins'), 400);
    assert.ok(st.get('owned').includes('santa_coat'));
    const again = st.buyItem('santa_coat');
    assert.ok(again.alreadyOwned, 're-buying is idempotent and free');
    assert.equal(st.get('coins'), 400);
    const broke = st.buyItem('parka');
    assert.equal(broke.ok, true, 'parka (90) fits in the 400-coin purse');
    assert.equal(st.get('coins'), 310);
    assert.ok(saved.includes('santa_coat'), 'the purchase persists');
    // unknown ids can never enter the catalog through buy
    assert.equal(st.buyItem('tuxedo_dress').ok, false);
    assert.equal(st.buyItem('tuxedo_dress').reason, 'unknown');
  });

  test('sanitize: unknown/legacy jacket ids drop to null, owned ids purge', () => {
    let saved = null;
    const st = createSettings({
      read: () => JSON.stringify({ jacket: 'legacy_dress_x', owned: ['legacy_dress_x', 'puffer', 'sakura'] }),
      write: s => { saved = s; },
    });
    assert.equal(st.get('jacket'), null, 'an unknown jacket id must reset to null');
    assert.ok(st.get('owned').includes('puffer'), 'a REAL jacket id survives the owned filter');
    assert.ok(!st.get('owned').includes('legacy_dress_x'), 'unknown ids purge from owned');
    assert.ok(!st.get('owned').includes('sakura'), 'legacy dress ids stay purged');
    // set() rejects garbage the same way
    st.set('jacket', 'not_a_jacket');
    assert.equal(st.get('jacket'), null, 'set(jacket, garbage) sanitizes to null');
    st.set('jacket', 'puffer');
    assert.equal(st.get('jacket'), 'puffer', 'a known jacket id equips');
    st.set('jacket', null);
    assert.equal(st.get('jacket'), null, 'unequip works');
    assert.ok(saved && !saved.includes('legacy_dress_x'), 'the persisted file stays clean');
  });

  test('renderer: drawCat gates on JACKETS — unknown ids paint nothing', () => {
    const r = code('src/cat-renderer.js');
    assert.ok(r.includes('JACKETS.includes(opts.jacket)'), 'drawCat must hard-gate the jacket id');
    assert.ok(r.includes('export function drawJacket'), 'drawJacket exists');
    assert.ok(r.includes('export const JACKET_STYLES'), 'JACKET_STYLES exists');
    // unknown jacket validation surfaces in community skins too
    assert.equal(validateSkinDef({ name: 'A', base: 'grey_tabby', jacket: 'puffer' }), null);
    assert.equal(validateSkinDef({ name: 'A', base: 'grey_tabby', jacket: 'legacy_dress_x' }), 'unknown jacket');
  });

  test('cat.html: jacket flows settings → paint → companion', () => {
    const cat = code('windows/cat.html');
    assert.ok(cat.includes('currentJacket'), 'cat.html tracks the current jacket');
    assert.ok(cat.includes('JACKETS.includes(S.jacket)'), 'the store pick is validated against the renderer list');
    assert.ok(cat.includes('jacket: currentJacket'), 'paint opts carry the jacket');
    assert.ok(cat.includes('jacket: companion.jacket'), 'the companion wears the jacket too');
    assert.ok(cat.includes('kv.jacket !== undefined'), 'settings sync reacts to jacket changes');
    assert.ok(cat.includes('window.__jacket'), 'e2e hook present');
  });

  test('settings page: the Winter Jackets grid exists and imports JACKET_ITEMS', () => {
    const s = code('windows/settings.html');
    assert.ok(s.includes('JACKET_ITEMS'), 'the store page imports the jacket catalog');
    assert.ok(s.includes("id=\"jackets\""), 'the jackets grid exists');
    assert.ok(s.includes('Winter Jackets'), 'the section is labeled');
    assert.ok(s.includes('No jacket'), 'a no-jacket card exists');
    assert.ok(s.includes("jacket: on ? null : j.id"), 'picking toggles equip/unequip');
    // dresses stay gone (no resurrection of the removed feature)
    assert.ok(!s.includes('DRESS_ITEMS'), 'no dress catalog import');
  });
});
