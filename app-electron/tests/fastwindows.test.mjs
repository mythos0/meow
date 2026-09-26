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

  test('close event DESTROYS the window (v3.18 process diet, v3.20 deferred re-close)', async () => {
    const fw = createFastWindows({ factory: { settings: () => fakeWin('settings') } });
    const w = fw.show('settings');
    w.close();                       // user closes the window
    assert.equal(w._destroyed, false, 'the interceptor swallowed the first close request…');
    assert.equal(w.closed >= 1, true, '…and issued a real close');
    assert.equal(fw.isAlive('settings'), false, 'the pool drops the window — one less process');
    await new Promise(r => setTimeout(r, 10));   // v3.20: the re-close is DEFERRED
    assert.ok(w.closed >= 2, 'the deferred follow-up close completes the destroy');
  });

  test('v3.20: close(name) closes ONLY the named window', () => {
    const made = [];
    const fw = createFastWindows({
      factory: {
        settings: () => { const w = fakeWin('settings'); made.push(w); return w; },
      },
    });
    const s = fw.show('settings');
    const r1 = fw.close('settings');
    assert.equal(r1, true, 'an alive pooled window was closed');
    assert.ok(s.closed >= 1, 'settings got its close');
    assert.equal(fw.close('settings'), false, 'closing again finds nothing in the pool');
    assert.equal(fw.close('bogus'), false, 'an unknown name closes NOTHING and does not throw');
    assert.equal(made.length, 1, 'no new window was created by a bogus close');
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

  test('v3.4: an idle hidden window self-destroys after the idle timeout', async () => {
    process.env.MEOW_WARM_IDLE_MS = '60';
    try {
      const fw = createFastWindows({ factory: { settings: () => fakeWin('settings') } });
      const w = fw.show('settings');
      fw.hide('settings');                       // arms the idle destroy (60ms)
      assert.equal(fw.isAlive('settings'), true, 'warm while idle timer pending');
      await new Promise(r => setTimeout(r, 220)); // let the idle timer fire
      assert.equal(fw.isAlive('settings'), false, 'destroyed from the pool after idle');
      assert.ok(w.closed >= 1, 'real close was allowed (not prevented)');
    } finally { delete process.env.MEOW_WARM_IDLE_MS; }
  });

  test('v3.4: showing the window before the idle timeout cancels the destroy', async () => {
    process.env.MEOW_WARM_IDLE_MS = '120';
    try {
      const fw = createFastWindows({ factory: { settings: () => fakeWin('settings') } });
      const w = fw.show('settings');
      fw.hide('settings');
      fw.show('settings');                       // back in use — timer cancelled
      await new Promise(r => setTimeout(r, 260)); // longer than the idle timeout
      assert.equal(fw.isAlive('settings'), true, 'still warm — destroy was cancelled');
      assert.equal(w.closed, 0, 'no real close happened');
    } finally { delete process.env.MEOW_WARM_IDLE_MS; }
  });
});
