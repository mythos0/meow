// window-scan.test.mjs — PowerShell output parsing + platform filtering + scanner
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PS_SCRIPT, parseWindowsJson, toPlatforms, createWindowScanner } from '../src/window-scan.js';

describe('window-scan', () => {
  test('PS script enumerates + filters windows via Win32', () => {
    assert.ok(PS_SCRIPT.includes('EnumWindows'));
    assert.ok(PS_SCRIPT.includes('IsWindowVisible'));
    assert.ok(PS_SCRIPT.includes('IsIconic'));
    assert.ok(PS_SCRIPT.includes('DwmGetWindowAttribute'));   // cloaked UWP windows
    assert.ok(PS_SCRIPT.includes('GetWindowRect'));
    assert.ok(PS_SCRIPT.includes('ConvertTo-Json'));
  });

  test('parseWindowsJson: array payload', () => {
    const raw = JSON.stringify([
      { t: 'Chrome', x: 10, y: 20, w: 800, h: 600 },
      { t: 'Notepad', x: 0, y: 0, w: 400, h: 300 },
    ]);
    const out = parseWindowsJson(raw);
    assert.equal(out.length, 2);
    assert.equal(out[0].title, 'Chrome');
    assert.deepEqual([out[0].x, out[0].y, out[0].w, out[0].h], [10, 20, 800, 600]);
  });

  test('parseWindowsJson: single window comes back as a bare object', () => {
    const raw = JSON.stringify({ t: 'Solo', x: 1, y: 2, w: 300, h: 200 });
    const out = parseWindowsJson(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'Solo');
  });

  test('parseWindowsJson: garbage is rejected safely', () => {
    assert.deepEqual(parseWindowsJson(null), []);
    assert.deepEqual(parseWindowsJson(''), []);
    assert.deepEqual(parseWindowsJson('not json at all'), []);
    assert.deepEqual(parseWindowsJson('{"x": "NaN", "y": 0, "w": 1, "h": 1}'), []);
  });

  test('parseWindowsJson: non-finite / zero sizes dropped', () => {
    const raw = JSON.stringify([
      { t: 'ok', x: 0, y: 0, w: 800, h: 600 },
      { t: 'zerow', x: 0, y: 0, w: 0, h: 600 },
      { t: 'neg', x: 0, y: 0, w: -5, h: 600 },
      { t: 'nofields' },
    ]);
    assert.equal(parseWindowsJson(raw).length, 1);
  });

  test('toPlatforms: filters small, excludes own windows, caps + sorts', () => {
    const wins = [
      { title: 'Visual Studio Code', x: 0, y: 0, w: 1200, h: 800 },
      { title: 'MeowCat Settings', x: 0, y: 0, w: 900, h: 700 },     // own → excluded
      { title: 'tiny', x: 0, y: 0, w: 100, h: 900 },                 // too narrow
      { title: 'short', x: 0, y: 0, w: 900, h: 60 },                 // too short
      { title: 'NVIDIA GeForce Overlay', x: 0, y: 0, w: 900, h: 700 }, // excluded
      { title: 'Documents — Word', x: 0, y: 0, w: 900, h: 700 },
    ];
    const plats = toPlatforms(wins);
    assert.equal(plats.length, 2);
    assert.equal(plats[0].title, 'Visual Studio Code');   // sorted: bigger first
    assert.equal(plats[1].title, 'Documents — Word');
    const capped = toPlatforms(
      Array.from({ length: 40 }, (_, i) => ({ title: 'w' + i, x: 0, y: 0, w: 900, h: 700 })),
      { max: 5 });
    assert.equal(capped.length, 5);
  });

  test('scanner emits platforms only when the result changes', async () => {
    const payloads = [
      JSON.stringify([{ t: 'A', x: 0, y: 0, w: 800, h: 600 }]),
      JSON.stringify([{ t: 'A', x: 0, y: 0, w: 800, h: 600 }]),   // same → no emit
      JSON.stringify([{ t: 'B', x: 5, y: 5, w: 700, h: 500 }]),
    ];
    let call = 0;
    const fakeSpawn = () => ({
      stdout: { on: (ev, cb) => { if (ev === 'data') cb(payloads[Math.min(call, 2)]); } },
      on: (ev, cb) => { if (ev === 'close') setImmediate(cb); },
      kill: () => {},
    });
    const seen = [];
    const s = createWindowScanner({
      spawnFn: fakeSpawn,
      intervalMs: 5,
      onResult: p => seen.push(p),
    });
    await s.scanNow(); call = 1; await s.scanNow(); call = 2; await s.scanNow();
    assert.equal(seen.length, 2, `deduped emits (got ${seen.length})`);
    assert.equal(seen[0][0].title, 'A');
    assert.equal(seen[1][0].title, 'B');
  });

  test('scanner survives a spawn error', async () => {
    const s = createWindowScanner({
      spawnFn: () => { throw new Error('no powershell here'); },
      intervalMs: 5,
      onResult: () => assert.fail('should not emit'),
    });
    await s.scanNow(); // must not throw
  });
});
