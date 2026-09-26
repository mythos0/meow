// breeds.test.mjs — v3.19 store catalog: THREE cats (grey tabby, the REAL
// ginger cat, smokey kitten), body-type integrity, distinct palettes, prices.
// v3.19 REGRESSION GUARD: the ginger cat must stay the REAL one (the v3.11
// default ginger_kitten — kitten body, big head, warm #f0b268 coat), never
// again the renamed orange_tabby impostor v3.18 shipped.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, BODIES, STATES, EMOTES, CAT_BBOX, emoteAnchor, DRESSES, HATS } from '../src/cat-renderer.js';
import { BREED_PRICES } from '../src/settings-store.js';

const REQUIRED_KEYS = ['fur', 'dark', 'belly', 'nose', 'eye', 'pupil', 'earIn', 'tongue'];

describe('breeds & bodies (v3.2)', () => {
  test('exactly THREE store cats exist (grey tabby, ginger cat, smokey kitten)', () => {
    const expected = ['grey_tabby', 'ginger_kitten', 'smokey_kitten'];
    for (const b of expected) assert.ok(PALETTES[b], `missing breed: ${b}`);
    assert.deepEqual(Object.keys(PALETTES).sort(), [...expected].sort(),
      'the removed breeds must stay removed (user directive)');
  });

  test('v3.19 regression guard: the ginger cat is the REAL ginger kitten', () => {
    const g = PALETTES.ginger_kitten;
    // identity checks — the v3.11 default cat, byte-for-byte from v3.17.0
    assert.equal(g.body, 'kitten', 'the real ginger cat is a KITTEN (big head, short legs)');
    assert.equal(g.fur, '#f0b268');
    assert.equal(g.dark, '#cf8b42');
    assert.equal(g.belly, '#fae8cd');
    assert.equal(g.stripe, '#b06226');
    assert.equal(g.earIn, '#e2a79b');
    assert.equal(g.nose, '#d07f6e');
    assert.equal(g.eye, '#93bb4e');
    assert.equal(g.pupil, '#241a10');
    assert.equal(g.tongue, '#d98a94');
    // the impostor must never come back under any name
    assert.ok(!PALETTES.orange_tabby, 'the v3.18 impostor orange_tabby must stay deleted');
  });

  test('every palette is complete and references a valid body type', () => {
    for (const [name, pal] of Object.entries(PALETTES)) {
      for (const k of REQUIRED_KEYS) {
        assert.ok(typeof pal[k] === 'string' && pal[k][0] === '#', `${name}.${k} must be a hex color`);
      }
      const body = pal.body || 'normal';
      assert.ok(BODIES[body], `${name} references unknown body "${body}"`);
    }
  });

  test('body types cover distinct silhouettes with sane geometry', () => {
    const types = Object.keys(BODIES);
    assert.deepEqual(types.sort(), ['chibi', 'chubby', 'kitten', 'large', 'munchkin', 'normal', 'panda', 'slim'].sort());
    for (const [name, B] of Object.entries(BODIES)) {
      assert.ok(B.rx > 20 && B.rx < 60, `${name}.rx out of range`);
      assert.ok(B.standY < -20 && B.standY > -70, `${name}.standY out of range`);
      assert.ok(B.legL1 + B.legL2 > 20, `${name} legs too short`);
      assert.equal(B.feet.length, 4, `${name} needs 4 feet anchors`);
      assert.ok(B.tail.segs >= 4 && B.tail.segs <= 12, `${name} tail segs`);
      // chibi must have the biggest head-to-body ratio (plush-toy look)
      const ratio = B.headR / B.rx;
      if (name === 'chibi') assert.ok(ratio > 0.85, `chibi head ratio ${ratio.toFixed(2)}`);
      if (name === 'kitten') assert.ok(ratio > 0.75, `kitten head ratio ${ratio.toFixed(2)}`);
    }
    const chibi = BODIES.chibi, kitten = BODIES.kitten, large = BODIES.large;
    assert.ok(chibi.headR / chibi.rx > kitten.headR / kitten.rx, 'chibi chunkier head than kitten');
    assert.ok(kitten.headR / kitten.rx > large.headR / large.rx, 'kitten chunkier head than large');
    assert.ok(BODIES.panda.tail.segs < BODIES.normal.tail.segs, 'panda tail is stubby');
    assert.ok(BODIES.munchkin.legL1 + BODIES.munchkin.legL2 < BODIES.normal.legL1 + BODIES.normal.legL2, 'munchkin legs shortest');
  });

  test('store hats and dresses exist for the Cat Store', () => {
    for (const h of ['pumpkin', 'santa', 'flower', 'shades', 'tophat', 'crown', 'bow']) {
      assert.ok(HATS.includes(h), `missing hat ${h}`);
    }
    // v3.19: seven new hats + six new costumes
    for (const h of ['witch', 'party', 'chef', 'cowboy', 'beanie', 'halo', 'horns']) {
      assert.ok(HATS.includes(h), `missing v3.19 hat ${h}`);
    }
    assert.equal(HATS.length, 14, 'fourteen hats total');
    assert.deepEqual([...DRESSES].sort(),
      ['berry', 'blue', 'hero', 'midnight', 'pink', 'pirate', 'rainbow', 'red', 'sakura', 'sunshine']);
  });

  test('emote anchors hug every head (no more far-away icons)', () => {
    for (const [breed, pal] of Object.entries(PALETTES)) {
      const B = BODIES[pal.body || 'normal'];
      const headTop = B.standY + B.head[1] - B.headR;
      const a = emoteAnchor(breed);
      assert.ok(a.y < headTop && a.y > headTop - 40,
        `${breed}: anchor ${a.y.toFixed(0)} should sit just above head top ${headTop.toFixed(0)}`);
    }
  });

  test('all palettes are visually distinct (JSON signatures unique)', () => {
    const sigs = new Set(Object.values(PALETTES).map(p => JSON.stringify(p)));
    assert.equal(sigs.size, 3);
  });

  test('prices cover every breed', () => {
    for (const b of Object.keys(PALETTES)) {
      assert.ok(Number.isFinite(BREED_PRICES[b]), `${b} has no price`);
    }
    assert.ok(BREED_PRICES.smokey_kitten > BREED_PRICES.grey_tabby, 'the unlockable kitten costs coins');
    assert.equal(BREED_PRICES.grey_tabby, 0, 'the default cat is free');
    assert.equal(BREED_PRICES.ginger_kitten, 0, 'the ginger cat is free');
  });

  test('31 states + 16 emotes are exported for the visual tests', () => {
    assert.equal(STATES.length, 31);
    for (const s of ['stretch', 'groom', 'pounce', 'knead', 'loaf', 'yawn', 'startle', 'waddle', 'bamboo', 'roll']) {
      assert.ok(STATES.includes(s), `missing state ${s}`);
    }
    // v3.5 funny pack
    for (const s of ['sneeze', 'hairball', 'zoomies', 'laser']) {
      assert.ok(STATES.includes(s), `missing v3.5 state ${s}`);
    }
    // v3.6 living-on-your-machine pack
    for (const s of ['stalk', 'bop', 'mope', 'nuzzle', 'investigate', 'sniff', 'curl']) {
      assert.ok(STATES.includes(s), `missing v3.6 state ${s}`);
    }
    assert.deepEqual([...EMOTES].sort(),
      ['angry', 'exclaim', 'fish', 'heart', 'laugh', 'love', 'note', 'question', 'sweat', 'star', 'zzz', 'bread',
       'sad', 'battery', 'rainbow', 'cookie'].sort());
  });

  test('hit-test bbox covers the biggest body + emote area', () => {
    for (const B of Object.values(BODIES)) {
      const right = B.feet[1] + B.footAmp * 2 + 20;
      assert.ok(CAT_BBOX.x <= -B.rx - 20, 'bbox covers rear');
      assert.ok(CAT_BBOX.w >= right - CAT_BBOX.x, `bbox covers front of ${B.rx}`);
      assert.ok(CAT_BBOX.y <= -(B.standY * -1 + B.headR * 2 + 40), 'bbox covers raised paws/emotes');
    }
  });
});
