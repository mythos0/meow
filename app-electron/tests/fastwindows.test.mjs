// fastwindows.test.mjs — warm window pool: instant open, hide-on-close
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createFastWindows } from '../src/fast-windows.js';

function fakeWin(name) {
  const w = {
    name,
    shown: 0, hidden: 0, focused: 0, closed: 0,
    _destroyed: false,
    listeners: {},
    isDestroyed() { return w._destroyed; },
    show() { w.shown++; },
    hide() { w.hidden++; },
    focus() { w.focused++; },
    close() { w.closed++; w.listeners.close?.forEach(cb => cb({ preventDefault() {} })); },
    on(ev, cb) { (w.listeners[ev] = w.listeners[ev] || []).push(cb); },
  };
  return w;
}

describe('fast-windows pool', () => {
  test('show() creates once; second show() reuses the same window', () => {
    let created = 0;
    const fw = createFastWindows({
      factory: { settings: () => { created++; return fakeWin('settings'); } },
    });
    const a = fw.show('settings');
    const b = fw.show('settings');
    assert.equal(created, 1, 'window created exactly once');
    assert.equal(a, b);
    assert.equal(a.shown, 2);
    assert.equal(a.focused, 2);
  });

  test('warm() pre-creates hidden windows so show() is instant', () => {
    let created = 0;
    const fw = createFastWindows({
      factory: { settings: () => { created++; return fakeWin('settings'); } },
    });
    fw.warm('settings');
    assert.equal(created, 1);
    const t0 = process.hrtime.bigint();
    fw.show('settings');
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.equal(created, 1, 'show() did NOT recreate — instant open');
    assert.ok(ms < 25, `show() after warm took ${ms.toFixed(2)}ms`);
  });

  test('close event hides instead of destroying (pool stays warm)', () => {
    const fw = createFastWindows({ factory: { settings: () => fakeWin('settings') } });
    const w = fw.show('settings');
    w.close();                       // user closes the window
    assert.equal(w._destroyed, false, 'not destroyed');
    assert.ok(w.hidden >= 1, 'hidden instead');
    assert.equal(fw.isAlive('settings'), true);
  });

  test('hide(name) hides an alive window and ignores destroyed ones', () => {
    const fw = createFastWindows({ factory: { settings: () => fakeWin('settings') } });
    const w = fw.show('settings');
    fw.hide('settings');
    assert.ok(w.hidden >= 1);
    w._destroyed = true;
    fw.hide('settings');             // must not throw
    assert.equal(fw.isAlive('settings'), false);
  });

  test('closeAll() allows real close (quitting)', () => {
    const fw = createFastWindows({ factory: { settings: () => fakeWin('settings') } });
    const w = fw.show('settings');
    fw.closeAll();
    assert.ok(w.closed >= 1);
  });

  test('destroyed windows are recreated on demand', () => {
    let created = 0;
    const fw = createFastWindows({
      factory: { settings: () => { created++; return fakeWin('settings'); } },
    });
    const w = fw.show('settings');
    w._destroyed = true;
    fw.show('settings');
    assert.equal(created, 2, 'recreated after destruction');
  });

  test('unknown window name throws a clear error', () => {
    const fw = createFastWindows({ factory: {} });
    assert.throws(() => fw.show('nope'), /no factory/);
  });
});
