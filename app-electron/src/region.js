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

// v3.11 THE LANE WINDOW — the walking-flicker root fix (4th user report).
//
// History: v3.7 killed the hop-flap, v3.8 synchronized the resize, v3.9 made
// the slide a rate-capped chase (≤15px steps) — and users STILL saw flicker
// while the cat walked. The residual artifact is structural: while the cat
// walks, the comfort band empties every few seconds and the chase issues
// SetWindowPos on a transparent window at up to 60Hz. On Windows, moving a
// layered transparent window while its canvas repaints can expose a
// one-vsync stale frame — an invisible shimmer that reads as flicker.
//
// The fix removes the cause instead of hiding it: the region window becomes a
// full-width GROUND LANE. The cat's favorite gait — strolling along the
// ground edge-to-edge — now happens INSIDE a stationary window. Zero
// SetWindowPos while walking, zero flicker, by construction. The chase
// camera remains only for the rare vertical cases (platform climbs, rides,
// drags) where it was always brief.
//
// RAM note: the v3.3 region window was a memory diet (480x434 ≈ 0.21MP).
// The lane is wa.width x ~400 (≤1920 wide, ≈0.77MP ≈ 3MB surface) — a
// deliberate, bounded tradeback to buy the one thing users kept asking for:
// a rock-steady walking cat.
export function computeRegionSize(scale, workArea) {
  const wa = workArea || { x: 0, y: 0, width: 1600, height: 1000 };
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const wantW = Math.min(Number.isFinite(wa.width) ? wa.width : 1600, 1920);
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

export function slideIfNeeded(origin, region, catX, feetY, workArea, scale, opts) {
  const wa = workArea || { x: 0, y: 0, width: 1600, height: 1000 };
  const r = region || { w: 480, h: 434 };
  const o = origin || { x: wa.x, y: wa.y };
  const mX = Math.min(140, Math.round(r.w * 0.3));
  const top = aboveFeet(scale);
  const bottom = belowFeet();
  // v3.12: while the cat GROUND-WALKS, horizontal coverage is the lane-hop's
  // job (one discrete move per monitor crossing). The chase stays vertical
  // only, so ordinary strolling can never reintroduce per-frame window moves
  // — the exact artifact the v3.11 lane was built to kill.
  const allowH = !(opts && opts.horizontal === false);

  const outLeft = allowH && catX < o.x + mX;
  const outRight = allowH && catX > o.x + r.w - mX;
  const outTop = feetY - (top - TOPSLACK) < o.y;   // headroom breached (with slack)
  const outBottom = feetY + bottom > o.y + r.h;

  if (!outLeft && !outRight && !outTop && !outBottom) return null;

  let nx = o.x, ny = o.y;
  if (outLeft || outRight) nx = clampNum(catX - r.w / 2, wa.x, wa.x + wa.width - r.w);
  if (outTop || outBottom) ny = clampNum(feetY + bottom - r.h, wa.y, wa.y + wa.height - r.h);
  if (nx === o.x && ny === o.y) return null;
  return { x: Math.round(nx), y: Math.round(ny) };
}

// v3.12 THE LANE HOP — how the cat WALKS onto the 2nd monitor.
//
// The v3.11 ground lane spans the primary work area (≤1920 wide) and walking
// never moves the window — that is the walking-flicker fix, and it must stay.
// But the brain roams the UNION of all displays, so on a multi-monitor setup
// the cat could reach the lane's right edge with a whole second monitor
// waiting beyond it. The lane hop covers that ONE case: when the stroller is
// within HOP_EDGE of the lane's edge and the union really extends past it,
// the renderer moves the window ONCE (a single setPosition, cat re-centered
// near the near edge) and the stroll continues inside the new lane — the cat
// visibly walks across the monitor seam. Single-display machines: the union
// IS the lane, no hop is ever returned, and walking remains 100% stationary
// (the v3.11 contract, pinned by e2e).
export const HOP_EDGE = 130;      // how close to the lane edge a hop triggers

// The rule is COVERAGE: whenever the stroller comes within HOP_EDGE of the
// lane's edge (either edge) and re-centering the window on the cat would put
// it somewhere new, the window hops once. A hop always leaves the cat
// mid-lane, so strolling never re-triggers per-frame moves — and when the
// window is already as far as the union allows, the target equals the origin
// and nothing happens. Single-display machines: the lane IS the union, so no
// hop is ever returned (the v3.11 zero-moves contract, pinned by e2e).
export function laneHopTarget(origin, region, catX, workArea) {
  const wa = workArea || { x: 0, y: 0, width: 1600, height: 1000 };
  const r = region || { w: 480, h: 434 };
  const o = origin || { x: wa.x, y: wa.y };
  if (!(r.w < wa.width)) return null;             // lane already spans the union
  const nearRight = catX > o.x + r.w - HOP_EDGE;
  const nearLeft = catX < o.x + HOP_EDGE;
  if (!nearRight && !nearLeft) return null;
  const nx = clampNum(catX - r.w / 2, wa.x, wa.x + wa.width - r.w);
  if (Math.round(nx) === Math.round(o.x)) return null;   // window already maximally moved
  return { x: Math.round(nx), y: Math.round(o.y) };
}

// v3.9 THE CHASE CAMERA — why slides stopped teleporting.
//
// Three user reports in a row ("still seeing rendering jump from one place to
// another place") outlived every timing fix we threw at the slide. The root
// cause is structural: the overlay window and the canvas coordinate system
// live in two processes, connected by async IPC. A one-shot slide of 100-400px
// (vertical re-centering after a platform jump is the worst) can never be
// atomic with the canvas origin flip, so for at least one vsync the window
// shows stale content at its NEW position and the whole scene visibly leaps —
// exactly "a rendering jump from one place to another".
//
// The fix: never move the window in one big step. slideIfNeeded still computes
// the same re-centering TARGET it always did (geometry unchanged, all its unit
// tests keep passing), but the renderer now WALKS the origin toward the target
// at a capped speed (chaseStep below). Every step is ≤ CHASE_V·dt ≈ 4-15px, so
// the worst possible stale frame shows a ≤15px shimmer instead of a 400px
// teleport. The cat is drawn at (pose − O) every frame with the optimistically
// advanced O, so on screen the cat simply glides — a camera following a cat,
// which is what a pet overlay should feel like.
//
// Rates were chosen against measured motion: zoomies top out ~220px/s (the
// camera always catches up), a ground→platform jump covers ~400px in 0.55s
// (~730px/s average), so 900px/s tracks the arc without the cat ever outrunning
// the window. Probed on software rendering: continuous window motion costs
// ~+3% CPU at 30Hz vs a stationary window — paid only while the camera is
// actually chasing (idle/sleep never move: same-origin requests are skipped).
export const CHASE_V = 900;   // px/s cap for origin catch-up

// advance `from` toward `to` by at most maxStep px (euclidean); pure.
// Reaching the target returns it exactly (no float drift).
export function chaseStep(from, to, maxStep) {
  const a = from || { x: 0, y: 0 };
  const b = to || a;
  const cap = Number.isFinite(maxStep) && maxStep > 0 ? maxStep : Infinity;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= cap || d === 0) return { x: b.x, y: b.y };
  return { x: a.x + (dx / d) * cap, y: a.y + (dy / d) * cap };
}

