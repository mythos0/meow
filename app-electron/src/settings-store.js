// settings-store.js — pure settings/economy persistence with injectable backend.

'use strict';

export const DEFAULTS = {
  breed: 'grey_tabby',
  size: 1.0,            // 0.5 .. 2.0
  opacity: 1.0,         // 0.3 .. 1
  sounds: true,
  autoStart: false,
  topmost: true,
  speed: 55,
  coins: 50,
  owned: ['grey_tabby'],  // owned breeds
  reminders: [],          // [{id,label,at,repeat,anim,sound}]
  version: 1,
};

export const BREED_PRICES = {
  grey_tabby: 0, orange_tabby: 100, siamese: 200, calico: 300, persian: 400, tuxedo: 500,
};

export function createSettings(backend) {
  // backend: { read(): string|null, write(str) }
  let data = load(backend);

  function load(b) {
    try {
      const raw = b.read();
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return sanitize(parsed);
    } catch { return structuredClone(DEFAULTS); }
  }

  function sanitize(p) {
    const d = structuredClone(DEFAULTS);
    for (const k of Object.keys(d)) {
      if (!(k in p)) continue;
      if (k === 'owned') {
        if (Array.isArray(p.owned)) d.owned = [...new Set(['grey_tabby', ...p.owned.filter(x => typeof x === 'string')])];
      } else if (k === 'reminders') {
        if (Array.isArray(p.reminders)) d.reminders = p.reminders.filter(r => r && typeof r.at === 'number');
      } else if (typeof d[k] === typeof p[k]) d[k] = p[k];
    }
    if (p.version) d.version = p.version;
    return d;
  }

  function persist() {
    try { backend.write(JSON.stringify(data)); } catch { /* disk full etc — keep running */ }
  }

  return {
    get all() { return structuredClone(data); },
    get(key) { return structuredClone(data[key]); },
    set(key, val) {
      if (!(key in DEFAULTS)) return false;
      data[key] = val;
      persist();
      return true;
    },
    // economy
    addCoins(n) {
      data.coins = Math.max(0, Math.min(999999, (data.coins | 0) + (n | 0)));
      persist();
      return data.coins;
    },
    canAfford(breed) { return (BREED_PRICES[breed] ?? Infinity) <= data.coins; },
    buyBreed(breed) {
      if (!(breed in BREED_PRICES)) return { ok: false, reason: 'unknown' };
      if (data.owned.includes(breed)) return { ok: true, alreadyOwned: true, coins: data.coins };
      const price = BREED_PRICES[breed];
      if (data.coins < price) return { ok: false, reason: 'insufficient', needed: price - data.coins };
      data.coins -= price;
      data.owned.push(breed);
      persist();
      return { ok: true, coins: data.coins };
    },
    ownBreed(breed) { // free grant (e.g. via settings sync)
      if (!data.owned.includes(breed)) { data.owned.push(breed); persist(); }
    },
    export() { return JSON.stringify(data); },
  };
}
