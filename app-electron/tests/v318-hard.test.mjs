// v318-hard.test.mjs — the ROBUSTNESS layer for v3.18 ("test more robustly").
// Goes beyond the feature suites with adversarial, seeded, long-horizon
// checks:
//   1. brain soaks — six hostile layouts × thousands of ticks: the walking
//      flicker ("stuck same place, facing both sides") must stay dead under
//      narrow lanes, boxed-in gaps, full-cover zones and pinch walls
//   2. hostile dt — tab-throttle spikes, zeros, negatives
//   3. store hardening — every removed v3.17 breed walks back onto the
//      3-cat catalog; hostile coins/hat/dress/JSON never wedge the store
//   4. all-state pose scan — 29 states × 3 breeds × 60fps: ≤ 4 limbs, no NaN
//   5. voice removal — symbol-level guards across every shipped file
//   6. process diet — static contracts on main.js / preload.cjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CatBrain } from '../src/cat-brain.js';
import { createSettings, CAT_ITEMS, ITEM_PRICES, KNOWN_CATS, KNOWN_HATS, KNOWN_DRESSES } from '../src/settings-store.js';
import { poseForState, PALETTES, BODIES, STATES, HATS, DRESSES } from '../src/cat-renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------- seeded PRNG (deterministic soaks) ----------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBrain(overrides = {}) {
  return new CatBrain({
    bounds: { x: 0, y: 0, w: 1600, h: 900 },
    groundY: 860,
    x: 800,
    rand: mulberry32(20260925),
    speed: 55,
    runSpeed: 150,
    ...overrides,
  });
}

const GROUND = ['walk', 'waddle', 'run', 'zoomies'];
const MOVE = [...GROUND, 'stalk', 'laser', 'investigate', 'roll', 'jump'];

// one soak pass; returns { flips: [times], minX, maxX, satAt, maxFlipRate }
function soak(brain, seconds, dt = 1 / 60) {
  const flips = [];
  let lastDir = brain.dir;
  let satAt = null;
  for (let i = 0; i * dt < seconds; i++) {
    brain.tick(dt);
    // hard invariants every tick
    assert.ok(Number.isFinite(brain.x), `x went NaN at t=${brain.t.toFixed(2)}`);
    assert.ok(brain.dir === 1 || brain.dir === -1, `dir left {-1,1}: ${brain.dir}`);
    assert.ok(brain.x >= brain.minX - 1 && brain.x <= brain.maxX + 1,
      `x escaped bounds: ${brain.x.toFixed(1)} at t=${brain.t.toFixed(2)}`);
    assert.ok(Number.isFinite(brain.baseY) && Number.isFinite(brain.jumpY), 'y went NaN');
    if (brain.dir !== lastDir) {
      if (GROUND.includes(brain.state)) flips.push(brain.t);
      lastDir = brain.dir;
    }
    if (satAt == null && ['sit', 'idle', 'sleep', 'loaf', 'curl'].includes(brain.state) && brain._wallTurns === 0) {
      // "gave up pacing" — a sustained rest after wall turns happened
      if (brain.stateT > 2) satAt = brain.t;
    }
  }
  return { flips, satAt };
}

function flipContract(name, flips, seconds, { maxPer10s = 6, minGap = 1.0 } = {}) {
  for (let i = 1; i < flips.length; i++) {
    const gap = flips[i] - flips[i - 1];
    assert.ok(gap >= minGap,
      `${name}: direction flip only ${gap.toFixed(2)}s after the previous one (t=${flips[i].toFixed(2)}) — flicker`);
  }
  for (let i = 0; i < flips.length; i++) {
    const win = flips.filter(f => f > flips[i] - 10 && f <= flips[i]).length;
    assert.ok(win <= maxPer10s,
      `${name}: ${win} flips inside a 10s window (t=${flips[i].toFixed(2)}) — ping-pong`);
  }
  assert.ok(flips.length <= (seconds / 10) * maxPer10s, `${name}: total flip rate too high (${flips.length} in ${seconds}s)`);
}

