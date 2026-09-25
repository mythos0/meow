// store.test.mjs — settings store + economy tests
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, DEFAULTS, BREED_PRICES } from '../src/settings-store.js';

function memBackend() {
  let raw = null;
  const writes = [];
  return {
    read: () => raw,
    write: s => { raw = s; writes.push(s); },
    get writes() { return writes; },
  };
}

describe('settings-store', () => {
  test('empty backend → defaults', () => {
    const st = createSettings(memBackend());
    assert.equal(st.get('breed'), DEFAULTS.breed);
    assert.equal(st.get('coins'), DEFAULTS.coins);
    // v3.1: unlimited-coins promo grants every item up-front (cats+hats+dresses)
    assert.deepEqual([...st.get('owned')].sort(), [...Object.keys(BREED_PRICES), 'bow', 'crown', 'pumpkin', 'santa', 'flower', 'shades', 'tophat', 'blue', 'midnight', 'pink', 'red'].sort());
    assert.equal(st.get('unlimitedCoins'), true);
  });

  test('set() persists and reloads', () => {
    const be = memBackend();
    const st = createSettings(be);
    st.set('breed', 'smokey_kitten');
    st.set('size', 1.4);
    const st2 = createSettings(be); // re-read same backend
    assert.equal(st2.get('breed'), 'smokey_kitten');
    assert.equal(st2.get('size'), 1.4);
  });

  test('corrupt JSON falls back to defaults', () => {
    const be = { read: () => '{not json!!', write: () => {} };
    const st = createSettings(be);
    assert.equal(st.get('breed'), DEFAULTS.breed);
  });

  test('unknown keys rejected', () => {
    const st = createSettings(memBackend());
    assert.equal(st.set('hax', 'x'), false);
  });

  test('sanitize: bad reminder entries dropped, ownership of default kept', () => {
    const be = memBackend();
    const st = createSettings(be);
    st.set('reminders', [{ label: 'ok', at: 123 }, null, { label: 'no time' }, { at: 'nope' }]);
    const st2 = createSettings(be);
    assert.equal(st2.get('reminders').length, 1);
  });

  test('coins: add clamps to [0, 9999999]', () => {
    const st = createSettings(memBackend());
    st.addCoins(100);
    assert.equal(st.get('coins'), DEFAULTS.coins + 100);
    st.addCoins(-99_999_999);
    assert.equal(st.get('coins'), 0);
    st.addCoins(2_000_000_000);
    assert.equal(st.get('coins'), 9_999_999);
  });

  test('unlimited promo: owned auto-expands on every write (no shrink loophole)', () => {
    const st = createSettings(memBackend());
    // v3.6.1: set() routes through the same sanitization as load() — so a
    // mid-session shrink of `owned` can never dodge the promo auto-grant.
    st.set('owned', ['grey_tabby']);
    assert.ok(st.get('owned').includes('smokey_kitten'), 'promo re-grants all cats');
    assert.ok(st.get('owned').includes('crown'), 'promo re-grants hats too');
    assert.ok(st.get('owned').length >= Object.keys(BREED_PRICES).length);
    const before = st.get('coins');
    const r = st.buyBreed('smokey_kitten');
    assert.equal(r.ok, true);
    assert.equal(r.alreadyOwned, true, 'already granted by the promo invariant');
    assert.equal(st.get('coins'), before, 'nothing deducted during promo');
  });

  test('paid path (unlimitedCoins off): success deducts and owns', () => {
    const be = memBackend();
    be.write(JSON.stringify({ unlimitedCoins: false, coins: 350, owned: ['grey_tabby'] }));
    const st = createSettings(be);
    const r = st.buyBreed('smokey_kitten'); // 120
    assert.equal(r.ok, true);
    assert.equal(st.get('coins'), 350 - 120);
    assert.ok(st.get('owned').includes('smokey_kitten'));
    assert.equal(st.get('owned').length, 2, 'no auto-grant when promo off');
  });

  test('paid path: insufficient coins fails with deficit', () => {
    const be = memBackend();
    be.write(JSON.stringify({ unlimitedCoins: false, coins: 50, owned: ['grey_tabby'] }));
    const st = createSettings(be);
    const r = st.buyBreed('crown'); // 120 > 50
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'insufficient');
    assert.equal(r.needed, 120 - 50);
    assert.equal(st.get('coins'), 50);
  });

  test('paid path: already owned is free', () => {
    const be = memBackend();
    be.write(JSON.stringify({ unlimitedCoins: false, coins: 50, owned: ['grey_tabby'] }));
    const st = createSettings(be);
    const r = st.buyBreed('grey_tabby');
    assert.equal(r.ok, true);
    assert.equal(r.alreadyOwned, true);
    assert.equal(st.get('coins'), 50);
  });

  test('buyBreed: unknown breed rejected', () => {
    const st = createSettings(memBackend());
    assert.equal(st.buyBreed('lion').ok, false);
  });

  test('prices cover all listed breeds', () => {
    for (const b of Object.keys(BREED_PRICES)) assert.equal(typeof BREED_PRICES[b], 'number');
  });
});
