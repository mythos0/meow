# Rendering the Cat — Implementation Reference

This document is the engineering deep-dive behind the README section *"How the cat is
rendered"*. Source of truth: [`app-electron/src/cat-renderer.js`](../app-electron/src/cat-renderer.js).

---

## 1. Design goals

| goal | how it is achieved |
|---|---|
| zero assets | every frame is drawn from palettes + geometry; nothing to mis-package (the v2.0.0 "invisible cat" incident was a sprite-packaging regression) |
| deterministic | `drawCat(ctx, opts)` renders identical pixels for identical inputs — `t` is the only clock |
| testable | pure ES module, no DOM/Electron — runs in node tests and headless Chromium |
| breedable | breeds are data (palette + skeleton), not new art |
| cheap | ~200 draw calls/frame, no images to decode → 60 FPS on an overlay window |

## 2. Module surface

```js
export const PALETTES     // 20 breeds: colors + pattern flags
export const BODIES       // 6 skeletons: ~20 numbers each
export const STATES       // 20 animation states
export const EMOTES       // 11 floating emote glyphs
export function drawCat(ctx, opts)        // full cat, one frame
export function drawParticles(ctx, opts)  // ambient particles (sparkle/heart/z/chip/leaf)
export function drawEmote(ctx, opts)      // pop-in emote glyph
export const CAT_BBOX     // generous hit-test box (local units)
```

`opts = { t, state='walk', dir=1, breed='grey_tabby', scale=1, alpha=1, jumpP=0.5 }`

Private helpers: `poseFor` (state → pose object), `drawLeg` (IK + capsules),
`drawTail` (chained pendulum), `drawHead` (skull/ears/eyes/muzzle), `drawBamboo`,
`shade` (hex → lighter/darker), `radialFill`, `limb` (tapered capsule), `ell`, `rr`,
`star`, `heart`, `hash` (deterministic pseudo-random for fur jitter).

## 3. Pose object

`poseFor(state, t, jumpP, B)` returns:

```js
{
  bodyY, bobY,        // vertical offset + oscillation (px, negative = up)
  bodyRot,            // torso rotation (rad)
  sqx, sqy,           // squash & stretch factors (1 + value)
  shadowK,            // ground-shadow scale (shrinks mid-jump)
  headX, headY, headRot,
  wholeRot,           // full-body rotation (panda somersault)
  hideLegs,           // loaf/roll: draw tucked paw bumps instead of legs
  prop,               // 'bamboo' renders the stalk between the paws
  earFlat,            // 0..1 flatten-on-startle
  legs: [ {fx,fy} x4 ],  // foot targets: front-near, front-far, back-near, back-far
  tailMode,           // sway | stream | spiral | curl | wrap
  eyeState,           // open | blink | happy | closed
  mouth,              // closed | open | yawn
  particles,          // { kind, f } spawner or null
}
```

Gaits: the four feet oscillate on `sin(t·f + phase)` with diagonal pairing
(front-near + back-far vs front-far + back-near); amplitude and stride come from the
skeleton (`footAmp`, `feet[]`). Jump adds squash-&-stretch keyed on `jumpP` and an
extra stretch near landing (p > 0.85).

Squash & stretch: `sqx = -sqy` during run/dance keeps area roughly constant —
the classic animation principle, applied in `ctx.scale`.

## 4. Skeletons (BODIES)

```
normal  rx41 ry25 head23 legL 16+18 standY-44 tail 9×8.2r7.5
slim    rx37 ry22.5 head21 legL 17+19 standY-46 tail 10×8.0r6.6
kitten  rx31 ry22 head26 legL 14+15 standY-34 tail 6×6.6r5.4   (head/body ratio > 0.75)
chubby  rx47 ry30 head25 legL 13+14 standY-40 tail 8×7.8r8.4
large   rx46 ry27 head26 legL 19+21 standY-50 tail 11×8.8r8.4
panda   rx47 ry31 head27 legL 13+14 standY-40 tail 4×7.0r9.0
```

Each also carries: haunch/chest ellipse params, shoulder/hip anchors, head anchor,
ear scale, foot anchors `feet[4]`, stride amplitude `footAmp`, store-preview scale.

## 5. Layer stack (paint order)

1. ground shadow (blurred ellipse; `ctx.filter='blur(2px)'`)
2. `wholeRot` transform — panda somersault rotates the entire cat around its torso center
3. far legs (darkened fill) — *skipped when `hideLegs`*
4. tail — **drawn inside the body transform** (`translate(bodyY) · rotate(bodyRot) ·
   scale(sqx,sqy)`) so it stays attached when the body rotates/squashes (sleep curl,
   stretch lean, scratch rear-up)