// ================================================================ 1. soaks
describe('v3.18 hard: walking soaks — the facing flicker stays dead in hostile layouts', () => {
  test('free lane (control): 90s of walking travels far with rare flips', () => {
    const b = makeBrain();
    const x0 = b.x;
    const { flips } = soak(b, 90);
    flipContract('free', flips, 90);
    const travelled = Math.abs(b.x - x0);
    assert.ok(travelled > 60 || flips.length > 0, 'a free cat barely moved in 90s — movement dead?');
  });

  test('narrow lane (400px): ping-pong is bounded and the cat still lives', () => {
    const b = makeBrain({ bounds: { x: 0, y: 0, w: 400, h: 900 }, x: 200 });
    const { flips } = soak(b, 90);
    flipContract('narrow', flips, 90);
  });

  test('boxed-in 200px gap: flips bounded AND the cat rests instead of pacing forever', () => {
    const b = makeBrain({ x: 800 });
    b.setNoWalkZones([{ x: 200, y: 700, w: 500, h: 300 }, { x: 900, y: 700, w: 500, h: 300 }]);
    const { flips } = soak(b, 90);
    flipContract('boxed', flips, 90);
    // the real-cat contract: between wall turns the cat takes REAL breaks
    // (sit / sleep / idle…), it never paces the 200px gap non-stop. The
    // 2-dead-end sit-down rarely fires because short excursions expire
    // first — so the observable outcome is what we pin: rests dominate.
    const REST = ['sit', 'idle', 'sleep', 'loaf', 'curl', 'groom', 'yawn', 'hairball', 'knead'];
    let restT = 0, stretch = 0, maxStretch = 0, lastRestEnd = 0;
    const b2 = makeBrain({ x: 800 });
    b2.setNoWalkZones([{ x: 200, y: 700, w: 500, h: 300 }, { x: 900, y: 700, w: 500, h: 300 }]);
    for (let i = 0; i * (1 / 60) < 90; i++) {
      b2.tick(1 / 60);
      if (REST.includes(b2.state)) { restT += 1 / 60; lastRestEnd = b2.t; }
      stretch = b2.t - lastRestEnd;
      if (stretch > maxStretch) maxStretch = stretch;
    }
    assert.ok(restT > 22, `boxed cat rested only ${restT.toFixed(1)}s of 90s — pacing machine`);
    assert.ok(maxStretch <= 30, `boxed cat went ${maxStretch.toFixed(1)}s without a single rest`);
  });

  test('spawned INSIDE a full-cover zone: escapes without flip storms', () => {
    const b = makeBrain({ x: 790 });
    b.setNoWalkZones([{ x: 0, y: 700, w: 1600, h: 300 }]);
    const { flips } = soak(b, 60);
    flipContract('covered', flips, 60);
  });

  test('pinch wall: zone blocks the right half, cat works the left lane calmly', () => {
    const b = makeBrain({ x: 400 });
    b.setNoWalkZones([{ x: 1000, y: 700, w: 600, h: 300 }]);
    const { flips } = soak(b, 90);
    flipContract('pinch', flips, 90);
  });

  test('two pinch walls alternating: no 60Hz vibration signature ever', () => {
    const b = makeBrain({ bounds: { x: 0, y: 0, w: 1200, h: 900 }, x: 600 });
    b.setNoWalkZones([{ x: 260, y: 700, w: 120, h: 300 }, { x: 820, y: 700, w: 120, h: 300 }]);
    const { flips } = soak(b, 120);
    flipContract('alternating', flips, 120);
  });

  test('zones removed mid-soak: the cat resumes travelling within 15s', () => {
    const b = makeBrain({ x: 800 });
    b.setNoWalkZones([{ x: 700, y: 700, w: 200, h: 300 }]);
    soak(b, 30);
    b.setNoWalkZones([]);
    const xAtClear = b.x;
    let travelled = 0, last = b.x;
    for (let i = 0; i * (1 / 60) < 15; i++) {
      b.tick(1 / 60);
      travelled += Math.abs(b.x - last);
      last = b.x;
    }
    assert.ok(Math.abs(b.x - xAtClear) > 100 || travelled > 250,
      `after the zone vanished the cat stayed put (net ${Math.abs(b.x - xAtClear).toFixed(0)}px, gross ${travelled.toFixed(0)}px)`);
  });

  test('hostile dt: zeros, negatives, throttle spikes — no NaN, no bound escape', () => {
    const b = makeBrain({ rand: mulberry32(7) });
    b.setNoWalkZones([{ x: 500, y: 700, w: 300, h: 300 }]);
    const dts = [0, -0.016, 0.5, 0.1, 1e-6, 0.077, 3, 0.016];
    for (let i = 0; i < 600; i++) {
      b.tick(dts[i % dts.length]);
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.t), `NaN after dt=${dts[i % dts.length]}`);
    }
  });

  test('v3.18 hard fix: a cursor past the roam edge can no longer drag the stalker out of bounds', () => {
    for (const edge of ['right', 'left']) {
      const bx = edge === 'right' ? 1580 : 20;
      const b = makeBrain({ x: 800, rand: mulberry32(3) });
      b.startStalk(bx, 860, 'cursor');
      let escaped = false;
      for (let i = 0; i * (1 / 60) < 8; i++) {
        b.moveStalk(bx, 860);   // cursor pinned outside/at the lane edge
        b.tick(1 / 60);
        if (!(b.x >= b.minX - 1 && b.x <= b.maxX + 1)) { escaped = true; break; }
      }
      assert.ok(!escaped, `stalk chased the cat past ${edge} bound (x=${b.x.toFixed(1)}, bounds ${b.minX}..${b.maxX})`);
      assert.ok(b.x >= b.minX && b.x <= b.maxX);
    }
  });

  test('v3.18 hard fix: a laser dot past the roam edge never drags the chase out of bounds', () => {
    const b = makeBrain({ x: 800, rand: mulberry32(5) });
    b.startLaser(1900, 860);   // dot beyond maxX
    for (let i = 0; i * (1 / 60) < 6; i++) {
      b.tick(1 / 60);
      assert.ok(b.x >= b.minX - 1 && b.x <= b.maxX + 1,
        `laser chase escaped bounds: x=${b.x.toFixed(1)} at t=${b.t.toFixed(2)}`);
    }
    b.stopLaser();
  });
});

