// topmost.test.mjs — enforcer re-asserts always-on-top over time and on events
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { createTopmostEnforcer } from '../src/topmost.js';

function fakeWindow() {
  const w = new EventEmitter();
  w.calls = [];
  w.setAlwaysOnTop = (on, level) => w.calls.push({ on, level });
  return w;
}

describe('topmost enforcer', () => {
  test('enforces immediately on start and re-asserts on interval', async () => {
    const w = fakeWindow();
    const e = createTopmostEnforcer(w, { intervalMs: 20 });
    e.start();
    assert.ok(e.enforceCount >= 1);
    await new Promise(r => setTimeout(r, 70));
    e.stop();
    assert.ok(e.enforceCount >= 3, `expected several enforcements, got ${e.enforceCount}`);
    assert.deepEqual(w.calls.at(-1), { on: true, level: 'screen-saver' });
    assert.equal(e.running, false);
  });

  test('enforces on show/restore/focus events', () => {
    const w = fakeWindow();
    const e = createTopmostEnforcer(w, { intervalMs: 60000 });
    e.start();
    const n0 = e.enforceCount;
    w.emit('show'); w.emit('restore'); w.emit('focus');
    assert.equal(e.enforceCount, n0 + 3);
    e.stop();
  });

  test('start is idempotent', () => {
    const w = fakeWindow();
    const e = createTopmostEnforcer(w, { intervalMs: 60000 });
    e.start(); e.start();
    assert.equal(e.running, true);
    e.stop();
    assert.equal(e.running, false);
  });

  test('survives window without .on (defensive)', () => {
    const w = { setAlwaysOnTop() {} };
    const e = createTopmostEnforcer(w, { intervalMs: 60000 });
    assert.doesNotThrow(() => e.start());
    e.stop();
  });
});
