// scheduler.test.mjs — ReminderScheduler unit tests
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ReminderScheduler } from '../src/reminder-scheduler.js';

function fixedClock(startMs) {
  let now = startMs;
  return {
    now: () => now,
    advance: ms => { now += ms; },
  };
}

describe('ReminderScheduler', () => {
  test('fires a one-shot reminder inside the grace window', () => {
    const c = fixedClock(1_000_000);
    const s = new ReminderScheduler(c.now);
    s.add({ label: 'tea', at: 1_000_000 + 5_000, anim: 'wave' });
    c.advance(4_000);
    assert.equal(s.dueReminders().length, 0);
    c.advance(2_000); // now 7s past add → 2s after due
    const due = s.dueReminders();
    assert.equal(due.length, 1);
    assert.equal(due[0].label, 'tea');
    assert.equal(due[0].anim, 'wave');
    assert.equal(s.size, 0, 'one-shot removed after firing');
  });

  test('does not fire before due time', () => {
    const c = fixedClock(0);
    const s = new ReminderScheduler(c.now);
    s.add({ label: 'x', at: 60_000 });
    c.advance(59_999);
    assert.equal(s.dueReminders().length, 0);
  });

  test('missed one-shot beyond grace is dropped silently', () => {
    const c = fixedClock(0);
    const s = new ReminderScheduler(c.now);
    s.add({ label: 'x', at: 10_000 });
    c.advance(10_000 + 120_000);
    assert.equal(s.dueReminders().length, 0);
    assert.equal(s.size, 0);
  });

  test('daily repeat reschedules to next day after firing', () => {
    const c = fixedClock(0);
    const s = new ReminderScheduler(c.now);
    const DAY = 86_400_000;
    s.add({ label: 'standup', at: 1_000, repeat: 'daily' });
    c.advance(1_500);
    const due = s.dueReminders();
    assert.equal(due.length, 1);
    const item = s.list()[0];
    assert.equal(item.at, 1_000 + DAY, 'next occurrence tomorrow');
    c.advance(DAY + 1_000);
    assert.equal(s.dueReminders().length, 1);
    assert.equal(s.list()[0].at, 1_000 + 2 * DAY);
  });

  test('hourly and weekly repeats reschedule correctly', () => {
    const c = fixedClock(0);
    const s = new ReminderScheduler(c.now);
    s.add({ id: 'h', label: 'h', at: 1_000, repeat: 'hourly' });
    s.add({ id: 'w', label: 'w', at: 1_000, repeat: 'weekly' });
    c.advance(2_000);
    s.dueReminders();
    assert.equal(s.list().find(i => i.id === 'h').at, 1_000 + 3_600_000);
    assert.equal(s.list().find(i => i.id === 'w').at, 1_000 + 604_800_000);
  });

  test('remove() and clear() work', () => {
    const s = new ReminderScheduler(() => 0);
    const it = s.add({ label: 'a', at: 100 });
    assert.equal(s.remove(it.id), true);
    assert.equal(s.remove(it.id), false);
    s.add({ label: 'b', at: 200 });
    s.clear();
    assert.equal(s.size, 0);
  });

  test('msUntilNext returns time to soonest future reminder', () => {
    const c = fixedClock(0);
    const s = new ReminderScheduler(c.now);
    s.add({ label: 'soon', at: 10_000 });
    s.add({ label: 'later', at: 50_000 });
    assert.equal(s.msUntilNext(), 10_000);
    c.advance(10_000);
    assert.equal(s.msUntilNext(), 40_000);
  });

  test('invalid spec rejected', () => {
    const s = new ReminderScheduler(() => 0);
    assert.throws(() => s.add({ label: 'no time' }));
    const it = s.add({ label: 'bad repeat', at: 100, repeat: 'monthly' });
    assert.equal(it.repeat, 'once');
  });

  test('list sorted by time', () => {
    const s = new ReminderScheduler(() => 0);
    s.add({ label: 'b', at: 200 });
    s.add({ label: 'a', at: 100 });
    assert.deepEqual(s.list().map(i => i.label), ['a', 'b']);
  });
});
