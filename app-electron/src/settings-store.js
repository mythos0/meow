// settings-store.js — pure settings/economy persistence with injectable backend.

'use strict';

export const DEFAULTS = {
  breed: 'ginger_kitten',   // v3.19: the REAL ginger cat is back AND is the default
                            // again (v3.11 'the default cat IS the ginger kitten') —
                            // v3.18's impostor ('orange_tabby' renamed) is gone
  size: 1.0,            // 0.5 .. 2.0
  opacity: 1.0,         // 0.3 .. 1
  sounds: true,
  soundClickMeow: true,    // v3.12: the quick-tap natural single meow
  soundDblClickMeow: true, // v3.12: the double-click classic meow
  soundReminders: true,    // v3.12: the reminder chime
  randomMeows: true,    // v3.11: ambient meows — a natural single meow at random
                        // times, occasionally a burst of several in a row
  autoStart: false,
  topmost: true,
  windowHopping: true,  // v3.4: scan open windows so the cat can hop on them
  speed: 55,
  coins: 999999,        // v3.1: promo — effectively unlimited coins
  unlimitedCoins: true, // v3.1: every breed unlocks free while true
  owned: ['grey_tabby', 'ginger_kitten'],  // the two free cats (auto-granted to ALL while unlimitedCoins)
  reminders: [],          // [{id,label,at,repeat,anim,sound}]
  version: 1,
  migrated319: false,       // v3.19 one-time ginger-restoration latch (see sanitize)

  // ---- v3.6 feature pack — every feature ships with an on/off toggle ----
  // v3.17: ALL system-reaction flags (reactSystemSpikes / reactLowBattery /
  // timeOfDayMood / reactNewWindows / reactMusic / reactApps / reactTyping /
  // stalkCursor / reactBuildStatus / statusFile) were REMOVED at the user's
  // request, together with the Reactions settings page. sanitize() drops
  // them from old persisted files automatically.
  // v3.18: voiceCommands removed — the whole voice feature is gone.
  // v3.10: hideDuringCalls / duckDuringCalls / hideInFullscreen were REMOVED —
  // the cat never hides on its own; only the user may hide or quit it.
  // interaction & progression
  affectionSystem: true,     // pets build an affection meter that unlocks perks
  companionCat: false,       // a second cat: nuzzle, play-fight, rival stalking
  photoMode: true,           // hotkey freezes the pose & saves a transparent PNG
  // sound design
  contextualSounds: true,    // glass paw-taps on window edges, jump squeaks
  // dev extras
  pomodoro: true,            // focus-timer companion + celebration dance
  dancePartyIdle: true,      // long idle -> mini dance party (screensaver mode)
  // customization & community
  seasonalSkins: false,      // pumpkin hat in October, santa hat in December...
  hat: null,                 // the store hat the user equipped (id from HATS)
  jacket: null,              // v3.21: the store winter jacket the user equipped (id from JACKETS)
                             // v3.20: the store `dress` setting is GONE — old saves
                             // carrying `dress` are dropped by sanitize automatically
                             // (not in DEFAULTS → never copied back).
  achievements: true,        // unlockables tied to interaction
  communitySkins: true,      // allow importing JSON skins (Cat Store)
  // quality-of-life
  globalHotkeys: true,       // Ctrl+Alt+C summon/hide, Ctrl+Alt+P photo
  noWalkZones: true,         // respect the no-walk zone list below
  noWalkZoneList: [],        // [{x,y,w,h}] workArea-relative rects the cat avoids
  // progression data (not toggles)
  stats: { pets: 0, jumps: 0, fish: 0, lasers: 0, nuzzles: 0, reminders: 0, pomodoroLate: 0, butterflies: 0 },
  affection: 0,              // lifetime pet count -> affection meter
  unlocked: [],              // achievement ids
  customSkins: [],           // [{id, name, def}] imported community skins
  // v3.14 hidden execution log — unlocked ONLY by feedback with message "1234"
  execLogUnlocked: false,
  feedbackList: [],          // [{message, contact, rating, ts}] real user feedback
};

const OBJECT_KEYS = new Set(['stats']);
const ARRAY_KEYS = new Set(['noWalkZoneList', 'customSkins', 'unlocked', 'feedbackList']);