// v3.9: the renderer and main must clamp a requested origin IDENTICALLY —
// the chase is fire-and-forget, so the renderer can't wait for main's answer
// to learn the clamped rect. This mirrors main.js's region:move clamp exactly
// (same min sizes, same workArea clamping, same rounding). Unit tests pin the
// two implementations together.
// v3.11: `workArea` may be the UNION of all display work areas (multi-monitor
// roaming) — the math is agnostic, it just needs a bounding rect.
export function clampOrigin(rect, curRegion, workArea) {
  const wa = workArea || { x: 0, y: 0, width: 1600, height: 1000 };
  const num = (v, dflt) => (Number.isFinite(v) ? v : dflt);
  const r = curRegion || { w: 480, h: 434 };
  const w = Math.max(320, Math.min(num(rect?.w, r.w), wa.width));
  const h = Math.max(280, Math.min(num(rect?.h, r.h), wa.height));
  const x = Math.max(wa.x, Math.min(wa.x + wa.width - w, num(rect?.x, 0)));
  const y = Math.max(wa.y, Math.min(wa.y + wa.height - h, num(rect?.y, 0)));
  return { x: Math.round(x), y: Math.round(y), w, h };
}

// v3.11 DRAG FOLLOW — the "cat goes invisible while dragging" fix.
// During a drag the old code SKIPPED the chase entirely (`cand && !dragging`),
// so the window stayed put while the sprite tracked the cursor: the moment
// the cat left the region rect it was clipped to nothing ("hidden outside a
// box area"), and on mouse-up the chase re-centered and the cat "showed
// again". Now the chase keeps running during drags toward a target that
// CENTERS the cat, at a higher cap (drags are human-speed; the window must
// keep up) — the sprite always has canvas under it.
export const DRAG_CHASE_V = 2400;   // px/s cap while the user drags the cat

