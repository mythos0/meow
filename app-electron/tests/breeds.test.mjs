// breeds.test.mjs — v3.1 breed/body integrity: 13 breeds, 6 body types,
// distinct palettes, panda anatomy flags, price coverage.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, BODIES, STATES, EMOTES, CAT_BBOX } from '../src/cat-renderer.js';
import { BREED_PRICES } from '../src/settings-store.js';

const REQUIRED_KEYS = ['fur', 'dark', 'belly', 'nose', 'eye', 'pupil', 'earIn', 'tongue'];

describe('breeds & bodies (v3.1)', () => {
  test('13 breeds exist (6 original + 6 new + panda)', () => {
    const expected = [
      'grey_tabby', 'orange_tabby', 'siamese', 'calico', 'persian', 'tuxedo',
      'bombay', 'russian_blue', 'ginger_kitten', 'ragdoll', 'bengal',
      'maine_coon', 'panda',
    ];
    for (const b of expected) assert.ok(PALETTES[b], `missing breed: ${b}`);
    assert.equal(Object.keys(PALETTES).length, 13);
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
    assert.deepEqual(types.sort(), ['chubby', 'kitten', 'large', 'normal', 'panda', 'slim'].sort());
    for (const [name, B] of Object.entries(BODIES)) {
      assert.ok(B.rx > 20 && B.rx < 60, `${name}.rx out of range`);
      assert.ok(B.standY < -20 && B.standY > -70, `${name}.standY out of range`);
      assert.ok(B.legL1 + B.legL2 > 20, `${name} legs too short`);
      assert.equal(B.feet.length, 4, `${name} needs 4 feet anchors`);
      assert.ok(B.tail.segs >= 4 && B.tail.segs <= 12, `${name} tail segs`);
      // kitten must have the biggest head-to-body ratio
      const ratio = B.headR / B.rx;
      if (name === 'kitten') assert.ok(ratio > 0.75, `kitten head ratio ${ratio.toFixed(2)}`);
    }
    const kitten = BODIES.kitten, large = BODIES.large;
    assert.ok(kitten.headR / kitten.rx > large.headR / large.rx, 'kitten chunkier head than large');
    assert.ok(BODIES.panda.tail.segs < BODIES.normal.tail.segs, 'panda tail is stubby');
  });

  test('panda anatomy: dark limbs, round ears, eye patches, shoulder band', () => {
    const p = PALETTES.panda;
    assert.equal(p.limbCol, p.dark, 'black limbs');
    assert.equal(p.earCol, p.dark, 'black round ears');
    assert.equal(p.roundEars, true);
    assert.equal(p.eyePatch, true);
    assert.equal(p.band, true);
    assert.ok(p.fur !== p.dark, 'white body vs black marks');
    assert.equal(BODIES.panda.tail.segs, 4, 'stubby tail');
  });

  test('all palettes are visually distinct (JSON signatures unique)', () => {
    const sigs = new Set(Object.values(PALETTES).map(p => JSON.stringify(p)));
    assert.equal(sigs.size, 13);
  });

  test('prices cover every breed', () => {
    for (const b of Object.keys(PALETTES)) {
      assert.ok(Number.isFinite(BREED_PRICES[b]), `${b} has no price`);
    }
    assert.ok(BREED_PRICES.panda > BREED_PRICES.grey_tabby);
  });

  test('20 states + 11 emotes are exported for the visual tests', () => {
    assert.equal(STATES.length, 20);
    for (const s of ['stretch', 'groom', 'pounce', 'knead', 'loaf', 'yawn', 'startle', 'waddle', 'bamboo', 'roll']) {
      assert.ok(STATES.includes(s), `missing state ${s}`);
    }
    assert.deepEqual([...EMOTES].sort(),
      ['angry', 'exclaim', 'fish', 'heart', 'laugh', 'love', 'note', 'question', 'sweat', 'star', 'zzz'].sort());
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