// v3.19 THE STORE CATALOG — three cats, fourteen hats. The ginger cat is the
// REAL one again (the v3.11 ginger_kitten body/palette — v3.18 had renamed
// the retired 'orange_tabby' impostor into its slot).
// v3.20: DRESSES/COSTUMES REMOVED at the user's request ("remove all cat
// dress and winter jacket dresses properly") — the wardrobe is hats-only.
// The sanitize step walks old save files back onto the catalog (unknown
// breeds/hats reset to the defaults; the legacy `dress` key is dropped).
export const CAT_ITEMS = [
  { id: 'grey_tabby', price: 0 },      // free, always owned
  { id: 'ginger_kitten', price: 0 },   // the REAL ginger cat — free
  { id: 'smokey_kitten', price: 120 }, // the blue-grey plush baby — unlockable
];

// v3.18 store hats (renderer HATS — pumpkin/santa/flower/shades stay seasonal
// extras that are also buyable; tophat/crown/bow are new).
// v3.19: witch/party/chef/cowboy/beanie/halo/horns join them — 14 hats total.
// v3.20: the old DRESS_ITEMS list (red/blue/pink/midnight + the v3.19
// sakura/sunshine/rainbow/berry/hero/pirate costumes) is deleted; owned dress
// ids fall out of `owned` via the ITEM_PRICES filter in sanitize.
export const HAT_ITEMS = [
  { id: 'pumpkin', price: 40 }, { id: 'santa', price: 40 }, { id: 'flower', price: 30 },
  { id: 'shades', price: 50 }, { id: 'tophat', price: 60 }, { id: 'crown', price: 120 },
  { id: 'bow', price: 35 },
  { id: 'witch', price: 60 }, { id: 'party', price: 45 }, { id: 'chef', price: 55 },
  { id: 'cowboy', price: 70 }, { id: 'beanie', price: 40 }, { id: 'halo', price: 90 },
  { id: 'horns', price: 65 },
];

// v3.21 WINTER JACKETS — back at the user's request ("add winter jackets for
// cat in cat store"). Six procedural coats drawn in body space by
// drawJacket() (renderer). Same economy as hats: buy once, own forever,
// equip/unequip via the jacket setting. Unknown ids are dropped by sanitize.
export const JACKET_ITEMS = [
  { id: 'puffer', price: 80 },      // red quilted puffer
  { id: 'parka', price: 90 },       // blue fur-trimmed parka
  { id: 'santa_coat', price: 100 }, // festive coat, belt + fur hem
  { id: 'sweater', price: 60 },     // cream cable-knit
  { id: 'snowsuit', price: 85 },    // teal powder suit, reflector stripe
  { id: 'cardigan', price: 70 },    // warm buttoned cardigan
];

