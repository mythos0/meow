// butterfly.js — v3.13 pure butterfly state machine. No DOM/Electron deps.
//
// v3.13 fixes "the butterfly is not showing in every desktop": the old
// spawner lived in cat.html and used the PRIMARY work area, so on a
// multi-monitor setup the butterfly crossed whichever screen the cat was NOT
// on and was never seen (it was culled at the primary's edges before ever
// reaching the cat's lane on display 2). The butterfly now spawns relative
// to the overlay LANE the cat currently occupies — from the edge NEARER the
// cat — so it always flutters across the cat's visible canvas, on every
// display, and is culled when it leaves that lane.
//
// It also gains the real-hunt loop:  cruise → hunted → (pounce → caught |
// startle → flee → cruise). cat.html owns the cat's brain (stalk/pounce) and
// the catch rewards; this module owns the butterfly's motion and the catch
// geometry. Deterministic given the injected rand + clock.

'use strict';

// how close the butterfly must be (px, horizontal) before an idle-ish cat
// notices it and starts the stalk-hunt
export const HUNT_RADIUS = 340;
// the pounce reach: the butterfly is caught when it is within CATCH_DX
// horizontally of the cat and no higher than CATCH_DY above its feet
export const CATCH_DX = 95;
export const CATCH_DY = 180;
// v3.14 the rearing swat: paw-point reach (px) — the cat stands on its hind
// legs and a swat catches the butterfly when it is within this radius of the
// striking paw (which hovers ~105px above the feet, just over the head).
// v3.15: tightened 66 → 54 — at 66 the first apex connected almost every
// time (the user saw the cat "just eat" the butterfly: no stalk drama, no
// dodges). 54 makes a high butterfly a genuine MISS.
export const SWAT_RADIUS = 54;

const HUES = [28, 96, 200, 320, 48];

// lane: { x, w } — the visible overlay lane in screen coords.
// Spawns just outside the edge NEARER the cat so it arrives quickly, flying
// toward the cat's half of the lane.
export function spawnButterfly({ lane, catX, groundY, now, rand = Math.random }) {
  const l = lane && Number.isFinite(lane.x) && Number.isFinite(lane.w) ? lane : { x: 0, w: 1600 };
  const g = Number.isFinite(groundY) ? groundY : 800;
  const fromRight = Number.isFinite(catX) ? catX > l.x + l.w / 2 : !!rand();
  const dir = fromRight ? -1 : 1;
  return {
    x: fromRight ? l.x + l.w + 30 : l.x - 30,
    y: g - 90 - rand() * 120,
    vx: dir * (58 + rand() * 34),
    hue: HUES[Math.floor(rand() * HUES.length)],
    born: Number.isFinite(now) ? now : 0,
    state: 'cruise',        // cruise | hunted | flee
    fleeUntil: 0,
    wob: rand() * Math.PI * 2,
  };
}