// v3.12: main-driven drag — main polls screen.getCursorScreenPoint() at
// ~60Hz while the user drags, so the cat tracks the REAL cursor even when it
// races across a monitor boundary (renderer mousemove stops firing the
// instant the cursor leaves the window — the old renderer-only follow could
// stall exactly there, which is why dragging onto the 2nd monitor failed).
// This pure helper is the window placement used every poll tick: center the
// lane on the cat, clamped to the union. Mirrors dragChaseTarget minus the
// no-change check (main throttles identical rects itself).
export function dragWindowTarget(region, catX, feetY, workArea) {
  const wa = workArea || { x: 0, y: 0, width: 1600, height: 1000 };
  const r = region || { w: 480, h: 434 };
  const nx = clampNum(catX - r.w / 2, wa.x, wa.x + wa.width - r.w);
  const ny = clampNum(feetY + belowFeet() - r.h, wa.y, wa.y + wa.height - r.h);
  return { x: Math.round(nx), y: Math.round(ny) };
}

export function dragChaseTarget(origin, region, catX, feetY, workArea) {
  const wa = workArea || { x: 0, y: 0, width: 1600, height: 1000 };
  const r = region || { w: 480, h: 434 };
  const o = origin || { x: wa.x, y: wa.y };
  const nx = clampNum(catX - r.w / 2, wa.x, wa.x + wa.width - r.w);
  const ny = clampNum(feetY + belowFeet() - r.h, wa.y, wa.y + wa.height - r.h);
  if (nx === o.x && ny === o.y) return null;
  return { x: Math.round(nx), y: Math.round(ny) };
}

// v3.11 MULTI-DISPLAY — the "cat can't be dragged to the 2nd monitor" fix.
// Every clamp used screen.getPrimaryDisplay().workArea, so the cat's window
// could never leave monitor 1. The cat now roams the bounding-box UNION of
// all display work areas; windows may span displays on Windows. Pure helper.
export function unionWorkAreas(list) {
  const rects = (Array.isArray(list) ? list : [])
    .filter(d => d && Number.isFinite(d.x) && Number.isFinite(d.y) &&
                 Number.isFinite(d.width) && d.width > 0 && Number.isFinite(d.height) && d.height > 0);
  if (!rects.length) return { x: 0, y: 0, width: 1600, height: 1000 };
  const x1 = Math.min(...rects.map(r => r.x));
  const y1 = Math.min(...rects.map(r => r.y));
  const x2 = Math.max(...rects.map(r => r.x + r.width));
  const y2 = Math.max(...rects.map(r => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

// v3.7: the companion kitten must stay inside the region window that follows
// the MAIN cat. The renderer leashes the kitten to within `companionLeash`
// pixels of the main cat and slides using the pair's midpoint.
// v3.11: the lane is full-width, so an uncapped w/2 leash (720px on 1600px)
// let the kitten wander half a screen away — visually detached. The leash is
// now CAPPED at a cozy 260px: the pair stays together, and both still fit
// inside the lane with room to spare at every scale.
export function companionLeash(regionW) {
  const w = Number.isFinite(regionW) && regionW > 0 ? regionW : 480;
  return Math.min(260, Math.max(110, Math.round(w / 2 - 80)));
}