const _catPrices = Object.fromEntries(CAT_ITEMS.map(i => [i.id, i.price]));
const _hatPrices = Object.fromEntries(HAT_ITEMS.map(i => [i.id, i.price]));
const _jacketPrices = Object.fromEntries(JACKET_ITEMS.map(i => [i.id, i.price]));
export const BREED_PRICES = _catPrices;                                   // back-compat name
export const ITEM_PRICES = { ..._catPrices, ..._hatPrices, ..._jacketPrices };
export const KNOWN_CATS = new Set(CAT_ITEMS.map(i => i.id));
export const KNOWN_HATS = new Set(HAT_ITEMS.map(i => i.id));
export const KNOWN_JACKETS = new Set(JACKET_ITEMS.map(i => i.id));

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

  // v3.18: the v3.11 grey_tabby→ginger_kitten default migration was dropped
  // and the impostor 'orange_tabby' was renamed "Ginger Cat".
  // v3.19: THAT WAS WRONG — the real ginger cat IS the old ginger_kitten
  // (restored above). One-time walk-home: v3.18 reset every pre-3.18 save
  // (breed 'ginger_kitten') to grey_tabby, so those homes now read grey_tabby;
  // on the first v3.19 launch they walk back onto the ginger cat. The latch
  // keeps later deliberate grey-tabby picks untouched.

  function sanitize(p) {
    const d = structuredClone(DEFAULTS);
    for (const k of Object.keys(d)) {
      if (!(k in p)) continue;
      if (k === 'owned') {
        if (Array.isArray(p.owned)) d.owned = [...new Set(['grey_tabby', 'ginger_kitten', ...p.owned.filter(x => typeof x === 'string')])];
      } else if (k === 'reminders') {
        if (Array.isArray(p.reminders)) d.reminders = p.reminders.filter(r => r && typeof r.at === 'number');
      } else if (k === 'stats') {
        // counters: merge known fields only, clamp to sane non-negative ints
        if (p.stats && typeof p.stats === 'object') {
          for (const sk of Object.keys(d.stats)) {
            const v = Number(p.stats[sk]);
            if (Number.isFinite(v) && v >= 0) d.stats[sk] = Math.min(9_999_999, Math.floor(v));
          }
        }
      } else if (k === 'noWalkZoneList') {
        if (Array.isArray(p.noWalkZoneList)) {
          d.noWalkZoneList = p.noWalkZoneList.filter(z => z &&
            ['x', 'y', 'w', 'h'].every(f => Number.isFinite(z[f]))).slice(0, 24)
            .map(z => ({ x: z.x, y: z.y, w: z.w, h: z.h }));
        }
      } else if (k === 'customSkins') {
        if (Array.isArray(p.customSkins)) {
          d.customSkins = p.customSkins.filter(sk => sk && typeof sk.id === 'string' && sk.def && typeof sk.def === 'object')
            .slice(0, 32)
            .map(sk => ({
              id: String(sk.id).slice(0, 40), name: String(sk.name || sk.id).slice(0, 32), def: sk.def,
              ...(typeof sk.sig === 'string' ? { sig: sk.sig.slice(0, 512) } : {}),
            }));
        }
      } else if (k === 'unlocked') {
        if (Array.isArray(p.unlocked)) d.unlocked = [...new Set(p.unlocked.filter(x => typeof x === 'string'))];
      } else if (k === 'feedbackList') {
        if (Array.isArray(p.feedbackList)) {
          d.feedbackList = p.feedbackList.filter(f => f && typeof f.message === 'string').slice(-50)
            .map(f => ({
              message: String(f.message).slice(0, 2000),
              contact: String(f.contact || '').slice(0, 120),
              rating: Number.isFinite(f.rating) ? Math.max(1, Math.min(5, f.rating | 0)) : null,
              ts: Number.isFinite(f.ts) ? f.ts : 0,
            }));
        }
      } else if (k === 'execLogUnlocked') {
        d.execLogUnlocked = p.execLogUnlocked === true;   // only ever latch ON via feedback
      } else if (k === 'coins') {
        // economy guard: strictly numeric, non-negative, capped
        if (typeof p.coins === 'number' && Number.isFinite(p.coins) && p.coins >= 0) {
          d.coins = Math.min(9_999_999, Math.floor(p.coins));
        }
      } else if (k === 'hat' || k === 'jacket') {
        // v3.18: nullable string setting — a null DEFAULT cannot ride the
        // generic typeof branch (typeof null === 'object')
        // v3.20: the `dress` twin is gone with the feature; old saves carrying
        // `dress` never reach this loop (not in DEFAULTS) — dropped silently.
        // v3.21: `jacket` rides the exact same nullable-string contract.
        d[k] = (typeof p[k] === 'string' && p[k]) ? p[k] : null;
      } else if (OBJECT_KEYS.has(k)) {
        if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) d[k] = p[k];
      } else if (ARRAY_KEYS.has(k)) {
        if (Array.isArray(p[k])) d[k] = p[k];
      } else if (typeof d[k] === typeof p[k]) d[k] = p[k];
    }
    // v3.18: walk the catalog — a breed/hat that no longer exists
    // (removed cats, or a save file touched by hand) resets to the default.
    // v3.20: a persisted `dress` id is simply dropped (no dress schema at all).
    if (d.breed && !d.breed.startsWith('custom:') && !KNOWN_CATS.has(d.breed)) d.breed = DEFAULTS.breed;
    if (d.hat != null && !KNOWN_HATS.has(d.hat)) d.hat = null;
    if (d.jacket != null && !KNOWN_JACKETS.has(d.jacket)) d.jacket = null;   // v3.21
    // v3.19 one-time ginger restoration (see comment above): fires once per
    // save file, then the latch keeps every later choice exactly as picked.
    if (!p.migrated319) {
      if (d.breed === 'grey_tabby') d.breed = 'ginger_kitten';
      d.migrated319 = true;
    }
    if (Array.isArray(d.owned)) {
      d.owned = d.owned.filter(x => typeof x === 'string' &&
        (x.startsWith('custom:') || x in ITEM_PRICES));
    }
    if (p.version) d.version = p.version;
    // v3.1 promo: unlimited coins -> everything unlocked
    // v3.6: custom (community) skins stay owned too — they live in customSkins
    if (d.unlimitedCoins) {
      d.owned = [...new Set([...Object.keys(ITEM_PRICES), ...d.customSkins.map(s => 'custom:' + s.id)])];
    }
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
      // v3.6.1 robustness: every write goes through the same per-key
      // sanitization the boot path uses.
      //  * collections: the sanitized subset is kept (garbage filtered out)
      //  * scalars: a rejected value keeps the CURRENT value — falling back
      //    to DEFAULTS would let set('coins', -5) reset the purse to 999999
      const prev = data[key];
      data = sanitize({ ...data, [key]: val });
      const scalar = !DEFAULTS[key] || typeof DEFAULTS[key] !== 'object';
      if (scalar && !Object.is(data[key], val) &&
          Object.is(data[key], DEFAULTS[key]) && !Object.is(prev, DEFAULTS[key])) {
        data[key] = prev;
      }
      persist();
      return true;
    },
    // economy
    addCoins(n) {
      data.coins = Math.max(0, Math.min(9999999, (data.coins | 0) + (n | 0)));
      persist();
      return data.coins;
    },
    canAfford(item) {
      if (data.unlimitedCoins) return true;
      return (ITEM_PRICES[item] ?? Infinity) <= data.coins;
    },
    // v3.18: buys ANY catalog item — a cat or a hat (the id space
    // is shared; the store page sends whatever card was clicked).
    // v3.20: dresses are gone — owned dress ids from old saves are filtered
    // out of `owned` in sanitize (they are not in ITEM_PRICES anymore).
    buyItem(item) {
      if (!(item in ITEM_PRICES)) return { ok: false, reason: 'unknown' };
      if (data.owned.includes(item)) return { ok: true, alreadyOwned: true, coins: data.coins };
      // v3.1 promo: unlimited coins -> free unlock, nothing deducted
      if (data.unlimitedCoins) {
        data.owned.push(item);
        persist();
        return { ok: true, free: true, coins: data.coins };
      }
      const price = ITEM_PRICES[item];
      if (data.coins < price) return { ok: false, reason: 'insufficient', needed: price - data.coins };
      data.coins -= price;
      data.owned.push(item);
      persist();
      return { ok: true, coins: data.coins };
    },
    buyBreed(breed) { return this.buyItem(breed); },   // back-compat name
    ownBreed(breed) { // free grant (e.g. via settings sync)
      if (!data.owned.includes(breed)) { data.owned.push(breed); persist(); }
    },
    // ---- v3.6 progression ----
    bumpStat(key, n = 1) {          // pets / jumps / fish / lasers / nuzzles / reminders
      if (!(key in (data.stats || {}))) return null;
      data.stats[key] = Math.min(9_999_999, (data.stats[key] | 0) + (n | 0));
      persist();
      return data.stats[key];
    },
    addAffection(n = 1) {           // lifetime pets -> affection meter
      data.affection = Math.min(9_999_999, (data.affection | 0) + (n | 0));
      persist();
      return data.affection;
    },
    unlock(id) {                    // achievement id
      if (!data.unlocked.includes(id)) { data.unlocked.push(id); persist(); return true; }
      return false;
    },
    addCustomSkin(skin) {           // imported community skin
      if (!skin || typeof skin.id !== 'string') return false;
      const entry = {
        id: skin.id.slice(0, 40),
        name: String(skin.name || skin.id).slice(0, 32),
        def: skin.def,
        ...(typeof skin.sig === 'string' ? { sig: skin.sig.slice(0, 512) } : {}),
      };
      data.customSkins = data.customSkins.filter(s => s.id !== entry.id);
      data.customSkins.push(entry);
      if (data.customSkins.length > 32) data.customSkins = data.customSkins.slice(-32);
      const pid = 'custom:' + entry.id;
      if (!data.owned.includes(pid)) data.owned.push(pid);
      persist();
      return true;
    },
    export() { return JSON.stringify(data); },
  };
}
