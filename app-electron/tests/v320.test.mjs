// v320.test.mjs — the "closing the Cat Store must never close the cat" release.
//
//  1. STORE-CLOSE MAJOR BUG — static contracts: the close-window IPC closes
//     ONLY the named window (never closeAll), the fast-windows re-close is
//     deferred off the event tick (win32 re-entrancy), and THREE backstops
//     guarantee the cat window comes back no matter what (ready-to-show
//     fallback timer, 2s cat watchdog, window-all-closed resurrection).
//  2. DRESSES/COSTUMES REMOVED end-to-end — no DRESSES/drawDress symbols in
//     the renderer, no dress grid in the settings page, no dress schema in
//     the store, and a legacy dress save is dropped by sanitize.
//  3. the wardrobe is hats-only: 14 hats, all ids known to the renderer.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSettings, DEFAULTS, ITEM_PRICES, HAT_ITEMS, KNOWN_HATS } from '../src/settings-store.js';
import { HATS } from '../src/cat-renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');
const code = p => read(p).split('\n').filter(l => !/^\s*\/\//.test(l.trim())).join('\n');

describe('v3.20: the Cat Store close can never take the cat down', () => {
  const main = read('main.js');
  const liveMain = main.split('\n').filter(l => !/^\s*\/\//.test(l.trim())).join('\n');

  test('close-window IPC closes ONLY the named window — no closeAll', () => {
    const handler = code('main.js').slice(code('main.js').indexOf("ipcMain.handle('close-window'"));
    const body = handler.slice(0, handler.indexOf('});', handler.indexOf('fastWins.')));
    assert.ok(body.includes('fastWins.close('), 'the handler must call fastWins.close(<name>)');
    assert.ok(!/fastWins\.closeAll\(\)/.test(body), 'the close-window handler still calls closeAll()');
    assert.ok(body.includes("'reminders'"), 'reminders maps onto the settings window');
  });

  test('fast-windows interceptor defers the re-close off the event tick (win32 hardening)', () => {
    const fw = read('src/fast-windows.js');
    const on = fw.slice(fw.indexOf("w.on('close'"));
    const body = on.slice(0, on.indexOf('});', on.indexOf('setTimeout')));
    assert.ok(body.includes('setTimeout('), 'the follow-up close must be deferred');
    assert.ok(body.includes('isDestroyed'), 'the deferred close guards a destroyed window');
    assert.ok(fw.includes('close(name)'), 'a named close() exists alongside closeAll()');
  });

  test('backstop #1: the cat window show-fallback timer exists', () => {
    assert.ok(liveMain.includes("logCrash('cat-show-fallback'"), 'ready-to-show fallback missing');
    const fb = main.slice(main.indexOf('cat-show-fallback'));
    assert.ok(fb.includes('catWin.show()'), 'the fallback really shows the window');
    assert.ok(fb.includes('!hiddenByUser'), 'the fallback respects a user-hidden cat');
  });

  test('backstop #2: window-all-closed resurrects the cat instead of just logging', () => {
    const wac = main.slice(main.indexOf("app.on('window-all-closed'"));
    assert.ok(wac.includes('createCatWindow()'), 'window-all-closed must re-create the cat window');
    assert.ok(wac.includes('if (quitting) app.quit()'), 'an explicit quit still quits');
  });

  test('backstop #3: the 2s cat watchdog sweeps a lost cat window back to life', () => {
    assert.ok(liveMain.includes("'cat-watchdog'"), 'the watchdog must journal its intervention');
    const wd = main.slice(main.indexOf('watchdogTimer = setInterval'));
    assert.ok(wd.includes('if (quitting) return'), 'the watchdog never fights a real quit');
    assert.ok(wd.includes('createCatWindow()'), 'the watchdog re-creates the cat window');
    const down = main.slice(main.indexOf('function onExplicitShutdown'));
    assert.ok(down.includes('clearInterval(watchdogTimer)'), 'the watchdog stops on explicit shutdown');
  });

  test('the cat window resurrection chain is intact', () => {
    const closed = main.slice(main.indexOf("catWin.on('closed'"));
    assert.ok(closed.includes('createCatWindow()'), 'closed → recreate still wired');
    assert.ok(closed.includes('250'), 'resurrection is still fast (250ms)');
  });
});

describe('v3.20: dresses and costumes are gone end-to-end', () => {
  test('renderer: no DRESSES / DRESS_STYLES / drawDress symbols anywhere', () => {
    const r = code('src/cat-renderer.js');
    for (const sym of ['export const DRESSES', 'export const DRESS_STYLES', 'export function drawDress', 'drawDress(']) {
      assert.ok(!r.includes(sym), `${sym} still exists in cat-renderer.js`);
    }
    const cat = code('windows/cat.html');
    for (const sym of ['DRESSES', 'applyDress', 'currentDress', 'opts.dress', 'dress: companion']) {
      assert.ok(!cat.includes(sym), `${sym} still exists in cat.html`);
    }
  });

  test('settings page: no dress grid, no DRESS_ITEMS import', () => {
    const s = code('windows/settings.html');
    for (const sym of ['DRESS_ITEMS', "id=\"dresses\"", 'dressGrid', 'No dress']) {
      assert.ok(!s.includes(sym), `${sym} still exists in settings.html`);
    }
  });

  test('store module: no dress schema, no dress prices, legacy keys dropped', () => {
    const st = code('src/settings-store.js');
    for (const sym of ['DRESS_ITEMS', 'KNOWN_DRESSES', '_dressPrices']) {
      assert.ok(!st.includes(sym), `${sym} still exists in settings-store.js`);
    }
    assert.ok(!('dress' in DEFAULTS), 'dress is not a DEFAULTS key anymore');
    assert.equal(typeof createSettings, 'function');
  });

  test('a legacy save with dress ids sanitizes clean', () => {
    let saved = null;
    const st = createSettings({
      read: () => JSON.stringify({ dress: 'sakura', hat: 'crown', owned: ['sakura', 'rainbow', 'crown'] }),
      write: s => { saved = s; },
    });
    assert.equal(st.get('hat'), 'crown');
    assert.equal('dress' in st.all, false, 'the dress key is gone from the live data');
    assert.ok(!st.get('owned').includes('sakura'), 'owned dress id purged');
    assert.ok(!st.get('owned').includes('rainbow'), 'owned costume id purged');
    st.set('hat', null);
    assert.ok(saved && !saved.includes('sakura'), 'the persisted file never carries dress ids again');
    assert.ok(saved && !saved.includes('"dress"'), 'the persisted file never carries the dress key again');
  });

  test('the wardrobe is hats-only: 14 hats, renderer ids in sync with the store', () => {
    assert.equal(HAT_ITEMS.length, 14);
    assert.equal(HATS.length, 14);
    assert.deepEqual([...KNOWN_HATS].sort(), [...HATS].sort());
    for (const h of HAT_ITEMS) assert.ok(h.id in ITEM_PRICES, `hat ${h.id} not priced`);
  });
});