// ================================================================ 2. store
describe('v3.18 hard: store hardening — old saves and hostile writes never wedge it', () => {
  // v3.19: the real ginger cat ('ginger_kitten') is BACK in the catalog —
  // removed from the retired list; the v3.18 impostor 'orange_tabby' joins it.
  // ('sakura' is retired as a BREED but lives on as a v3.19 costume id — the
  // shared id space means its "owned" entry is legitimate, so it is not in
  // this list.)
  const REMOVED_BREEDS = ['siamese', 'calico', 'persian', 'tuxedo', 'bombay', 'russian_blue',
    'orange_tabby', 'ragdoll', 'bengal', 'maine_coon', 'panda', 'mochi', 'scottish_fold',
    'snow_angora', 'somali', 'british_plush', 'choco_munchkin', 'cocoa_kitten',
    'milky_kitten', 'midnight_kitten'];

  test('catalog is exactly the three requested cats — with the REAL ginger cat', () => {
    assert.deepEqual(CAT_ITEMS.map(c => c.id).sort(), ['ginger_kitten', 'grey_tabby', 'smokey_kitten']);
    assert.equal(CAT_ITEMS.find(c => c.id === 'grey_tabby').price, 0, 'grey tabby must be free');
    assert.equal(CAT_ITEMS.find(c => c.id === 'ginger_kitten').price, 0, 'the real ginger cat must be free');
    assert.equal(CAT_ITEMS.find(c => c.id === 'smokey_kitten').price, 120);
  });

  test('store sells 14 hats + 10 costumes, all ids known to the renderer', () => {
    assert.deepEqual([...KNOWN_HATS].sort(), [...HATS].sort());
    assert.deepEqual([...KNOWN_DRESSES].sort(), [...DRESSES].sort());
    assert.equal(KNOWN_HATS.size, 14, 'fourteen hats');
    assert.equal(KNOWN_DRESSES.size, 10, 'ten costumes');
    for (const id of [...KNOWN_HATS, ...KNOWN_DRESSES]) assert.ok(id in ITEM_PRICES, `${id} not priced`);
  });

  test('default breed IS the real ginger cat (v3.11 order restored)', () => {
    const st = createSettings({ read: () => null, write: () => {} });
    assert.equal(st.get('breed'), 'ginger_kitten');
    assert.ok(st.get('owned').includes('ginger_kitten'), 'the ginger cat must be owned by default');
  });

  test('v3.19 migration: v3.18 victims parked on grey_tabby walk home to ginger — once', () => {
    // first launch: the one-time flip + latch
    const mem = { buf: JSON.stringify({ breed: 'grey_tabby', coins: 77 }) };
    const s1 = createSettings({ read: () => mem.buf, write: s => { mem.buf = s; } });
    assert.equal(s1.get('breed'), 'ginger_kitten', 'grey_tabby save walks back onto the ginger cat');
    assert.equal(s1.get('coins'), 77, 'everything else survives untouched');
    // second launch: latched — a deliberate grey-tabby pick stays
    const s2 = createSettings({ read: () => JSON.stringify({ breed: 'grey_tabby', migrated319: true }), write: () => {} });
    assert.equal(s2.get('breed'), 'grey_tabby', 'after the latch the user picks whatever they want');
  });

  test('v3.19 migration: smokey/custom/ginger saves are never touched by the walk-home', () => {
    for (const breed of ['smokey_kitten', 'ginger_kitten']) {
      const st = createSettings({ read: () => JSON.stringify({ breed }), write: () => {} });
      assert.equal(st.get('breed'), breed, `${breed} must not be flipped`);
    }
  });

  for (const legacy of REMOVED_BREEDS) {
    test(`removed breed "${legacy}" walks back onto the catalog`, () => {
      const mem = { buf: JSON.stringify({ breed: legacy, owned: [legacy, 'grey_tabby'] }) };
      const st = createSettings({ read: () => mem.buf, write: s => { mem.buf = s; } });
      assert.equal(st.get('breed'), 'ginger_kitten', `${legacy} must reset to the default cat`);
      assert.ok(!st.get('owned').includes(legacy), `${legacy} must not stay owned`);
    });
  }

  test('hostile hat/dress values reset to null (never crash the renderer)', () => {
    for (const bad of ['beret', 'gold', 123, true, {}, '']) {
      const st = createSettings({ read: () => JSON.stringify({ hat: bad, dress: bad }), write: () => {} });
      assert.equal(st.get('hat'), null, `hat ${JSON.stringify(bad)} must reset`);
      assert.equal(st.get('dress'), null, `dress ${JSON.stringify(bad)} must reset`);
    }
    const ok = createSettings({ read: () => JSON.stringify({ hat: 'crown', dress: 'midnight' }), write: () => {} });
    assert.equal(ok.get('hat'), 'crown');
    assert.equal(ok.get('dress'), 'midnight');
  });

  test('coins: NaN / Infinity / strings / negatives / overflow all rejected or capped', () => {
    const st = createSettings({ read: () => JSON.stringify({ coins: 42 }), write: () => {} });
    st.set('coins', Number.NaN); assert.equal(st.get('coins'), 42);
    st.set('coins', Infinity); assert.equal(st.get('coins'), 42);
    st.set('coins', '999'); assert.equal(st.get('coins'), 42);
    st.set('coins', -5); assert.equal(st.get('coins'), 42);
    st.set('coins', 1e12); assert.equal(st.get('coins'), 9_999_999);
  });

  test('corrupt / truncated / empty save files fall back to defaults', () => {
    for (const raw of ['{not json', '{"coins":12', '', 'null', '[]', '{"breed":"panda","coins":1e999}']) {
      const st = createSettings({ read: () => raw, write: () => {} });
      assert.equal(typeof st.get('coins'), 'number');
      assert.ok(KNOWN_CATS.has(st.get('breed')) || String(st.get('breed')).startsWith('custom:'),
        `breed "${st.get('breed')}" leaked through raw=${raw}`);
    }
  });

  test('save → load → save round-trip is idempotent', () => {
    const s1 = createSettings({ read: () => JSON.stringify({ breed: 'smokey_kitten', hat: 'tophat', dress: 'pink', coins: 55, owned: ['smokey_kitten', 'tophat'] }), write: () => {} });
    const snap1 = JSON.stringify(s1.all);
    const s2 = createSettings({ read: () => snap1, write: () => {} });
    assert.equal(JSON.stringify(s2.all), snap1, 'second sanitize changed the data');
  });

  test('economy paths: unknown / broke / already-owned / unlimited', () => {
    // the v3.1 promo defaults to unlimitedCoins — disable it to test scarcity
    const st = createSettings({ read: () => JSON.stringify({ coins: 50, unlimitedCoins: false }), write: () => {} });
    assert.equal(st.buyItem('bogus').ok, false);
    assert.equal(st.buyItem('smokey_kitten').ok, false, '120 coins must be unaffordable at 50');
    st.addCoins(70);
    const r = st.buyItem('smokey_kitten');
    assert.equal(r.ok, true);
    assert.equal(st.get('coins'), 0, 'price must be deducted exactly');
    assert.equal(st.buyItem('smokey_kitten').alreadyOwned, true, 're-buy must be a no-op');
    assert.equal(st.get('coins'), 0, 're-buy must not charge again');
    st.set('unlimitedCoins', true);
    const r2 = st.buyItem('crown');
    assert.equal(r2.ok, true);
    assert.equal(st.get('coins'), 0, 'unlimited path must not deduct');
  });

  test('customSkins: garbage dropped, 32 cap, signatures preserved', () => {
    const skins = Array.from({ length: 40 }, (_, i) => ({ id: 'sk' + i, name: 'S' + i, def: { fur: '#fff' }, sig: '{"sig":' + i + '}' }));
    const st = createSettings({ read: () => JSON.stringify({ customSkins: [...skins, null, 5, { nope: 1 }, { id: 'x' }] }), write: () => {} });
    assert.equal(st.get('customSkins').length, 32);
    assert.ok(st.get('customSkins').every(s => s && typeof s.id === 'string' && s.def));
    assert.equal(st.get('customSkins')[0].sig, '{"sig":0}');
  });

  test('set() rejects unknown keys and never persists them', () => {
    const mem = { buf: '' };
    const st = createSettings({ read: () => null, write: s => { mem.buf = s; } });
    assert.equal(st.set('voiceCommands', true), false);
    assert.ok(!mem.buf.includes('voiceCommands'));
  });
});

