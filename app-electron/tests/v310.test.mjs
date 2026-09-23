// v310.test.mjs — the "no cat is ever hidden, no process ever stops" release.
//
// Contract (user directive):
//   1. ALL automatic cat-hiding logic is REMOVED — call-app detection
//      (Zoom/Teams/OBS/Discord/...), the sound-duck that rode along with it,
//      and fullscreen auto-hide. Nothing may hide the cat by itself.
//   2. Only an explicit user quit (tray / context menu) may stop the cat's
//      process — this file pins the code-level guarantees (no removed symbols,
//      no removed settings keys, no resurrected sampling paths); the live
//      behavior (window close/crash -> self-heal, app stays alive) is covered
//      by scripts/e2e-robust.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import * as reactions from '../src/system-reactions.js';
import { createSettings, DEFAULTS } from '../src/settings-store.js';
import { createSysMonitor } from '../src/sys-monitor.js';

const REMOVED_SETTINGS = ['hideDuringCalls', 'duckDuringCalls', 'hideInFullscreen'];
const REMOVED_SYMBOLS = ['findCallApp', 'CALL_APP_RE', 'isFullscreenWindow', 'parseProcessList'];

function mkStore(initial = {}) {
  let saved = JSON.stringify(initial);
  return createSettings({ read: () => saved, write: s => { saved = s; } });
}

describe('v3.10 contract: no auto-hide settings exist', () => {
  test('DEFAULTS no longer contain any hide toggle', () => {
    for (const k of REMOVED_SETTINGS) {
      assert.ok(!(k in DEFAULTS), `${k} must be gone from DEFAULTS`);
    }
  });

  test('set() rejects the removed keys (stale callers can no-op them back in)', () => {
    const s = mkStore();
    for (const k of REMOVED_SETTINGS) {
      assert.equal(s.set(k, true), false, `set('${k}') must be rejected`);
    }
  });

  test('settings persisted by an older version are sanitized clean on load', () => {
    const legacy = { breed: 'calico', hideDuringCalls: true, duckDuringCalls: true, hideInFullscreen: true, coins: 42 };
    const s = mkStore(legacy);
    assert.equal(s.get('breed'), 'calico');          // real data survives the upgrade
    assert.equal(s.get('coins'), 42);
    for (const k of REMOVED_SETTINGS) {
      assert.ok(!(k in s.all), `legacy ${k} must not resurface via all()`);
    }
  });
});

describe('v3.10 contract: detection helpers are gone from the codebase', () => {
  test('system-reactions exports no call/fullscreen/process-list logic', () => {
    for (const sym of REMOVED_SYMBOLS) {
      assert.ok(!(sym in reactions), `${sym} must not be exported anymore`);
    }
  });

  test('findEditorApp (window-scan consumer) is untouched', () => {
    assert.equal(typeof reactions.findEditorApp, 'function');
    assert.equal(reactions.findEditorApp(['Code']), 'Code');
  });
});

describe('v3.10 contract: no process-list sampling resurrection', () => {
  test('win32 sampler spawns only the PowerShell stats streamer, never tasklist', async () => {
    const spawned = [];
    const mon = createSysMonitor({
      spawnFn: (cmd, args) => {
        spawned.push({ cmd, args: args.join(' ') });
        const p = new EventEmitter();
        p.stdout = new EventEmitter();
        p.kill = () => p.emit('close', 0);
        return p;
      },
      platform: 'win32',
      intervalMs: 1000,
      onSample: () => {},
    });
    mon.start();
    await new Promise(r => setTimeout(r, 40));
    mon.stop();
    assert.ok(spawned.length >= 1, 'sampler runs');
    for (const s of spawned) {
      assert.equal(s.cmd, 'powershell.exe', `only powershell spawns, saw ${s.cmd}`);
      assert.ok(!/tasklist/i.test(s.args), 'tasklist must never be spawned');
    }
  });

  test('linux sampler spawns nothing at all', async () => {
    let spawned = 0;
    const mon = createSysMonitor({
      spawnFn: () => { spawned++; return { stdout: { on() {} }, on() {}, kill() {} }; },
      platform: 'linux',
      intervalMs: 1000,
      onSample: () => {},
    });
    mon.start();
    await new Promise(r => setTimeout(r, 40));
    mon.stop();
    assert.equal(spawned, 0, 'zero subprocesses on linux');
  });
});

describe('v3.10 contract: sound ducking path is gone from the renderer', () => {
  test('cat.html has no duck handler and no volume multiplier', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'windows', 'cat.html');
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(!html.includes("'duck'"), "no 'duck' IPC listener in the renderer");
    assert.ok(!html.includes('volumeMul'), 'no volumeMul multiplier in the renderer');
    assert.ok(html.includes('cat-visible'), 'user-hide render pause (cat-visible) stays');
  });

  test('settings.html no longer offers the auto-hide toggles', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'windows', 'settings.html');
    const html = fs.readFileSync(file, 'utf8');
    for (const k of REMOVED_SETTINGS) {
      assert.ok(!html.includes(k), `${k} toggle must be gone from the settings UI`);
    }
  });

  test('main.js never references the removed flags', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'main.js');
    const src = fs.readFileSync(file, 'utf8');
    for (const k of [...REMOVED_SETTINGS, 'hiddenByCall', 'hiddenByFullscreen', 'findCallApp', 'isFullscreenWindow']) {
      assert.ok(!src.includes(k), `main.js must not reference ${k}`);
    }
    // and the never-stop guarantees are present
    assert.ok(src.includes("process.on('uncaughtException'"), 'main process crash guard present');
    assert.ok(src.includes('render-process-gone'), 'renderer crash revival present');
    assert.ok(src.includes('createCatWindow(); }, 250'), 'closed-window self-heal present');
  });
});
