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
  coins: 999999,        // v3.1: promo — effectively unlimited coins
  unlimitedCoins: true, // v3.1: every breed unlocks free while true
  owned: ['grey_tabby'],  // owned breeds (auto-granted to ALL while unlimitedCoins)
  reminders: [],          // [{id,label,at,repeat,anim,sound}]
  version: 1,
};

export const BREED_PRICES = {
  grey_tabby: 0, orange_tabby: 100, siamese: 200, calico: 300, persian: 400, tuxedo: 500,
  bombay: 150, russian_blue: 250, ginger_kitten: 300, ragdoll: 450, bengal: 550,
  maine_coon: 650, panda: 1000,
  mochi: 350, scottish_fold: 400, snow_angora: 500, somali: 450,
  british_plush: 380, choco_munchkin: 420, sakura: 300,
};

export function createSettings(backend) {
  // backend: { read(): string|null, write(str) }
  let data = load(backend);

  function load(b) {
    try {
      const raw = b.read();
      if (!raw) return sanitize({});
      const parsed = JSON.parse(raw);
      return sanitize(parsed);
    } catch { return sanitize({}); }
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
    // v3.1 promo: unlimited coins -> everything unlocked
    if (d.unlimitedCoins) d.owned = Object.keys(BREED_PRICES);
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
      data.coins = Math.max(0, Math.min(9999999, (data.coins | 0) + (n | 0)));
      persist();
      return data.coins;
    },
    canAfford(breed) {
      if (data.unlimitedCoins) return true;
      return (BREED_PRICES[breed] ?? Infinity) <= data.coins;
    },
    buyBreed(breed) {
      if (!(breed in BREED_PRICES)) return { ok: false, reason: 'unknown' };
      if (data.owned.includes(breed)) return { ok: true, alreadyOwned: true, coins: data.coins };
      // v3.1 promo: unlimited coins -> free unlock, nothing deducted
      if (data.unlimitedCoins) {
        data.owned.push(breed);
        persist();
        return { ok: true, free: true, coins: data.coins };
      }
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
