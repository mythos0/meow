// reminder-scheduler.js — pure reminder/timer logic. Injectable clock.

'use strict';

let _id = 1;

export class ReminderScheduler {
  constructor(nowFn = Date.now) {
    this.now = nowFn;
    this.items = new Map();
  }

  // spec: { id?, label, at (epoch ms), repeat: 'once'|'daily'|'hourly'|'weekly', anim }
  add(spec) {
    if (!spec || typeof spec.at !== 'number') throw new TypeError('at (epoch ms) required');
    const id = spec.id || 'r' + (_id++);
    const item = {
      id,
      label: String(spec.label || 'Reminder'),
      at: spec.at,
      repeat: ['once', 'daily', 'hourly', 'weekly'].includes(spec.repeat) ? spec.repeat : 'once',
      anim: spec.anim || 'dance',
      sound: spec.sound !== false,
    };
    this.items.set(id, item);
    return item;
  }

  remove(id) { return this.items.delete(id); }
  list() { return [...this.items.values()].sort((a, b) => a.at - b.at); }
  clear() { this.items.clear(); }
  get size() { return this.items.size; }

  _nextOccurrence(item, fromMs) {
    const step = { daily: 86400000, hourly: 3600000, weekly: 604800000 }[item.repeat];
    if (!step) return null;
    let at = item.at;
    while (at <= fromMs) at += step;
    return at;
  }

  // Returns reminders that are due at now() and reschedules repeating ones.
  // A reminder stays "due" for a grace window (default 60s) so a tick delay still fires it.
  dueReminders(graceMs = 60000) {
    const now = this.now();
    const due = [];
    for (const item of [...this.items.values()]) {
      if (now >= item.at && now <= item.at + graceMs) {
        due.push(item);
        if (item.repeat === 'once') this.items.delete(item.id);
        else {
          const nx = this._nextOccurrence(item, now);
          if (nx) item.at = nx; else this.items.delete(item.id);
        }
      } else if (now > item.at + graceMs) {
        // missed beyond grace: skip forward
        if (item.repeat === 'once') this.items.delete(item.id);
        else {
          const nx = this._nextOccurrence(item, now);
          if (nx) item.at = nx; else this.items.delete(item.id);
        }
      }
    }
    return due;
  }

  msUntilNext() {
    const now = this.now();
    let best = Infinity;
    for (const it of this.items.values()) if (it.at > now) best = Math.min(best, it.at - now);
    return best === Infinity ? null : best;
  }
}