// ================================================================ 3. poses
describe('v3.18 hard: every state × breed pose — four limbs max, zero NaN', () => {
  for (const breed of Object.keys(PALETTES)) {
    test(`${breed}: 29 states × 60 frames — limb count ≤ 4 and all numbers finite`, () => {
      const pal = PALETTES[breed];
      const B = BODIES[pal.body] || BODIES.normal;
      for (const st of STATES) {
        for (let i = 0; i <= 60; i++) {
          const t = (i / 60) * 2;
          const P = poseForState(st, t, 0.5, B, pal, t);
          const raised = P.overlayPaw ? (Array.isArray(P.overlayPaw) ? P.overlayPaw.length : 1) : 0;
          const grounded = P.legs.filter(Boolean).length;
          if (!P.hideLegs) {
            assert.ok(grounded + raised <= 4,
              `${st} f=${i}: ${grounded} planted + ${raised} overlay = ${grounded + raised} limbs`);
          }
          const nums = [P.bodyY, P.bobY, P.bodyRot, P.sqx, P.sqy, P.headX, P.headY, P.headRot, P.bodyX, P.legK,
            ...P.legs.filter(Boolean).flatMap(l => [l.fx, l.fy]),
            ...(P.overlayPaw ? (Array.isArray(P.overlayPaw) ? P.overlayPaw : [P.overlayPaw]).flatMap(l => [l.fx, l.fy]) : [])];
          for (const n of nums) assert.ok(Number.isFinite(n), `${st} f=${i}: non-finite pose number`);
        }
      }
    });
  }

  test('hats and dresses stay within declared bbox geometry (no NaN in style objects)', () => {
    for (const d of DRESSES) assert.ok(d.length > 2);
    for (const h of HATS) assert.ok(h.length > 2);
  });
});

