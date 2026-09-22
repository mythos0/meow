// no-walk.js — "no-walk zones": screen rects the cat refuses to enter
// (e.g. never cross the taskbar clock, never walk over the trading view).
// Zones are stored workArea-RELATIVE so they survive resolution changes;
// these helpers convert + test intersection. All pure & unit-tested.

'use strict';

export function toScreenZone(zone, workArea) {
  const ax = workArea?.x ?? 0, ay = workArea?.y ?? 0;
  return { x: ax + zone.x, y: ay + zone.y, w: zone.w, h: zone.h };
}

export function toRelativeZone(zone, workArea) {
  const ax = workArea?.x ?? 0, ay = workArea?.y ?? 0;
  return { x: zone.x - ax, y: zone.y - ay, w: zone.w, h: zone.h };
}

export function zonesToScreen(list, workArea) {
  return (list || []).filter(validZone).map(z => toScreenZone(z, workArea));
}

export function validZone(z) {
  return !!z && [z.x, z.y, z.w, z.h].every(Number.isFinite) && z.w > 4 && z.h > 4;
}

export function rectsIntersect(a, b, margin = 0) {
  if (!a || !b) return false;
  return a.x - margin < b.x + b.w && a.x + a.w + margin > b.x &&
         a.y - margin < b.y + b.h && a.y + a.h + margin > b.y;
}

// approximate body rect of the cat standing with feet at (x, feetY)
export function catRect(x, feetY, scale = 1) {
  const w = 96 * scale, h = 150 * scale;
  return { x: x - w / 2, y: feetY - h, w, h };
}

// returns the blocking zone (screen coords) or null
export function blockedAt(screenZones, x, feetY, scale = 1, margin = 8) {
  const body = catRect(x, feetY, scale);
  for (const z of screenZones) {
    if (rectsIntersect(body, z, margin)) return z;
  }
  return null;
}

// window platforms that overlap a zone are removed (cat never jumps there)
export function filterPlatforms(list, screenZones) {
  if (!screenZones || !screenZones.length) return list || [];
  return (list || []).filter(pl => !screenZones.some(z => rectsIntersect(pl, z, 4)));
}

// would moving from x to nextX at feetY cross into a zone? returns the
// corrected x (stop just before the zone, buffer = cat half-width + margin)
// or null when the move is fine
export function resolveMove(screenZones, x, nextX, feetY, scale = 1, margin = 10) {
  const blocked = blockedAt(screenZones, nextX, feetY, scale, margin);
  if (!blocked) return null;                       // move is fine
  if (!blockedAt(screenZones, x, feetY, scale, margin)) {
    // currently outside: clamp to the zone edge with a body buffer
    const buf = 52 * scale;                        // cat body half-width + fur
    if (nextX > x) return blocked.x - buf - margin - 1;
    return blocked.x + blocked.w + buf + margin + 1;
  }
  return x;                                        // already inside: don't dig deeper
}