5. torso: radial-gradient ellipse → haunch volume → chest volume → clipped breed marks
   (stripes / patches / spots / shoulder band / belly / socks) → rim-light arc
6. near legs in base color — or two tucked paw bumps when `hideLegs`
7. held prop (`bamboo`: gradient stalk, segment joints, leaves that wobble with the munch)
8. head group (own transform: translate → rotate headRot)

> The tail-in-body-transform fix matters: previously sleep's rotated/squashed torso left the
> tail floating at the un-rotated anchor. All poses now keep the tail attached.

## 6. Legs & IK

```
solveIK(ax, ay, fx, fy, l1, l2, bend):
  d      = clamp(|f - a|, |l1-l2|+ε, (l1+l2)·0.999)
  cosA   = (l1² + d² - l2²) / (2·l1·d)
  knee   = a + l1 · (dir(cosA) rotated by bend)
```

Leg render: tapered capsule (a→knee, r 8.5→6) + capsule (knee→paw, r 6→5) + paw ellipse +
a faint toe line. `pal.socks` overlays a white paw. The knee always bends backward
(`bendDir = -1`) like a real cat's front legs.

## 7. Tail chain

```
angle starts at CFG[mode].a0; per segment i:
  angle += sin(t·waveF + k·kw)·waveA·0.55 + bend
  point  += (cos angle, sin angle) · (step − k·1.2)
radius(k) = r − k·(r − 2.8)      // tapered
```

Modes: `sway` (idle walk), `stream` (run — fast, shallow), `spiral` (dance/happy — curls up),
`curl` (sit/groom), `wrap` (sleep/loaf — hugs the ground line). Stripe rings at segments
2/4/6 for tabbies; tip color per breed (points/patches/socks).

## 8. Head anatomy

* ears: triangle path scaled by `B.ear` (round circles for panda), inner-ear overlay,
  twitch `sin(t·0.9) > 0.97`, dance bounce, `earFlat` rotation when startled
* lynx tufts (maine coon): 3 strokes off each ear tip
* skull: radial gradient (highlight −0.25r,−0.3r) over ellipse r×0.94r
* clipped marks: calico patches, siamese/ragdoll point mask, bengal spots, tabby "M",
  muzzle-belly patch
* eyes at (±8.5 + r·0.12, −r·0.12): panda draws black patches first; sclera → iris
  radial gradient (light→base→dark) → vertical pupil → catchlight; blink = two sine
  oscillators (~3.3 s and ~6 s period); `happy` = curved closed eyes; `closed` = soft line
* nose: rounded triangle; mouth: closed "ω" curves / open tongue / big yawn ellipse
* whiskers: 3 per side, quadratic curves with a travelling `sin(t·3+i)` wobble
* rim light on the crown

## 9. Emotes

`drawEmote` life-cycle (2 s): spring pop-in `1 + sin(min(1,t·5.5)·π)·0.28`, bob
`sin(t·3.2)·2.2`, last 0.35 s linear fade. Badge (white circle + tail) for `question,
exclaim, note, angry, laugh`; free-floating for `heart, love, star, sweat, zzz, fish`.
All glyphs are canvas paths — no font emoji, no images.

## 10. Determinism & jitter

`hash(n) = fract(sin(n·127.1 + 311.7)·43758.5453)` — stable pseudo-random for cheek-fur
jitter so the same cat always looks the same. No `Math.random()` anywhere in the renderer.

## 11. Testing hooks

`test/harness.html` renders any `?state=&t=&breed=&dir=&scale=&jumpP=&emote=&emoteT=`
on a checker background. `tests/renderer.test.mjs` (Playwright) asserts:

* every state/breed/emote paints ≥2 % opaque pixels with a sane bbox, feet near the ground
* every (non-static) state differs pixel-wise between t=0 and t=0.35 — animation is alive
* all 20 breeds have unique pixel-hash signatures; mirror flip is symmetric within 8 px
* panda renders with both dark (<70 luma) and light (>215 luma) regions
* emote pops in above the head and is gone after its 2 s life

## 12. Performance

One cat frame ≈ 150–250 path fills, no image decodes, no allocations per frame beyond small
pose objects — measured well under 2 ms/frame in the overlay. The app renders only the cat's
neighborhood transparently; the canvas is a single full-screen layer cleared each frame
(`clearRect`), so Windows compositing stays cheap.