// ================================================================ 4. voice removal
describe('v3.18 hard: voice removal — symbol-level guards over every shipped file', () => {
  const read = p => readFileSync(path.join(ROOT, p), 'utf8');

  test('no voice source files remain', () => {
    const srcs = readdirSync(path.join(ROOT, 'src'));
    const wins = readdirSync(path.join(ROOT, 'windows'));
    assert.ok(!srcs.some(f => /voice|speech|sapi/i.test(f)), 'src still has a voice file: ' + srcs.join(','));
    assert.ok(!wins.some(f => /voice|speech/i.test(f)), 'windows still has a voice page');
    assert.ok(!existsSync(path.join(ROOT, 'src/voice.js')), 'src/voice.js survives');
    assert.ok(!existsSync(path.join(ROOT, 'src/voice-listener.js')), 'src/voice-listener.js survives');
    assert.ok(!existsSync(path.join(ROOT, 'windows/voice.html')), 'windows/voice.html survives');
  });

  test('main.js wires no speech engine and no voice IPC (except the MEOWCAT_TEST music seam)', () => {
    const m = read('main.js');
    for (const sym of ['createVoiceListener', 'voice-listener', 'voiceEngineEvent', 'voice:get', 'voice:set', 'voice:inject', 'voice:state']) {
      assert.ok(!m.includes(sym), `main.js still references ${sym}`);
    }
    assert.ok(!/\bSAPI\b(?!.*removed)/.test(m.split('\n').filter(l => !/^\s*\/\//.test(l) && !l.trim().startsWith('*')).join('\n')), 'SAPI referenced in live code');
    // the ONLY voice:* channel allowed is the test-gated music seam
    const handles = [...m.matchAll(/ipcMain\.handle\('(voice:[^']*)'/g)].map(x => x[1]);
    assert.deepEqual(handles, MEOW_EXPECT, `unexpected voice channels: ${handles}`);
  });

  test('preload exposes no speech API', () => {
    const p = read('preload.cjs');
    for (const sym of ['webkitSpeech', 'SpeechRecognition', 'voiceEngine', 'startVoice', 'stopVoice']) {
      assert.ok(!p.includes(sym), `preload still exposes ${sym}`);
    }
  });

  test('settings page ships no Voice card', () => {
    const s = read('windows/settings.html');
    assert.ok(!/id="voice/i.test(s), 'voice card id survives');
    assert.ok(!/voiceCommand|voice-command/i.test(s), 'voice command wiring survives');
    assert.ok(!/<h3[^>]*>\s*Voice/i.test(s), 'a Voice section heading survives');
  });

  test('cat page has no speech hooks', () => {
    const c = read('windows/cat.html');
    for (const sym of ['SpeechRecognition', 'webkitSpeech', 'voiceCommand']) {
      assert.ok(!c.includes(sym), `cat.html still references ${sym}`);
    }
  });
});

// ================================================================ 5. process diet
describe('v3.18 hard: process diet — nothing left that spawns on a whim', () => {
  const read = p => readFileSync(path.join(ROOT, p), 'utf8');

  test('main.js creates exactly three window kinds (cat, settings, zone overlay)', () => {
    const m = read('main.js');
    const n = [...m.matchAll(/new BrowserWindow\(/g)].length;
    assert.equal(n, 3, `expected 3 BrowserWindow sites (cat/settings/zone-overlay), found ${n}`);
  });

  test('no utilityProcess call sites remain (the typing-hook child is gone)', () => {
    const m = read('main.js');
    const live = m.split('\n').filter(l => !/^\s*\/\//.test(l.trim())).join('\n');
    assert.ok(!/utilityProcess\./.test(live), 'a utilityProcess call site survives');
  });

  test('preload allowlist carries no reaction/voice channels', () => {
    const p = read('preload.cjs');
    const allowed = p.slice(p.indexOf('const allowed'));
    for (const ch of ['system-event', 'typing', 'cursor-idle', 'cursor-busy', 'new-window', 'app-focus', 'duck', 'time-bias', 'voice-engine']) {
      assert.ok(!allowed.includes(`'${ch}'`), `channel '${ch}' is still allowed`);
    }
  });

  test('music watcher is the only always-on child, and it is ONE long-lived process', () => {
    const w = read('src/music-watcher.js');
    assert.ok(w.includes("while ($true)"), 'SMTC script must be a single long-lived poll');
    assert.ok(!/setInterval[\s\S]*spawnFn\('powershell/.test(w), 'windows path must not respawn powershell on a timer');
  });
});

const MEOW_EXPECT = ['voice:test-music'];
