// region.js — pure math for the v3.3 "region window" RAM diet.
//
// The cat overlay used to span the whole workArea (e.g. 1600x1000); the
// compositor held a full-screen transparent surface for it, which dominated
// renderer RAM. Instead the window is now a small region that FOLLOWS the
// cat: same pixel size while following (cheap native move, no surface
// reallocation), resized only when the cat size slider or the workArea
// changes.
//
// Pure functions only — fully unit-testable, no DOM/Electron deps.

'use strict';

// vertical headroom needed above the feet point, by cat scale:
//  - in-place hop rises 70px (not scaled)
//  - reminder bubble tops out at 150*s + 70, plus ~80px bubble height
//  - emote floats ~230*s above the feet at the tallest breeds
// plus a small margin; below the feet we keep a little ground padding.
export function aboveFeet(scale) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.ceil(Math.max(70, 150 * s + 150, 230 * s) + 24);
}

export function belowFeet() {
  return 60;
}

export function computeRegionSize(scale, workArea) {
  const wa = workArea || { x: 0, y: 0, width: 1600, height: 1000 };
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const wantW = Math.ceil(180 * s + 300);   // cat width + side margins for hops
  const wantH = aboveFeet(s) + belowFeet();
  const w = Math.max(320, Math.min(Math.round(wantW), wa.width));
  const h = Math.max(280, Math.min(Math.round(wantH), wa.height));
  return { w, h };
}

// initial origin: center on the spawn point, feet near the bottom padding
export function initialOrigin(workArea, region, spawnX, feetY) {
  const wa = workArea || { x: 0, y: 0, width: 1600, height: 1000 };
  const r = region || { w: 480, h: 434 };
  const x = clampNum(spawnX - r.w / 2, wa.x, wa.x + wa.width - r.w);
  const y = clampNum(feetY + belowFeet() - r.h, wa.y, wa.y + wa.height - r.h);
  return { x: Math.round(x), y: Math.round(y) };
}

function clampNum(v, lo, hi) {
  if (hi < lo) return lo;          // degenerate (region bigger than area)
  return Math.max(lo, Math.min(hi, v));
}

// slide the origin only when the cat leaves the inner comfort band
// (hysteresis: while inside, the window never moves). When out, re-center
// on the cat (clamped to the workArea) — one cheap native move, then quiet.
// Returns the new origin, or null when no move is needed.
//
// v3.7 TOPSLACK: the region height already reserves aboveFeet() of headroom
// above the GROUND feet (the 70px in-place hop is part of that reserve), but
// the old check compared the LIVE feet against the full reserve — at ground
// level the band was exactly zero pixels wide, so every hop (70px), music-bop
// bob (4px) or zoomies bounce (9px) re-triggered a slide and the overlay
// window flapped up/down on loop (the "cat jumping/flushing" bug report).
// The slack lets small airborne arcs ride inside the reserve; real climbs
// (platform jumps, far above the slack) still slide.
const TOPSLACK = 80;

export function slideIfNeeded(origin, region, catX, feetY, workArea, scale) {
  const wa = workArea || { x: 0, y: 0, width: 1600, height: 1000 };
  const r = region || { w: 480, h: 434 };
  const o = origin || { x: wa.x, y: wa.y };
  const mX = Math.min(140, Math.round(r.w * 0.3));
  const top = aboveFeet(scale);
  const bottom = belowFeet();

  const outLeft = catX < o.x + mX;
  const outRight = catX > o.x + r.w - mX;
  const outTop = feetY - (top - TOPSLACK) < o.y;   // headroom breached (with slack)
  const outBottom = feetY + bottom > o.y + r.h;

  if (!outLeft && !outRight && !outTop && !outBottom) return null;

  let nx = o.x, ny = o.y;
  if (outLeft || outRight) nx = clampNum(catX - r.w / 2, wa.x, wa.x + wa.width - r.w);
  if (outTop || outBottom) ny = clampNum(feetY + bottom - r.h, wa.y, wa.y + wa.height - r.h);
  if (nx === o.x && ny === o.y) return null;
  return { x: Math.round(nx), y: Math.round(ny) };
}

// v3.7: the companion kitten must stay inside the region window that follows
// the MAIN cat. The renderer leashes the kitten to within `companionLeash`
// pixels of the main cat and slides using the pair's midpoint — with a leash
// this size both cats always fit inside the region at any scale.
export function companionLeash(regionW) {
  const w = Number.isFinite(regionW) && regionW > 0 ? regionW : 480;
  return Math.max(110, Math.round(w / 2 - 80));
}
