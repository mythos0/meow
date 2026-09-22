// achievements.js — pure progression rules: affection meter, achievement
// unlock conditions, and the perks each affection level grants. Feeding these
// functions a stats snapshot always yields the same answer (unit-tested).

'use strict';

// ---------------------------------------------------------------- affection
// The meter fills with pet taps. Each level unlocks a small perk.
export const AFFECTION_LEVELS = [
  { level: 1, at: 0,   perk: 'purr on every pet' },
  { level: 2, at: 30,  perk: 'bigger hearts + occasional rainbow' },
  { level: 3, at: 100, perk: 'bonus treat emote unlocked' },
  { level: 4, at: 250, perk: 'greets you at every boot' },
];

export function affectionLevel(affection) {
  let lvl = AFFECTION_LEVELS[0];
  for (const l of AFFECTION_LEVELS) if (affection >= l.at) lvl = l;
  return lvl;
}

export function affectionProgress(affection) {
  const cur = affectionLevel(affection);
  const next = AFFECTION_LEVELS.find(l => l.at > affection);
  if (!next) return { level: cur.level, pct: 100, next: null };
  const span = next.at - cur.at;
  const pct = Math.min(100, Math.round(((affection - cur.at) / span) * 100));
  return { level: cur.level, pct, next: { level: next.level, at: next.at } };
}

// ---------------------------------------------------------------- achievements
// id, name, description, and a test(stats, affection) predicate.
export const ACHIEVEMENTS = [
  { id: 'first_meet',   name: 'First Contact',      desc: 'Pet your cat once',              icon: '🐾', test: s => s.pets >= 1 },
  { id: 'pets_100',     name: 'Purring Machine',    desc: 'Pet your cat 100 times',         icon: '💗', test: s => s.pets >= 100 },
  { id: 'jumper_50',    name: 'Parkour Cat',        desc: '50 window-top jumps',            icon: '🪟', test: s => s.jumps >= 50 },
  { id: 'diner_10',     name: 'Regular at the Diner', desc: 'Eat 10 fish',                  icon: '🐟', test: s => s.fish >= 10 },
  { id: 'hunter_5',     name: 'Dot exterminator',   desc: 'Catch the laser 5 times',        icon: '🔴', test: s => s.lasers >= 5 },
  { id: 'zen_10',       name: 'Zen household',      desc: '10 nuzzles with a companion cat', icon: '🧘', test: s => s.nuzzles >= 10 },
  { id: 'night_owl',    name: 'Night owl company',  desc: 'Run a focus session past 10pm',  icon: '🌙', test: s => s.pomodoroLate >= 1 },
  { id: 'reminder_10',  name: 'On schedule',        desc: 'Survive 10 reminders',           icon: '⏰', test: s => s.reminders >= 10 },
];

// Given a stats snapshot + already-unlocked ids, which achievements fire now?
export function checkUnlocks(stats, unlockedIds) {
  const have = new Set(unlockedIds || []);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    let ok = false;
    try { ok = !!a.test(stats || {}); } catch { ok = false; }
    if (ok) fresh.push(a.id);
  }
  return fresh;
}

// perks the renderer asks about
export function unlockedPerks(unlockedIds) {
  const have = new Set(unlockedIds || []);
  return {
    rainbowPet: have.has('pets_100'),   // rare rainbow emote when petted
    sparkleLand: have.has('jumper_50'), // sparkles when landing a jump
    heartRain: have.has('zen_10'),      // heart rain after nuzzles
    dotSlayer: have.has('hunter_5'),    // sparkle collar for the cat
  };
}
