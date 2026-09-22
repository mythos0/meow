// settings-store.js — pure settings/economy persistence with injectable backend.

'use strict';

export const DEFAULTS = {
  breed: 'grey_tabby',
  size: 1.0,            // 0.5 .. 2.0
  opacity: 1.0,         // 0.3 .. 1
  sounds: true,
  autoStart: false,
  topmost: true,
  windowHopping: true,  // v3.4: scan open windows so the cat can hop on them
  speed: 55,
  coins: 999999,        // v3.1: promo — effectively unlimited coins
  unlimitedCoins: true, // v3.1: every breed unlocks free while true
  owned: ['grey_tabby'],  // owned breeds (auto-granted to ALL while unlimitedCoins)
  reminders: [],          // [{id,label,at,repeat,anim,sound}]
  version: 1,

  // ---- v3.6 feature pack — every feature ships with an on/off toggle ----
  // system-aware reactions
  reactSystemSpikes: true,   // CPU/RAM spike -> startled, prowls faster
  reactLowBattery: true,     // low battery -> curls up "to save energy"
  timeOfDayMood: true,       // yawns & naps at night, playful by day
  reactNewWindows: true,     // new app opens -> walks over & investigates
  hideDuringCalls: true,     // OBS/Zoom/Teams detected -> hide (never photobomb a call)
  duckDuringCalls: true,     // call detected -> cat sounds step aside
  reactMusic: true,          // music playing -> bops along
  reactApps: true,           // loafs on your editor, gets playful over games
  reactTyping: true,         // fast typing burst -> pounce; long idle -> nap
  stalkCursor: true,         // cursor idle nearby -> stalk & pounce it
  hideInFullscreen: false,   // auto-hide while a fullscreen app has focus
  // interaction & progression
  affectionSystem: true,     // pets build an affection meter that unlocks perks
  companionCat: false,       // a second cat: nuzzle, play-fight, rival stalking
  photoMode: true,           // hotkey freezes the pose & saves a transparent PNG
  // sound design
  contextualSounds: true,    // glass paw-taps on window edges, jump squeaks
  // dev extras
  pomodoro: true,            // focus-timer companion + celebration dance
  dancePartyIdle: true,      // long idle -> mini dance party (screensaver mode)
  reactBuildStatus: false,   // watch a status file -> happy dance / mope
  statusFile: '',            // file watched when reactBuildStatus is on
  // customization & community
  seasonalSkins: false,      // pumpkin hat in October, santa hat in December...
  achievements: true,        // unlockables tied to interaction
  communitySkins: true,      // allow importing JSON skins (Cat Store)
  // quality-of-life
  globalHotkeys: true,       // Ctrl+Alt+C summon/hide, Ctrl+Alt+P photo
  noWalkZones: true,         // respect the no-walk zone list below
  noWalkZoneList: [],        // [{x,y,w,h}] workArea-relative rects the cat avoids
  // progression data (not toggles)
  stats: { pets: 0, jumps: 0, fish: 0, lasers: 0, nuzzles: 0, reminders: 0, pomodoroLate: 0 },
  affection: 0,              // lifetime pet count -> affection meter
  unlocked: [],              // achievement ids
  customSkins: [],           // [{id, name, def}] imported community skins
};

const OBJECT_KEYS = new Set(['stats']);
const ARRAY_KEYS = new Set(['noWalkZoneList', 'customSkins', 'unlocked']);

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
            .map(sk => ({ id: String(sk.id).slice(0, 40), name: String(sk.name || sk.id).slice(0, 32), def: sk.def }));
        }
      } else if (k === 'unlocked') {
        if (Array.isArray(p.unlocked)) d.unlocked = [...new Set(p.unlocked.filter(x => typeof x === 'string'))];
      } else if (OBJECT_KEYS.has(k)) {
        if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) d[k] = p[k];
      } else if (ARRAY_KEYS.has(k)) {
        if (Array.isArray(p[k])) d[k] = p[k];
      } else if (typeof d[k] === typeof p[k]) d[k] = p[k];
    }
    if (p.version) d.version = p.version;
    // v3.1 promo: unlimited coins -> everything unlocked
    // v3.6: custom (community) skins stay owned too — they live in customSkins
    if (d.unlimitedCoins) {
      d.owned = [...new Set([...Object.keys(BREED_PRICES), ...d.customSkins.map(s => 'custom:' + s.id)])];
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
      data.customSkins = data.customSkins.filter(s => s.id !== skin.id);
      data.customSkins.push({ id: skin.id.slice(0, 40), name: String(skin.name || skin.id).slice(0, 32), def: skin.def });
      if (data.customSkins.length > 32) data.customSkins = data.customSkins.slice(-32);
      const pid = 'custom:' + skin.id;
      if (!data.owned.includes(pid)) data.owned.push(pid);
      persist();
      return true;
    },
    export() { return JSON.stringify(data); },
  };
}