// advance the butterfly one step.
//   dt, now   — seconds
//   lane      — { x, w } the visible lane (cull bounds)
//   groundY   — the cat's ground line (dip target)
//   catX      — the hunter's x (the hunted butterfly flutters AROUND it)
// Returns 'culled' when the butterfly left the lane (caller drops it),
// null otherwise. Never throws on missing fields.
export function tickButterfly(bf, { dt, now, lane, groundY, catX, rand = Math.random } = {}) {
  if (!bf || !(dt > 0)) return null;
  const l = lane && Number.isFinite(lane.x) && Number.isFinite(lane.w) ? lane : { x: 0, w: 1600 };
  const g = Number.isFinite(groundY) ? groundY : 800;
  bf.wob = (bf.wob || 0) + dt * 2.2;
  const wob = bf.wob;

  if (bf.state === 'flee') {
    // dart away fast and climb while scared, then settle back to a cruise.
    // v3.14: a swat dodge adds a sharp upward jink (bf.climb) that decays —
    // the butterfly visibly jinks UP and away from the striking paw
    bf.x += bf.vx * dt;
    bf.climb = (bf.climb || 0) * Math.max(0, 1 - 2.6 * dt);
    bf.y -= (24 + bf.climb) * dt;
    const ceil = g - 320;                    // never vanish through the ceiling
    if (bf.y < ceil) bf.y = ceil;
    if (now >= bf.fleeUntil) {
      bf.state = 'cruise';
      bf.vx = Math.sign(bf.vx || 1) * (48 + rand() * 26);
      // v3.15: the hunter is still right there — go straight back to the
      // hunted hover (with its dips) instead of calmly cruising out of
      // reach. Without this the cat burned its 3 swats at a butterfly that
      // had settled high in the air and the hunt always ended in escape.
      if (Number.isFinite(catX) && Math.abs(bf.x - catX) < 340) bf.state = 'hunted';
    }
  } else if (bf.state === 'hunted') {
    // nervous hover near the hunter. v3.15 THE REAL-HUNT ALTITUDE: the
    // butterfly hovers HIGH — above the rearing paw's reach — and only
    // periodically DIPS into it. The dip cycle is deterministic (driven by
    // wob) so tests can pin it: over every 3.4s the butterfly spends ~1.3s
    // descending into paw reach (bottom ≈ 78–118px above the ground, the
    // paw strikes at ~104). A swat that connects is therefore EARNED — the
    // cat must rear while the prey is dipping; every other swat misses and
    // the butterfly dodges (cat.html), exactly the stalk → rear → swat →
    // dodge → chase → rear loop the hunt is supposed to be.
    bf.vx = bf.vx * Math.max(0, 1 - 2.4 * dt) + Math.sin(wob * 1.7) * 16 * dt;
    bf.x += bf.vx * dt;
    // flutter around the hunter instead of drifting off
    if (Number.isFinite(catX)) {
      const dx = bf.x - catX;
      if (Math.abs(dx) > 210) bf.vx -= Math.sign(dx) * 260 * dt;
    }
    const DIP_T = 3.4, DIP_LEN = 1.3;
    const ph = (wob % DIP_T) / DIP_T;                       // 0..1 cycle
    const dipT = DIP_LEN / DIP_T;
    let dipWin = 0;
    if (ph < dipT) {
      // trapezoid: sink ~0.39s, HOLD at the bottom ~0.5s, rise ~0.39s — the
      // hold lets the eased position actually REACH the dip floor (a plain
      // sine window lags ~40px above it and the paw could never connect)
      const ph2 = ph / dipT;
      dipWin = Math.min(ph2 / 0.3, (1 - ph2) / 0.3, 1);
    }
    const base = g - 192 + Math.sin(wob * 0.9) * 24;         // 168..216 up: OUT of reach
    const dip = base + ((g - 88) - base) * dipWin;           // sink toward ~88px up
    bf.y += (dip + Math.cos(wob * 2.3) * 7 - bf.y) * Math.min(1, 2.2 * dt);
    const lo = g - 260, hi = g - 40;
    if (bf.y < lo) bf.y = lo;
    if (bf.y > hi) bf.y = hi;
  } else {
    // cruise: steady crossing with a gentle bob
    bf.x += bf.vx * dt;
    bf.y += Math.sin(wob) * 14 * dt;
  }

  if (bf.x < l.x - 70 || bf.x > l.x + l.w + 70) return 'culled';
  if (Number.isFinite(now) && (now - bf.born) > 75) return 'culled';
  return null;
}

// the cat pounces — is the butterfly within reach? Pure geometry so tests can
// pin it exactly; cat.html calls this the moment the stalk pounce begins.
export function butterflyCatchable(bf, cat) {
  if (!bf || !cat || !Number.isFinite(bf.x) || !Number.isFinite(cat.x)) return false;
  const dy = cat.baseY - bf.y;              // >0: the butterfly is above the feet
  return Math.abs(bf.x - cat.x) <= CATCH_DX && dy <= CATCH_DY && dy >= -40;
}

// v3.14 the rearing swat — is the butterfly within the striking paw's reach?
// cat.html computes the paw point (in front of the cat's raised head) and
// calls this at each swat apex.
export function swatCatchable(bf, pawX, pawY) {
  if (!bf || !Number.isFinite(bf.x) || !Number.isFinite(bf.y) ||
      !Number.isFinite(pawX) || !Number.isFinite(pawY)) return false;
  return Math.hypot(bf.x - pawX, bf.y - pawY) <= SWAT_RADIUS;
}

// v3.14 the DODGE: a swat just missed — the butterfly jinks sharply away
// from the paw and climbs steeply (more dramatic than the pounce startle;
// a real butterfly escaping a paw seems to vanish sideways and up)
export function dodgeButterfly(bf, fromX, fromY, now, rand = Math.random) {
  if (!bf) return false;
  bf.state = 'flee';
  const away = bf.x >= fromX ? 1 : -1;
  bf.vx = away * (300 + rand() * 130);
  bf.climb = 150 + rand() * 90;
  bf.fleeUntil = (Number.isFinite(now) ? now : 0) + 0.9 + rand() * 0.45;
  return true;
}

// the pounce missed — the butterfly darts away from the cat and climbs
export function startleButterfly(bf, fromX, now, rand = Math.random) {
  if (!bf) return false;
  bf.state = 'flee';
  const away = bf.x >= fromX ? 1 : -1;
  bf.vx = away * (250 + rand() * 110);
  bf.fleeUntil = (Number.isFinite(now) ? now : 0) + 1.3 + rand() * 0.5;
  return true;
}
