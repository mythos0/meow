// cat-renderer.js — procedural 2D-canvas cat. Pure module: no DOM, no Electron.
// Draw is deterministic: every frame is a pure function of (t, state, breed, dir, opts).
// Coordinate system: feet on y=0, cat centered near x=0, facing +x (right). Flip via dir=-1.

'use strict';

// ---------------------------------------------------------------- palettes
export const PALETTES = {
  grey_tabby: {
    name: "Grey Tabby",
    fur: '#9aa0a8', dark: '#565b63', belly: '#d7dade', stripe: '#43474e',
    earIn: '#d59aa2', nose: '#c47583', eye: '#79b356', pupil: '#1c1f24',
    tongue: '#d98a94',
  },
  orange_tabby: {
    name: "Ginger Cat",
    fur: '#eaa75f', dark: '#c47f3c', belly: '#f8e3c4', stripe: '#a85a24',
    earIn: '#e0a89e', nose: '#d07f6e', eye: '#93bb4e', pupil: '#241a10',
    tongue: '#d98a94',
  },
  smokey_kitten: {
    name: "Smokey Kitten",   // blue-grey plush baby with white socks
    body: 'kitten', bigEye: true, socks: true,
    fur: '#9fb0bd', dark: '#6e8090', belly: '#e5ecf1', stripe: '#5a6c7c',
    earIn: '#d3a3ab', nose: '#7d8894', eye: '#8fce6e', pupil: '#131c22',
    tongue: '#d98a94',
  },
  // v3.18: every other built-in breed was REMOVED at the user's request —
  // the Cat Store now carries exactly three cats (grey tabby + ginger cat
  // free, smokey kitten unlockable) plus hats and dresses.
};

// ---------------- body types (v3.1) ----------------
// Curated skeleton per body type. Every coordinate is in cat-local units:
// feet on y=0, facing +x, so all values are negative above ground.
export const BODIES = {
  normal: {
    rx: 41, ry: 25, haunch: [-22, -2, 20, 18], chest: [26, 2, 14, 15],
    sh: [20, 4], hp: [-24, 2], head: [36, -34], headR: 23,
    legL1: 16, legL2: 18, ear: 1.0, footAmp: 9,
    feet: [24, 30, -22, -28],
    tail: { base: [-36, -16], segs: 9, step: 8.2, r: 7.5 },
    standY: -44, preview: 0.62,
  },
  slim: {           // oriental/sleek: longer legs, narrower torso
    rx: 37, ry: 22.5, haunch: [-20, -2, 18, 16], chest: [24, 2, 12, 13],
    sh: [18, 4], hp: [-22, 2], head: [33, -32], headR: 21,
    legL1: 17, legL2: 19, ear: 1.05, footAmp: 10,
    feet: [22, 28, -20, -26],
    tail: { base: [-33, -15], segs: 10, step: 8.0, r: 6.6 },
    standY: -46, preview: 0.60,
  },
  kitten: {         // baby proportions: huge head, short legs, stubby tail
    rx: 31, ry: 22, haunch: [-16, -2, 15, 15], chest: [20, 2, 11, 12],
    sh: [15, 4], hp: [-18, 2], head: [27, -36], headR: 26,
    legL1: 14, legL2: 15, ear: 1.25, footAmp: 7,
    feet: [18, 23, -15, -19],
    tail: { base: [-26, -13], segs: 6, step: 6.6, r: 5.4 },
    standY: -34, preview: 0.60,
  },
  chubby: {         // round and heavy: short legs, thick tail
    rx: 47, ry: 30, haunch: [-25, -2, 24, 21], chest: [29, 2, 17, 18],
    sh: [22, 5], hp: [-27, 3], head: [38, -38], headR: 25,
    legL1: 13, legL2: 14, ear: 0.95, footAmp: 8,
    feet: [25, 31, -23, -29],
    tail: { base: [-40, -17], segs: 8, step: 7.8, r: 8.4 },
    standY: -40, preview: 0.55,
  },
  large: {          // maine coon: tall, long, bushy tail
    rx: 46, ry: 27, haunch: [-25, -2, 23, 20], chest: [29, 2, 16, 17],
    sh: [22, 4], hp: [-27, 2], head: [40, -38], headR: 26,
    legL1: 19, legL2: 21, ear: 1.1, footAmp: 10,
    feet: [26, 33, -24, -31],
    tail: { base: [-40, -17], segs: 11, step: 8.8, r: 8.4 },
    standY: -50, preview: 0.55,
  },
  panda: {          // giant panda — bear build (research): barrel body, round
                    // head, 10–15cm stub tail, short stocky legs
    rx: 50, ry: 33, haunch: [-26, -2, 27, 24], chest: [30, 2, 19, 20],
    sh: [23, 5], hp: [-28, 3], head: [37, -42], headR: 28,
    legL1: 12, legL2: 13, ear: 0.9, footAmp: 6,
    feet: [26, 32, -24, -30],
    tail: { base: [-44, -16], segs: 4, step: 6.0, r: 10.0 },
    standY: -42, preview: 0.50,
  },
  chibi: {          // v3.2 plush-toy proportions: enormous head, tiny body
    rx: 30, ry: 21, haunch: [-15, -2, 15, 14], chest: [19, 2, 11, 12],
    sh: [14, 4], hp: [-17, 2], head: [24, -33], headR: 29,
    legL1: 12, legL2: 13, ear: 1.3, footAmp: 6,
    feet: [17, 22, -14, -18],
    tail: { base: [-25, -12], segs: 6, step: 6.2, r: 6.2 },
    standY: -31, preview: 0.58,
  },
  munchkin: {       // v3.2 sausage body on stubby little legs
    rx: 42, ry: 24, haunch: [-23, -2, 21, 18], chest: [26, 2, 14, 15],
    sh: [20, 4], hp: [-25, 2], head: [35, -30], headR: 23,
    legL1: 11, legL2: 10, ear: 1.0, footAmp: 5,
    feet: [24, 30, -22, -28],
    tail: { base: [-38, -15], segs: 9, step: 7.6, r: 7.6 },
    standY: -38, preview: 0.58,
  },
};

export const STATES = [
  'walk', 'run', 'idle', 'sit', 'sleep', 'dance', 'scratch', 'jump', 'happy', 'eat',
  'stretch', 'groom', 'pounce', 'knead', 'loaf', 'yawn', 'startle',
  'waddle', 'bamboo', 'roll',
  // v3.5 funny pack
  'sneeze', 'hairball', 'zoomies', 'laser',
  // v3.6 living-on-your-machine pack
  'stalk', 'bop', 'mope', 'nuzzle', 'investigate', 'sniff', 'curl',
];

const TAU = Math.PI * 2;

// deterministic pseudo-random from a number
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------- helpers
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// tapered capsule between two points
function limb(ctx, x1, y1, x2, y2, r1, r2, fill) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.closePath();
}

function radialFill(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function shade(hex, amt) {
  // amt -1..1 : darken / lighten
  if (!hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------------------------------------------------------------- pose model
// Legs: [frontNear, frontFar, backNear, backFar]; 2-bone IK from shoulder/hip to foot.
function solveIK(hx, hy, fx, fy, l1, l2, bendDir) {
  const dx = fx - hx, dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = (l1 + l2) * 0.999, min = Math.abs(l1 - l2) * 1.001 + 0.01;
  d = Math.min(max, Math.max(min, d));
  const a = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = a + bendDir * Math.acos(Math.min(1, Math.max(-1, cosA)));
  return { kx: hx + Math.cos(ang) * l1, ky: hy + Math.sin(ang) * l1 };
}

// ---------------------------------------------------------------- main draw
// opts: { t, state='walk', dir=1, breed='grey_tabby', scale=1, alpha=1, jumpP=0.5 }
export function drawCat(ctx, opts) {
  const t = opts.t || 0;
  const state = opts.state || 'walk';
  const dir = opts.dir >= 0 ? 1 : -1;
  const pal = PALETTES[opts.breed] || PALETTES.grey_tabby;
  const B = BODIES[pal.body] || BODIES.normal;
  const scale = opts.scale || 1;
  const jumpP = opts.jumpP ?? 0.5;

  ctx.save();
  ctx.scale(dir * scale, scale);
  ctx.globalAlpha = opts.alpha ?? 1;

  const P = poseFor(state, t, jumpP, B, pal, opts.stateT || 0);
  // v3.17 DANCE SIDE-STEPS: the whole sprite (shadow included) shifts inside
  // the window — step right / step left now TRAVEL, they don't just rock
  if (P.bodyX) ctx.translate(P.bodyX, 0);
  const bodyY = B.standY + P.bodyY + P.bobY;
  const sqx = 1 + P.sqx, sqy = 1 + P.sqy;

  // ---------------- ground shadow (outside whole-body rotation)
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.filter = 'blur(2px)';
  ell(ctx, 2, 2, 46 * P.shadowK, 7 * P.shadowK);
  ctx.fill();
  ctx.restore();

  // whole-body rotation (panda somersault)
  if (P.wholeRot) {
    ctx.translate(0, bodyY);
    ctx.rotate(P.wholeRot);
    ctx.translate(0, -bodyY);
  }

  const shoulder = { x: B.sh[0], y: bodyY - B.sh[1] };
  const hip = { x: B.hp[0], y: bodyY - B.hp[1] };
  // v3.15 HEAD-ATTACH FIX: the head anchor lives in BODY space, so it must
  // ride the same rotate+scale transform the torso gets (translate(0,bodyY)
  // → rotate(bodyRot) → scale(sqx,sqy)). It used to be pinned in screen
  // space, so the first pose with a real pitch — the v3.14 rearing swat
  // (bodyRot −0.52) — left the head hanging ~24px behind the chest: "the
  // cat's head got separated when it tried to grab the butterfly".
  const bcos = Math.cos(P.bodyRot || 0), bsin = Math.sin(P.bodyRot || 0);
  const headC = {
    x: sqx * (B.head[0] * bcos - B.head[1] * bsin) + P.headX,
    y: bodyY + sqy * (B.head[0] * bsin + B.head[1] * bcos) + P.headY + Math.sin(t * 2.1) * 1.2,
    r: B.headR, rot: P.headRot,
  };
  const nearFill = pal.limbCol || pal.fur;
  const farFill = pal.limbCol ? shade(pal.limbCol, 0.24) : shade(pal.dark, 0.18);

  // ---------------- FAR legs (slightly darker; skipped when tucked or lifted)
  if (!P.hideLegs) {
    if (P.legs[1]) drawLeg(ctx, shoulder.x, shoulder.y, P.legs[1], pal, farFill, -1, pal.dark, B, P.legK);
    if (P.legs[3]) drawLeg(ctx, hip.x, hip.y, P.legs[3], pal, farFill, -1, pal.dark, B, P.legK);
  }

  // ---------------- body (tail drawn INSIDE this transform so it stays
  // attached when the torso rotates/squashes — sleep curl, stretch, scratch)
  ctx.save();
  ctx.translate(0, bodyY);
  ctx.rotate(P.bodyRot);
  ctx.scale(sqx, sqy);

  drawTail(ctx, B.tail.base[0], B.tail.base[1], P, pal, t, B);

  const bodyGrad = radialFill(ctx, -10, -10, 6, B.rx + 12, [
    [0, shade(pal.fur, 0.22)],
    [0.55, pal.fur],
    [1, shade(pal.fur, -0.28)],
  ]);
  ell(ctx, 0, -8, B.rx, B.ry);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  // rear haunch volume
  ell(ctx, B.haunch[0], B.haunch[1], B.haunch[2], B.haunch[3]);
  ctx.fillStyle = radialFill(ctx, B.haunch[0] - 4, B.haunch[1] - 6, 3, B.haunch[2] + 2, [
    [0, shade(pal.fur, 0.16)], [1, shade(pal.fur, -0.2)],
  ]);
  ctx.fill();
  // chest volume
  ell(ctx, B.chest[0], B.chest[1], B.chest[2], B.chest[3]);
  ctx.fillStyle = radialFill(ctx, B.chest[0] - 2, B.chest[1] - 5, 2, B.chest[2] + 2, [
    [0, shade(pal.fur, 0.10)], [1, shade(pal.fur, -0.18)],
  ]);
  ctx.fill();

  // breed marks on body (clipped)
  ctx.save();
  ell(ctx, 0, -8, B.rx, B.ry);
  ctx.clip();
  if (pal.patches) {
    const [a, b] = pal.patches;
    for (const [cx, cy, rx2, ry2, rot, col, dk] of [
      [-14, -20, 16, 11, 0.3, a.c, a.dk], [12, -22, 13, 9, -0.4, b.c, b.dk],
      [-30, 2, 11, 9, 0.9, a.c, a.dk], [30, -6, 10, 12, 0.2, b.c, b.dk],
    ]) {
      ell(ctx, cx, cy, rx2, ry2, rot);
      const g = radialFill(ctx, cx - 3, cy - 3, 2, Math.max(rx2, ry2), [
        [0, col], [1, dk],
      ]);
      ctx.fillStyle = g; ctx.fill();
    }
  }
  if (pal.spots) {
    // bengal rosettes: dark ring, warm center
    for (const [cx, cy, rx2, ry2, rot] of [
      [-16, -18, 6.8, 5.2, 0.4], [4, -23, 6.2, 4.8, -0.3], [23, -13, 5.8, 4.6, 0.5],
      [-30, 1, 5.6, 4.4, 0.2], [12, 1, 5.2, 4.2, -0.4], [-4, 5, 4.8, 3.9, 0.3],
      [32, 4, 4.6, 3.8, 0.1],
    ]) {
      ell(ctx, cx, cy, rx2, ry2, rot);
      ctx.fillStyle = shade(pal.dark, -0.05); ctx.fill();
      ell(ctx, cx, cy, rx2 * 0.52, ry2 * 0.52, rot);
      ctx.fillStyle = shade(pal.fur, 0.10); ctx.fill();
    }
  }
  if (pal.band) {
    // panda shoulder band
    ell(ctx, 22, -3, 19, B.ry * 0.86, -0.12);
    ctx.fillStyle = pal.dark; ctx.fill();
  }
  if (pal.stripe && !pal.points) {
    ctx.strokeStyle = pal.stripe;
    ctx.globalAlpha *= 0.30;
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const sx = -B.rx * 0.44 + i * B.rx * 0.30;
      ctx.beginPath();
      ctx.moveTo(sx, -B.ry - 5);
      ctx.quadraticCurveTo(sx + 3, -20, sx - 1, -12);
      ctx.stroke();
    }
    ctx.globalAlpha /= 0.30;
  }
  if (pal.socks) {
    ell(ctx, 16, 2, B.rx * 0.58, B.ry * 0.72, -0.15);
    ctx.fillStyle = pal.belly; ctx.fill();
  } else {
    ctx.globalAlpha *= 0.55;
    ell(ctx, 10, 8, B.rx * 0.58, B.ry * 0.52, -0.1);
    ctx.fillStyle = pal.belly; ctx.fill();
    ctx.globalAlpha /= 0.55;
  }
  ctx.restore(); // clip

  // v3.18: a store DRESS covers the torso — drawn inside the body transform
  // so it rotates/squashes with the cat, before the near legs (which stay in
  // front of the skirt, like a real dress over legs).
  if (opts.dress && DRESSES.includes(opts.dress)) drawDress(ctx, opts.dress, B, P);   // v3.18 hard: unknown ids ignored (used to fall back to red)

  // rim light top
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(0, -8, B.rx - 2, B.ry - 1.6, 0, -Math.PI * 0.82, -Math.PI * 0.25);
  ctx.stroke();
  ctx.restore(); // body

  // ---------------- tucked paws (loaf / roll) OR near legs
  if (P.hideLegs) {
    ell(ctx, B.rx * 0.46, bodyY + B.ry * 0.40, 8, 5.5, 0.25);
    ctx.fillStyle = nearFill; ctx.fill();
    ell(ctx, B.rx * 0.12, bodyY + B.ry * 0.48, 7.5, 5, 0.35);
    ctx.fill();
  } else {
    if (P.legs[0]) drawLeg(ctx, shoulder.x, shoulder.y, P.legs[0], pal, nearFill, 1, pal.dark, B, P.legK);
    if (P.legs[2]) drawLeg(ctx, hip.x, hip.y, P.legs[2], pal, nearFill, 1, pal.dark, B, P.legK);
  }

  // ---------------- held / ground props (panda bamboo, cat fish)
  if (P.prop === 'bamboo') drawBamboo(ctx, P, t);
  else if (P.prop === 'fish') drawFish(ctx, P, t, B);
  else if (P.prop === 'hairball') drawHairball(ctx, P, t, B);

  // ---------------- head
  drawHead(ctx, headC, P, pal, t, state, B);

  // v3.15: the salute paw rides OVER the head (drawn last) so the pose reads
  // as a paw pressed to the brow instead of vanishing behind the face.
  // v3.18: the overlay paw IS a front paw that LIFTED — a null slot in
  // P.legs means that limb is airborne, riding overlayPaw instead, so the
  // cat keeps exactly FOUR limbs (v3.17 drew the raised paws AND the chest
  // paws at the same time: "when dancing why the cat has 6 legs").
  if (P.overlayPaw) {
    const paws = Array.isArray(P.overlayPaw) ? P.overlayPaw : [P.overlayPaw];
    for (const paw of paws) {
      drawLeg(ctx, shoulder.x, shoulder.y, paw, pal, nearFill, 1, pal.dark, B, P.legK);
      // v3.16: a soft rim so a raised paw reads against the face
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(paw.fx + 2, paw.fy - 4, 6.8, 5.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // v3.6: seasonal / skin hat, drawn in head-local space so it follows
  // head rotation and bob
  if (opts.hat && HATS.includes(opts.hat)) drawHat(ctx, opts.hat, headC);

  ctx.restore();
}

// ---------------------------------------------------------------- dresses
// v3.18: the Cat Store dresses. Procedural garment: bodice + A-line skirt
// with a hem band, waist sash and a per-style pattern, fitted to any body
// type from the B geometry (rx/ry). Drawn in BODY space (rotates with the
// torso), UNDER the near legs.
export const DRESSES = ['red', 'blue', 'pink', 'midnight'];

export const DRESS_STYLES = {
  red:      { base: '#d84a4a', dark: '#a83232', trim: '#f6e7c8', pattern: 'hearts' },
  blue:     { base: '#4a7fd8', dark: '#33619f', trim: '#e8f1fb', pattern: 'stripes' },
  pink:     { base: '#e88ab0', dark: '#c06288', trim: '#fdf1f6', pattern: 'dots' },
  midnight: { base: '#3a3a5c', dark: '#26263e', trim: '#8f8fc9', pattern: 'stars' },
};

export function drawDress(ctx, kind, B, P) {
  const D = DRESS_STYLES[kind] || DRESS_STYLES.red;
  const rx = B.rx, ry = B.ry;
  // skirt: A-line flare from the waist over the haunch, hem above the feet
  ctx.beginPath();
  ctx.moveTo(-rx * 0.88, -14);
  ctx.quadraticCurveTo(-rx * 1.16, 0, -rx * 0.98, 13);
  ctx.quadraticCurveTo(0, 18, rx * 0.98, 13);            // scalloped-ish hem
  ctx.quadraticCurveTo(rx * 1.16, 0, rx * 0.88, -14);
  ctx.closePath();
  ctx.fillStyle = D.base; ctx.fill();
  ctx.strokeStyle = D.dark; ctx.lineWidth = 1.4; ctx.stroke();
  // pattern clipped to the skirt
  ctx.save();
  ctx.clip();
  if (D.pattern === 'dots') {
    ctx.fillStyle = D.trim;
    for (const [px, py, pr] of [[-22, -2, 2.6], [-6, 4, 2.6], [12, -4, 2.6], [26, 4, 2.6], [-14, 9, 2.2], [6, 11, 2.2]]) {
      ctx.beginPath(); ctx.ellipse(px, py, pr, pr, 0, 0, TAU); ctx.fill();
    }
  } else if (D.pattern === 'stripes') {
    ctx.strokeStyle = D.trim; ctx.lineWidth = 2.4; ctx.globalAlpha *= 0.75;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(i * 11, -14); ctx.lineTo(i * 13, 14); ctx.stroke();
    }
    ctx.globalAlpha /= 0.75;
  } else if (D.pattern === 'hearts') {
    ctx.fillStyle = D.trim; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    for (const [px, py] of [[-20, 0], [0, 5], [20, -1]]) ctx.fillText('\u2665', px, py);
  } else if (D.pattern === 'stars') {
    ctx.fillStyle = D.trim;
    for (const [px, py, pr] of [[-24, -4, 1.7], [-8, 3, 1.4], [10, -6, 1.7], [24, 2, 1.4], [-16, 10, 1.2], [4, 12, 1.2]]) {
      ctx.beginPath(); ctx.ellipse(px, py, pr, pr, 0, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  // hem band
  ctx.beginPath();
  ctx.moveTo(-rx * 0.98, 11);
  ctx.quadraticCurveTo(0, 16, rx * 0.98, 11);
  ctx.strokeStyle = D.trim; ctx.lineWidth = 2.6; ctx.stroke();
  // waist sash + bow knot
  ctx.beginPath();
  ctx.moveTo(-rx * 0.9, -12);
  ctx.quadraticCurveTo(0, -6, rx * 0.9, -12);
  ctx.strokeStyle = D.dark; ctx.lineWidth = 4.4; ctx.stroke();
  ell(ctx, 0, -10, 4.6, 3.4, -0.3);
  ctx.fillStyle = D.trim; ctx.fill();
  // shoulder straps
  ctx.strokeStyle = D.base; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(rx * 0.28, -ry - 6); ctx.lineTo(rx * 0.44, -14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-rx * 0.18, -ry - 4); ctx.lineTo(-rx * 0.30, -14); ctx.stroke();
}

// ---------------------------------------------------------------- hats
// v3.6 seasonal accessories. Drawn around the head center (headC = {x,y,r,rot}).
export function drawHat(ctx, kind, headC) {
  const r = headC.r;
  ctx.save();
  ctx.translate(headC.x, headC.y);
  ctx.rotate(headC.rot || 0);
  if (kind === 'pumpkin') {
    // jack-o'-lantern perched between the ears
    ctx.save();
    ctx.translate(0, -r - 7);
    ctx.rotate(-0.14);
    ell(ctx, 0, 0, 13, 10); ctx.fillStyle = '#e07818'; ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(120,60,10,0.55)';
    for (const sx of [-6, 0, 6]) {
      ctx.beginPath(); ctx.ellipse(sx, 0, 4.4, 9.4, 0, 0, TAU); ctx.stroke();
    }
    rr(ctx, -2, -14.5, 4, 6, 1.6); ctx.fillStyle = '#5a7a2e'; ctx.fill();
    // carved face
    ctx.fillStyle = '#7a3c08';
    ell(ctx, -4.6, -1.4, 2.1, 2.7); ctx.fill();
    ell(ctx, 4.6, -1.4, 2.1, 2.7); ctx.fill();
    ctx.strokeStyle = '#7a3c08'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5.5, 4.2); ctx.lineTo(-2.5, 6.6); ctx.lineTo(0.5, 4.2); ctx.lineTo(3.5, 6.6); ctx.lineTo(5.5, 4.6);
    ctx.stroke();
    ctx.restore();
  } else if (kind === 'santa') {
    // red cap with white trim + pompom, flopping to one side
    ctx.save();
    ctx.translate(0, -r - 1);
    ctx.beginPath();
    ctx.moveTo(-r * 0.92, 2);
    ctx.quadraticCurveTo(-r * 0.42, -r * 1.18, r * 0.55, -r * 0.88);
    ctx.quadraticCurveTo(r * 0.98, -r * 0.72, r * 0.92, -r * 0.26);
    ctx.closePath();
    ctx.fillStyle = '#d8342c'; ctx.fill();
    rr(ctx, -r * 1.0, -2.5, r * 2.0, 7.5, 3.6);
    ctx.fillStyle = '#f6f4f0'; ctx.fill();
    ell(ctx, r * 0.94, -r * 0.3, 4.8, 4.8);
    ctx.fillStyle = '#f6f4f0'; ctx.fill();
    ctx.restore();
  } else if (kind === 'flower') {
    // spring flower crown: five little blossoms along the skull
    for (let i = -2; i <= 2; i++) {
      const a = -1.35 + i * 0.33;
      const fx = Math.cos(a) * (r * 0.92), fy = Math.sin(a) * (r * 0.92) - r * 0.34;
      ctx.save();
      ctx.translate(fx, fy);
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * TAU;
        ell(ctx, Math.cos(pa) * 3.2, Math.sin(pa) * 3.2, 2.2, 2.2);
        ctx.fillStyle = i % 2 ? '#f0a8c8' : '#f4d05a'; ctx.fill();
      }
      ell(ctx, 0, 0, 1.8, 1.8); ctx.fillStyle = '#fff6e0'; ctx.fill();
      ctx.restore();
    }
  } else if (kind === 'shades') {
    // summer mode: sunglasses over the eyes
    ctx.save();
    ctx.translate(0, -r * 0.16);
    ctx.fillStyle = '#1c1f26';
    rr(ctx, -r * 0.78, -4.6, r * 0.64, 9.2, 4.2); ctx.fill();
    rr(ctx, r * 0.14, -4.6, r * 0.64, 9.2, 4.2); ctx.fill();
    ctx.fillRect(-r * 0.17, -3.2, r * 0.34, 2.4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ell(ctx, -r * 0.55, -1.6, 2.7, 1.4, -0.4); ctx.fill();
    ell(ctx, r * 0.37, -1.6, 2.7, 1.4, -0.4); ctx.fill();
    ctx.restore();
  } else if (kind === 'tophat') {
    // v3.18 store hat: a tall black top hat with a red band
    ctx.save();
    ctx.translate(0, -r * 0.62);
    ctx.fillStyle = '#26262e';
    ell(ctx, 0, 6.5, r * 0.95, 3.4); ctx.fill();               // brim
    rr(ctx, -r * 0.58, -r * 0.85, r * 1.16, r * 0.95 + 7, 2.5); ctx.fill();  // crown
    ctx.fillStyle = '#b23a3a';
    ctx.fillRect(-r * 0.58, -2.4, r * 1.16, 5.2);              // band
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    rr(ctx, -r * 0.5, -r * 0.8, r * 0.22, r * 0.8, 2); ctx.fill();  // sheen
    ctx.restore();
  } else if (kind === 'crown') {
    // v3.18 store hat: a little gold crown pushed between the ears
    ctx.save();
    ctx.translate(0, -r * 0.78);
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, 4);
    ctx.lineTo(-r * 0.62, -4);
    ctx.lineTo(-r * 0.31, 0);
    ctx.lineTo(0, -7);
    ctx.lineTo(r * 0.31, 0);
    ctx.lineTo(r * 0.62, -4);
    ctx.lineTo(r * 0.62, 4);
    ctx.closePath();
    ctx.fillStyle = '#e8b83a'; ctx.fill();
    ctx.strokeStyle = '#b8862a'; ctx.lineWidth = 1.4; ctx.stroke();
    for (const [jx, jy, jc] of [[0, -1, '#e05a7a'], [-r * 0.36, 1.6, '#5a9fe0'], [r * 0.36, 1.6, '#5ac98a']]) {
      ell(ctx, jx, jy, 1.9, 1.9); ctx.fillStyle = jc; ctx.fill();
    }
    ctx.restore();
  } else if (kind === 'bow') {
    // v3.18 store hat: a big ribbon bow perched on the head
    ctx.save();
    ctx.translate(r * 0.1, -r * 0.9);
    ctx.rotate(-0.12);
    const bl = r * 0.52, bh = r * 0.34;
    ctx.fillStyle = '#e06a9a';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * bl * 0.6, -bh, s * bl, 0);
      ctx.quadraticCurveTo(s * bl * 0.6, bh * 0.9, 0, 0);
      ctx.closePath(); ctx.fill();
    }
    ell(ctx, 0, 0, bl * 0.2, bh * 0.34); ctx.fillStyle = '#c24a7e'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-bl * 0.9, -bh * 0.18); ctx.quadraticCurveTo(-bl * 0.4, -bh * 0.7, 0, -bh * 0.2); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- custom skins
// v3.6 community skins: a plain JSON file describing colors (and optionally a
// body type + pattern) on top of any built-in breed. registerSkin() folds the
// def into PALETTES under `custom:<id>` so the rest of the pipeline (store,
// brain, renderer, save file) treats it like any other breed.
export const CUSTOM_PREFIX = 'custom:';

export function validateSkinDef(def) {
  if (!def || typeof def !== 'object') return 'not an object';
  if (typeof def.name !== 'string' || !def.name.trim()) return 'missing name';
  if (def.base && !(def.base in PALETTES)) return 'unknown base breed';
  if (def.body && !(def.body in BODIES)) return 'unknown body type';
  if (def.colors) {
    for (const [k, v] of Object.entries(def.colors)) {
      if (!['fur', 'dark', 'belly', 'stripe', 'earIn', 'nose', 'eye', 'pupil'].includes(k)) return 'unknown color key ' + k;
      if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) return 'bad color ' + k;
    }
  }
  if (def.pattern && !['none', 'spots'].includes(def.pattern)) return 'unknown pattern';
  if (def.hat && !HATS.includes(def.hat)) return 'unknown hat';
  return null;
}

export function registerSkin(def, id) {
  const err = validateSkinDef(def);
  if (err) return { ok: false, reason: err };
  const pid = CUSTOM_PREFIX + id;
  const base = PALETTES[def.base] || PALETTES.grey_tabby;
  const pal = { ...structuredClone(base), name: String(def.name).slice(0, 32), custom: true };
  const c = def.colors || {};
  for (const k of ['fur', 'dark', 'belly', 'stripe', 'earIn', 'nose', 'eye', 'pupil']) {
    if (typeof c[k] === 'string') pal[k] = c[k];
  }
  if (def.body) pal.body = def.body;
  if (def.pattern === 'spots' && !pal.spots) {
    pal.spots = [[-16, -18, 6.8, 5.2, 0.4], [4, -23, 6.2, 4.8, -0.3], [23, -13, 5.8, 4.6, 0.5],
                 [-30, 1, 5.6, 4.4, 0.2], [12, 1, 5.2, 4.2, -0.4]];
  }
  if (def.pattern === 'none') { pal.spots = null; pal.patches = null; }
  if (def.stripe === false) pal.stripe = null;
  PALETTES[pid] = pal;
  return { ok: true, id: pid, hat: def.hat || null };
}

// ---------------------------------------------------------------- pose
// v3.16: exported for unit tests — the dance phases are asserted directly
export { poseFor as poseForState };

function poseFor(state, t, jumpP, B, pal, stateT) {
  B = B || BODIES.normal;
  const panda = !!(pal && pal.pandaFace);
  const P = {
    bodyY: 0, bobY: 0, bodyRot: 0, sqx: 0, sqy: 0, shadowK: 1,
    headX: 0, headY: 0, headRot: 0, wholeRot: 0, hideLegs: false, prop: null, overlayPaw: null,
    bodyX: 0, legK: 1,           // v3.17: dance side-steps (whole-sprite x shift) + stubby dance legs
    earFlat: 0, noFace: false,   // v3.16: the Turn Around dance step shows the back of the head
    legs: [
      { fx: B.feet[0], fy: 0 }, { fx: B.feet[1], fy: 0 },   // front near/far
      { fx: B.feet[2], fy: 0 }, { fx: B.feet[3], fy: 0 },   // back near/far
    ],
    tailMode: 'sway', eyeState: 'open', mouth: 'closed',
    chewP: 0, fishBite: 0,
    particles: null,
  };
  const W = (f, ph) => Math.sin(t * f + ph);
  const F = B.feet, A = B.footAmp;

  switch (state) {
    case 'walk': {
      const f = 7.0;
      P.legs[0].fx = F[0] + W(f, 0) * A;         P.legs[0].fy = -Math.max(0, Math.sin(t * f + Math.PI / 2)) * 6;
      P.legs[1].fx = F[1] + W(f, Math.PI) * A;   P.legs[1].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.5)) * 6;
      P.legs[2].fx = F[2] + W(f, Math.PI * 1.15) * (A + 1); P.legs[2].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.65)) * 6;
      P.legs[3].fx = F[3] + W(f, Math.PI * 0.15) * (A + 1); P.legs[3].fy = -Math.max(0, Math.sin(t * f + Math.PI * 0.65)) * 6;
      P.bobY = -Math.abs(W(f, 0)) * 2.2;
      P.bodyRot = W(f, Math.PI / 2) * 0.02;
      break;
    }
    case 'run': {
      const f = 12.5;
      P.legs[0].fx = F[0] + W(f, 0) * A * 1.7;  P.legs[0].fy = -Math.max(0, Math.sin(t * f + 1.7)) * 11;
      P.legs[1].fx = F[1] + W(f, Math.PI) * A * 1.7; P.legs[1].fy = -Math.max(0, Math.sin(t * f + 1.7 + Math.PI)) * 11;
      P.legs[2].fx = F[2] + W(f, Math.PI * 1.2) * (A + 8); P.legs[2].fy = -Math.max(0, Math.sin(t * f + 1.2 + Math.PI * 1.5)) * 12;
      P.legs[3].fx = F[3] + W(f, Math.PI * 0.2) * (A + 8); P.legs[3].fy = -Math.max(0, Math.sin(t * f + 1.2 + Math.PI * 0.5)) * 12;
      P.bobY = -Math.abs(W(f, 0)) * 5;
      P.sqx = W(f * 0.5, 0) * 0.05; P.sqy = -P.sqx;
      P.bodyRot = 0.06 + W(f, 1) * 0.03;
      P.tailMode = 'stream';
      break;
    }
    case 'idle': {
      P.bobY = Math.sin(t * 2.1) * 0.8;
      P.eyeState = 'blink';
      break;
    }
    case 'sit': {
      P.bodyY = 4; P.bodyRot = 0.10;
      P.sqx = -0.04; P.sqy = 0.05;
      P.legs[2].fx = F[2] + 8; P.legs[2].fy = -2;
      P.legs[3].fx = F[3] + 10; P.legs[3].fy = -2;
      P.legs[0].fx = F[0] + 2; P.legs[1].fx = F[1] + 1;
      P.tailMode = 'curl';
      P.eyeState = 'blink';
      P.bobY = Math.sin(t * 1.7) * 0.7;
      break;
    }
    case 'sleep': {
      if (panda) {
        // pandas nap sprawled on side or belly (research) — flat-out flop
        P.bodyY = 24; P.bodyRot = 0.03;
        P.sqx = 0.10; P.sqy = -0.20;
        P.legs[0].fx = F[0] + 12; P.legs[0].fy = 0;
        P.legs[1].fx = F[1] + 16; P.legs[1].fy = -2;
        P.legs[2].fx = F[2] + 14; P.legs[2].fy = 0;
        P.legs[3].fx = F[3] + 18; P.legs[3].fy = -2;
        P.hideLegs = true;
        P.headX = -8; P.headY = 19; P.headRot = 0.20;
        P.tailMode = 'wrap';
        P.eyeState = 'closed';
        P.particles = { kind: 'z', f: 1.1 };
        break;
      }
      P.bodyY = 18; P.bodyRot = 0.16;
      P.sqx = -0.10; P.sqy = 0.12;
      P.legs[0].fx = F[0] - 4; P.legs[0].fy = -2;
      P.legs[1].fx = F[1] - 6; P.legs[1].fy = -2;
      P.legs[2].fx = F[2] + 12; P.legs[2].fy = -2;
      P.legs[3].fx = F[3] + 14; P.legs[3].fy = -2;
      P.headX = -14; P.headY = 12; P.headRot = 0.18;
      P.tailMode = 'wrap';
      P.eyeState = 'closed';
      P.particles = { kind: 'z', f: 1.1 };
      break;
    }
    case 'dance': {
      // v3.17 THE SIX-STEP ROUTINE — matched to the reference sheet STEP BY
      // STEP and rebuilt on the user's notes: the legs are STUBBY now
      // (legK 0.74 — short thick kitten legs, not stretched stilts), the
      // body sits LOW and round, and steps 1-2 really TRAVEL (bodyX shifts
      // the whole sprite +-13px instead of rocking in place — "moving both
      // sides but stuck at one place"). Every oscillator completes whole
      // half-cycles per phase, so sin(...) is 0 at every boundary: no more
      // frame-zero pose snaps (the v3.16 flicker).
      //   1 Step Right · 2 Step Left · 3 Hands Up · 4 Turn Around ·
      //   5 Shake Tail · 6 Finish! (happy squint, paw by the cheek)
      const st = stateT || 0;
      P.particles = { kind: 'sparkle', f: 5 };
      const smooth = q => { const c = Math.min(1, Math.max(0, q)); return c * c * (3 - 2 * c); };
      // shared compact stand: torso pitched up onto SHORT folded hind legs,
      // feet tucked under the haunch, round chubby silhouette
      const stand = lean => {
        P.bodyY = 4;
        P.bodyRot = -0.52 + lean;
        P.sqx = 0.05; P.sqy = -0.06;
        P.legK = 0.74;                                    // stubby legs
        P.legs[2].fx = F[2] + 7; P.legs[2].fy = -1;       // feet tucked UNDER the body
        P.legs[3].fx = F[3] + 7; P.legs[3].fy = -1;
        P.headY = -4; P.headX = 6;
      };
      if (st < 1.7) {
        // 1 STEP RIGHT: one full bounce; the sprite actually GLIDES right
        // 13px while the near hind paw kicks out on the beat
        const f = 2 * Math.PI / 1.7, w = Math.sin(st * f);
        stand(0.09 * w);
        P.bodyX = 13 * smooth(st / 1.7);
        P.bobY = -Math.abs(w) * 3.2;
        P.legs[2].fx = F[2] + 7 + Math.max(0, w) * 18;
        P.legs[2].fy = -1 - Math.max(0, w) * 11;
        P.legs[3].fy = -1 - Math.max(0, -w) * 7;
        P.legs[0].fx = F[0] + 12 + w * 3; P.legs[0].fy = -33 - Math.max(0, w) * 6;
        P.legs[1].fx = F[1] + 7 - w * 3; P.legs[1].fy = -29 - Math.max(0, -w) * 6;
        P.headRot = 0.09 * w;
        P.tailMode = 'sway'; P.eyeState = 'happy';
      } else if (st < 3.4) {
        // 2 STEP LEFT: mirror — glide from +13 through 0 to -13 while the
        // near hind paw swings BACK and the far paw taps behind
        const st2 = st - 1.7, f = 2 * Math.PI / 1.7, w = Math.sin(st2 * f);
        stand(-0.09 * w);
        P.bodyX = 13 - 26 * smooth(st2 / 1.7);
        P.bobY = -Math.abs(w) * 3.2;
        P.legs[2].fx = F[2] + 7 - Math.max(0, w) * 24;
        P.legs[2].fy = -1 - Math.max(0, w) * 12;
        P.legs[3].fy = -1 - Math.max(0, -w) * 7;
        P.legs[0].fx = F[0] + 12 + w * 3; P.legs[0].fy = -33 - Math.max(0, -w) * 6;
        P.legs[1].fx = F[1] + 7 - w * 3; P.legs[1].fy = -29 - Math.max(0, w) * 6;
        P.headRot = -0.09 * w;
        P.tailMode = 'sway'; P.eyeState = 'happy';
      } else if (st < 5.6) {
        // 3 HANDS UP: the raised paws ARE the front paws — legs[0]/legs[1]
        // go NULL so the cat keeps FOUR limbs (the reference sheet shows no
        // spare paws at chest height). They LIFT continuously from the
        // chest-height hand-off (where steps 1-2 leave them), hover OVER
        // the ears for the beat bounce, then LOWER back to the hand-off so
        // the spin takes them seamlessly.
        const st3 = st - 3.4;
        stand(0);
        P.bodyX = -13 * (1 - smooth(st3 / 0.6));
        P.legs[0] = null; P.legs[1] = null;
        const RISE = 0.9, HOLD = 1.5;
        const g = st3 < RISE ? smooth(st3 / RISE)
                : st3 < HOLD ? 1
                : 1 - smooth((st3 - HOLD) / (2.2 - HOLD));
        const w = st3 > RISE && st3 < HOLD ? Math.sin(st3 * Math.PI * 3) : 0;
        P.bobY = -Math.abs(w) * 6.5;
        P.overlayPaw = [
          { fx: (F[0] + 12) + (-2 - (F[0] + 12)) * g + w * 3,           // near paw → left ear
            fy: -33 + (-112 + 33) * g - Math.max(0, w) * 5 },
          { fx: (F[1] + 7) + (40 - (F[1] + 7)) * g - w * 3,             // far paw → right ear
            fy: -29 + (-106 + 29) * g - Math.max(0, -w) * 5 },
        ];
        P.headY = -6; P.headRot = w * 0.04;
        P.tailMode = 'spiral'; P.eyeState = 'open';
      } else if (st < 7.6) {
        // 4 TURN AROUND: one quick full spin on the toes, then the BACK is
        // held to the viewer (noFace — ears and the back of the head only)
        const st4 = st - 5.6;
        stand(0);
        if (st4 < 0.95) {
          const q = st4 / 0.95;
          const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
          P.wholeRot = e * Math.PI * 2;
          P.bodyY = 4 - 5 * Math.sin(q * Math.PI);
          P.legs[0].fx = F[0] + 12; P.legs[0].fy = -33 + q * 3;
          P.legs[1].fx = F[1] + 7; P.legs[1].fy = -29 + q * 3;
          P.tailMode = 'stream'; P.eyeState = 'open';
        } else {
          P.noFace = true;
          P.bobY = -Math.abs(Math.sin((st4 - 0.95) * 4.6)) * 2;
          P.legs[0].fx = F[0] + 12; P.legs[0].fy = -30;
          P.legs[1].fx = F[1] + 7; P.legs[1].fy = -26;
          P.tailMode = 'wrap'; P.eyeState = 'open';
        }
      } else if (st < 9.4) {
        // 5 SHAKE TAIL: the tail whips in big fast arcs; the face comes
        // back around part-way through
        const st5 = st - 7.6, f = 4 * Math.PI / 1.8, w = Math.sin(st5 * f);
        stand(0.04 * w);
        P.noFace = st5 < 0.8;
        P.tailMode = 'whip';
        P.legs[0].fx = F[0] + 12; P.legs[0].fy = -30 + w * 5;
        P.legs[1].fx = F[1] + 7; P.legs[1].fy = -26 - w * 5;
        P.eyeState = st5 < 0.8 ? 'open' : 'happy';
      } else {
        // 6 FINISH!: happy squint, the NEAR paw rises BY THE CHEEK — it IS
        // the near front leg (legs[0] null, no planted copy), lifting from
        // the phase-5 hand-off; head tilt easing in, a heart
        const st6 = st - 9.4;
        stand(-0.06 * Math.min(1, st6 / 0.5));
        P.legs[1].fx = F[1] + 7; P.legs[1].fy = -26;
        P.legs[0] = null;
        const g6 = smooth(Math.min(1, st6 / 0.7));
        P.overlayPaw = {
          fx: (F[0] + 12) + (F[0] + 1 - (F[0] + 12)) * g6,
          fy: -30 + (-78 + 30) * g6 + (st6 > 0.7 ? Math.sin(st6 * 8) * 3 : 0),
        };
        P.headRot = 0.14 * Math.min(1, st6 / 0.5);
        P.tailMode = 'spiral'; P.eyeState = 'happy';
        P.particles = { kind: 'heart', f: 3 };
      }
      break;
    }
    case 'scratch': {
      const f = 10.5;
      P.bodyY = -6; P.bodyRot = -0.16;
      P.legs[2].fx = F[2] + 4; P.legs[2].fy = -4;
      P.legs[3].fx = F[3] + 6; P.legs[3].fy = -4;
      P.legs[0].fx = F[0] + 6 + W(f, 0) * 7; P.legs[0].fy = -26 + Math.abs(W(f, 0)) * 8;
      P.legs[1].fx = F[1] + 4 + W(f, Math.PI) * 7; P.legs[1].fy = -26 + Math.abs(W(f, Math.PI)) * 8;
      P.headRot = -0.08 + W(f, 0) * 0.06;
      P.tailMode = 'stream';
      P.particles = { kind: 'chip', f: 9 };
      break;
    }
    case 'jump': {
      const p = Math.min(1, Math.max(0, jumpP));
      const stretch = Math.sin(p * Math.PI);
      P.sqx = -stretch * 0.12 + (p > 0.85 ? 0.10 : 0);
      P.sqy = stretch * 0.14 - (p > 0.85 ? 0.10 : 0);
      P.legs[0].fy = -8 - stretch * 14; P.legs[1].fy = -8 - stretch * 14;
      P.legs[2].fy = -4 - stretch * 16; P.legs[3].fy = -4 - stretch * 16;
      P.legs[0].fx = F[0] + 4; P.legs[1].fx = F[1] + 4;
      P.legs[2].fx = F[2] + 4; P.legs[3].fx = F[3] + 4;
      P.bodyRot = -0.10 + p * 0.06;
      P.tailMode = 'stream';
      break;
    }
    case 'happy': {
      P.bobY = -Math.abs(Math.sin(t * 5)) * 5;
      P.legs[0].fy = -Math.max(0, Math.sin(t * 5)) * 10;
      P.legs[1].fy = -Math.max(0, Math.sin(t * 5 + Math.PI)) * 10;
      P.tailMode = 'spiral';
      P.eyeState = 'happy';
      P.particles = { kind: 'heart', f: 3 };
      break;
    }
    case 'eat': {
      // v3.2 proper eating: a fish lies on the ground; each 1.4s cycle the cat
      // dips its head, BITES a chunk off (fish shrinks), then chews side-to-side
      // with working cheeks and swallows. 3 bites + a satisfied gulp.
      const cyc = t % 1.4;
      const biteN = Math.min(3, Math.floor(t / 1.4));
      P.bodyY = 2;
      P.prop = biteN < 3 ? 'fish' : null;
      P.fishBite = biteN;
      if (cyc < 0.5) {                    // stalk the fish and bite
        const d = cyc / 0.5;
        P.headY = 8 + d * 11; P.headX = 2; P.headRot = 0.20 + d * 0.16;
        P.eyeState = 'open';
        P.mouth = d > 0.70 ? 'bite' : 'open';
        P.tailMode = 'sway';
      } else if (cyc < 1.18) {            // chew: side-to-side jaw, cheeks working
        const d = (cyc - 0.5) / 0.68;
        P.headY = 19 - d * 8; P.headX = 2; P.headRot = 0.36 - d * 0.12;
        P.mouth = 'chew';
        P.chewP = Math.sin(t * 11.5);
        P.eyeState = 'closed';
        P.particles = { kind: 'crumb', f: 2 };
        P.tailMode = 'curl';
      } else {                            // swallow, satisfied blink
        P.headY = 11; P.headRot = 0.24;
        P.mouth = 'closed';
        P.eyeState = 'blink';
        P.tailMode = 'curl';
      }
      break;
    }
    // ---------------- v3.1 new actions ----------------
    case 'stretch': {   // downward-dog stretch: front low, rear up
      const breathe = W(1.3, 0) * 0.015;
      P.bodyY = 4; P.bodyRot = -0.30 + breathe;
      P.sqx = 0.06; P.sqy = -0.05;
      P.legs[0].fx = F[0] + 16; P.legs[0].fy = -2;
      P.legs[1].fx = F[1] + 14; P.legs[1].fy = -2;
      P.legs[2].fx = F[2] + 6; P.legs[2].fy = -8;
      P.legs[3].fx = F[3] + 6; P.legs[3].fy = -8;
      P.headY = 12; P.headRot = 0.14;
      P.tailMode = 'curl';
      P.eyeState = 'blink';
      break;
    }
    case 'groom': {     // sitting, licking a raised front paw
      const f = 3.2;
      const d = Math.max(0, Math.sin(t * f));
      P.bodyY = 6; P.bodyRot = 0.12;
      P.sqx = -0.05; P.sqy = 0.04;
      P.legs[2].fx = F[2] + 8; P.legs[2].fy = -2;
      P.legs[3].fx = F[3] + 10; P.legs[3].fy = -2;
      P.legs[0].fx = F[0] - 2; P.legs[0].fy = -18 - d * 6;  // raised paw
      P.legs[1].fx = F[1] + 2; P.legs[1].fy = -2;
      P.headY = 4 + d * 6; P.headX = 4; P.headRot = 0.30 + d * 0.20;
      P.mouth = d > 0.62 ? 'open' : 'closed';
      P.eyeState = 'closed';
      P.tailMode = 'curl';
      break;
    }
    case 'pounce': {    // play-crouch, butt-wiggle, then a little leap
      const cyc = (t % 1.7) / 1.7;
      if (cyc < 0.55) {
        const wig = Math.sin(t * 22) * 0.045 * Math.min(1, cyc * 3);
        P.bodyY = 8; P.bodyRot = -0.10;
        P.sqx = -0.06 + wig; P.sqy = 0.08;
        P.legs[0].fx = F[0] + 2; P.legs[0].fy = -4;
        P.legs[1].fx = F[1] + 2; P.legs[1].fy = -4;
        P.legs[2].fx = F[2] + 6; P.legs[2].fy = -2;
        P.legs[3].fx = F[3] + 6; P.legs[3].fy = -2;
        P.headY = 4; P.headRot = -0.06 + wig * 2;
        P.tailMode = 'spiral';
      } else {
        const q = (cyc - 0.55) / 0.45;
        const arc = Math.sin(q * Math.PI);
        P.bodyY = 8 - arc * 24;
        P.bodyRot = -0.10 + q * 0.16;
        P.sqx = 0.05; P.sqy = -0.04;
        P.legs[0].fx = F[0] + 6; P.legs[0].fy = -10 - arc * 10;
        P.legs[1].fx = F[1] + 6; P.legs[1].fy = -10 - arc * 10;
        P.legs[2].fx = F[2] + 10; P.legs[2].fy = -6 - arc * 8;
        P.legs[3].fx = F[3] + 10; P.legs[3].fy = -6 - arc * 8;
        P.tailMode = 'stream';
      }
      P.eyeState = 'open';
      break;
    }
    case 'knead': {     // making biscuits: alternating paw presses
      const f = 2.6;
      const s = Math.sin(t * f);
      P.bodyY = 4; P.bodyRot = 0.08;
      P.sqx = -0.04; P.sqy = 0.05;
      P.legs[2].fx = F[2] + 8; P.legs[2].fy = -2;
      P.legs[3].fx = F[3] + 10; P.legs[3].fy = -2;
      P.legs[0].fx = F[0] - 6; P.legs[0].fy = -10 - Math.max(0, s) * 5;
      P.legs[1].fx = F[1] - 4; P.legs[1].fy = -10 - Math.max(0, -s) * 5;
      P.headY = 3; P.headRot = 0.10;
      P.tailMode = 'curl';
      P.eyeState = 'happy';
      P.bobY = Math.sin(t * f) * 0.6;
      break;
    }
    case 'loaf': {      // full loaf: legs tucked under
      P.bodyY = 14; P.bodyRot = 0.02;
      P.sqx = 0.06; P.sqy = -0.16;
      P.hideLegs = true;
      P.headX = -2; P.headY = 6; P.headRot = 0.06;
      P.tailMode = 'wrap';
      P.eyeState = 'blink';
      P.bobY = Math.sin(t * 1.6) * 0.5;
      break;
    }
    case 'yawn': {      // big slow yawn
      const cyc = (t % 2.4) / 2.4;
      const d = Math.sin(cyc * Math.PI);
      P.bodyY = 0;
      P.headY = -4 - d * 3; P.headRot = -0.12 - d * 0.10;
      P.mouth = d > 0.35 ? 'yawn' : 'closed';
      P.eyeState = 'closed';
      P.sqx = -d * 0.03; P.sqy = d * 0.04;
      P.legs[0].fy = -2; P.legs[1].fy = -2;
      break;
    }
    case 'startle': {   // jump-in-place, ears flat, fur puffed
      const cyc = (t % 0.7) / 0.7;
      const j = Math.sin(cyc * Math.PI);
      P.bodyY = -j * 16;
      P.sqx = -0.06 + (cyc < 0.2 ? 0.10 : 0);
      P.sqy = 0.06 + j * 0.05 - (cyc < 0.2 ? 0.10 : 0);
      P.legs[0].fy = -6 - j * 10; P.legs[1].fy = -6 - j * 10;
      P.legs[2].fy = -4 - j * 8; P.legs[3].fy = -4 - j * 8;
      P.earFlat = cyc < 0.55 ? 1 : 0;
      P.headY = -2; P.headRot = -0.08;
      P.tailMode = 'spiral';
      break;
    }
    // ---------------- v3.5 funny pack ----------------
    case 'zoomies': {   // the mad sprint: full gallop, ears pinned, dust trail
      const f = 16;
      P.legs[0].fx = F[0] + W(f, 0) * A * 1.9;  P.legs[0].fy = -Math.max(0, Math.sin(t * f + 1.7)) * 13;
      P.legs[1].fx = F[1] + W(f, Math.PI) * A * 1.9; P.legs[1].fy = -Math.max(0, Math.sin(t * f + 1.7 + Math.PI)) * 13;
      P.legs[2].fx = F[2] + W(f, Math.PI * 1.2) * (A + 10); P.legs[2].fy = -Math.max(0, Math.sin(t * f + 1.2 + Math.PI * 1.5)) * 14;
      P.legs[3].fx = F[3] + W(f, Math.PI * 0.2) * (A + 10); P.legs[3].fy = -Math.max(0, Math.sin(t * f + 1.2 + Math.PI * 0.5)) * 14;
      P.bobY = -Math.abs(W(f, 0)) * 6;
      P.bodyRot = 0.10 + W(f, 1) * 0.04;
      P.sqx = 0.04; P.sqy = -0.03;
      P.earFlat = 1;
      P.mouth = 'open';
      P.tailMode = 'stream';
      P.particles = { kind: 'dust', f: 2.2 };
      break;
    }
    case 'sneeze': {    // "ah... AH-CHOO!" — rear back, blast, dazed recover
      const cyc = (t % 1.6) / 1.6;
      if (cyc < 0.45) {           // wind-up: nose to the sky, everything pulls back
        const q = cyc / 0.45;
        P.headY = -q * 7; P.headRot = -q * 0.22;
        P.bodyY = -q * 2;
        P.sqx = -q * 0.03; P.sqy = q * 0.03;
        P.eyeState = 'closed';
      } else if (cyc < 0.62) {    // the blast
        P.headY = 6; P.headRot = 0.30;
        P.bodyY = 3; P.sqx = 0.06; P.sqy = -0.05;
        P.legs[0].fy = -4; P.legs[1].fy = -4;
        P.eyeState = 'closed';
        P.mouth = 'open';
        P.particles = { kind: 'achoo', f: 3 };
      } else {                    // dazed, one blink of regret
        const q = (cyc - 0.62) / 0.38;
        P.headY = 6 - q * 6; P.headRot = 0.30 - q * 0.30;
        P.eyeState = q > 0.7 ? 'blink' : 'closed';
        if (cyc < 0.8) P.particles = { kind: 'achoo', f: 3 };
      }
      P.earFlat = cyc < 0.62 ? 1 : 0;
      break;
    }
    case 'hairball': {  // cough-cough... and a tiny souvenir drops out
      const cyc = (t % 2.8) / 2.8;
      const cough = Math.abs(Math.sin(cyc * Math.PI * 4)) * (cyc < 0.7 ? 1 : 0.25);
      P.bodyY = 6 + cough * 4;
      P.bodyRot = 0.12;
      P.sqx = -0.05 + cough * 0.04; P.sqy = 0.07 - cough * 0.04;
      P.headY = 4 + cough * 2; P.headRot = 0.16 - cough * 0.10;
      P.legs[2].fx = F[2] + 8; P.legs[2].fy = -2;
      P.legs[3].fx = F[3] + 10; P.legs[3].fy = -2;
      P.legs[0].fx = F[0] + 2; P.legs[1].fx = F[1] + 1;
      P.tailMode = 'curl';
      P.eyeState = cyc > 0.75 ? 'happy' : 'closed';
      P.mouth = cough > 0.5 ? 'open' : 'closed';
      if (cyc > 0.62) P.prop = 'hairball';   // the drop + it sits there, judging
      break;
    }
    case 'laser': {     // stalking the red dot: low slink, locked eyes
      const f = 9;
      P.bodyY = 7; P.bodyRot = -0.07;
      P.sqx = -0.05; P.sqy = 0.06;
      P.legs[0].fx = F[0] + W(f, 0) * A * 0.8; P.legs[0].fy = -Math.max(0, Math.sin(t * f + Math.PI / 2)) * 5;
      P.legs[1].fx = F[1] + W(f, Math.PI) * A * 0.8; P.legs[1].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.5)) * 5;
      P.legs[2].fx = F[2] + W(f, Math.PI * 1.15) * A; P.legs[2].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.65)) * 4;
      P.legs[3].fx = F[3] + W(f, Math.PI * 0.15) * A; P.legs[3].fy = -Math.max(0, Math.sin(t * f + Math.PI * 0.65)) * 4;
      P.headY = 3; P.headRot = -0.05;
      P.tailMode = 'spiral';
      P.eyeState = 'open';
      break;
    }
    // ---------------- v3.6 living-on-your-machine actions ----------------
    case 'stalk': {     // crouched creep toward the idle cursor
      const f = 7.5;
      P.bodyY = 9; P.bodyRot = -0.10;
      P.sqx = -0.05; P.sqy = 0.07;
      if (t < 0.8) {    // aim phase: butt-wiggle
        const wig = Math.sin(t * 24) * 0.05;
        P.sqx = -0.06 + wig; P.sqy = 0.08;
        P.headY = 4; P.headRot = -0.06 + wig * 2;
        P.tailMode = 'spiral';
      } else {          // slinky creep
        P.legs[0].fx = F[0] + W(f, 0) * A * 0.75; P.legs[0].fy = -Math.max(0, Math.sin(t * f + Math.PI / 2)) * 4;
        P.legs[1].fx = F[1] + W(f, Math.PI) * A * 0.75; P.legs[1].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.5)) * 4;
        P.legs[2].fx = F[2] + W(f, Math.PI * 1.15) * A * 0.9; P.legs[2].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.65)) * 3;
        P.legs[3].fx = F[3] + W(f, Math.PI * 0.15) * A * 0.9; P.legs[3].fy = -Math.max(0, Math.sin(t * f + Math.PI * 0.65)) * 3;
        P.headY = 4; P.headRot = -0.08;
        P.tailMode = 'spiral';
      }
      P.eyeState = 'open';
      break;
    }
    case 'rear': {     // v3.14: rears onto the HIND legs and swats up at the
                       // butterfly with the FRONT paws — the real-cat catch
      const T = stateT || 0;
      const RISE = 0.30, SWAT1 = 0.55, SWAT1END = 0.72, SWAT2 = 0.90, SWAT2END = 1.07, DROP = 1.30;
      const k = Math.min(1, T / RISE);              // rise onto the haunches
      const up = k * k * (3 - 2 * k);               // smoothstep
      let pawNear = -52 * up, pawFar = -48 * up;
      let pawFxN = F[0] + 6 * up, pawFxF = F[1] + 5 * up;
      P.bodyY = -10 * up;                            // stands tall
      P.bodyRot = -0.52 * up;                        // torso pitches up
      P.sqx = -0.05 * up; P.sqy = 0.04 * up;
      // v3.15: the anchor now rides the pitched torso (head-attach fix), so
      // the offsets are small nudges — the head sits ON the raised chest,
      // gazing up at the prey (was: headY −15 to fake a rotation that never
      // moved the anchor, leaving a 24px gap at the neck).
      P.headY = -3 * up; P.headX = 4 * up; P.headRot = -0.40 * up;   // eyes on the prey
      P.legs[2].fx = F[2] - 2 * up; P.legs[3].fx = F[3] - 2 * up;     // hind paws planted
      P.tailMode = up > 0.5 ? 'stream' : 'spiral';   // tail out for balance
      P.eyeState = 'open';
      const swat = (w, t0, t1) => (w < t0 || w > t1) ? 0 : Math.sin(((w - t0) / (t1 - t0)) * Math.PI);
      const s1 = swat(T, SWAT1, SWAT1END);           // near paw swipes first
      const s2 = swat(T, SWAT2, SWAT2END);           // far paw takes its turn
      if (s1 > 0) {
        pawNear = -52 * up - s1 * 58; pawFxN = F[0] + 6 * up + s1 * 8;
        P.bodyRot = -0.52 * up - s1 * 0.06; P.sqy = 0.04 * up + s1 * 0.05;
      }
      if (s2 > 0) {
        pawFar = -48 * up - s2 * 62; pawFxF = F[1] + 5 * up + s2 * 9;
        P.bodyRot = -0.52 * up - s2 * 0.06; P.sqy = 0.04 * up + s2 * 0.05;
      }
      // between swats the paws hover at chest height, trembling with excitement
      const tremble = (T > SWAT1END && T < SWAT2) ? Math.sin(T * 40) * 2.2 : 0;
      P.legs[0].fx = pawFxN; P.legs[0].fy = pawNear + tremble;
      P.legs[1].fx = pawFxF; P.legs[1].fy = pawFar - tremble;
      P.mouth = (s1 > 0.4 || s2 > 0.4) ? 'open' : 'closed';
      if (T > SWAT2END && T <= DROP) P.bobY = Math.sin(T * 9) * 1.2;   // straining
      if (T > DROP) {                                // not caught — all fours again
        const q = Math.min(1, (T - DROP) / 0.4);
        const d = 1 - q * q;
        P.bodyY = -10 * d; P.bodyRot = -0.52 * d;
        P.headY = -3 * d; P.headX = 4 * d; P.headRot = -0.40 * d;
        P.sqx = -0.05 * d; P.sqy = 0.04 * d;
        P.legs[0].fx = F[0] + 6 * d; P.legs[0].fy = -52 * d;
        P.legs[1].fx = F[1] + 5 * d; P.legs[1].fy = -48 * d;
        P.tailMode = 'sway';
      }
      break;
    }
    case 'bop': {       // music playing: sway to the beat
      const f = 4.6;
      P.bodyRot = W(f, 0) * 0.09;
      P.sqx = W(f, 1) * 0.04; P.sqy = -P.sqx;
      P.bobY = -Math.abs(W(f, 0)) * 3;
      P.headRot = W(f, 0.7) * 0.12;
      P.headX = W(f, 0) * 2.2;
      P.eyeState = 'happy';
      break;
    }
    case 'mope': {      // red build: sad loaf, ears back, head down
      P.bodyY = 14; P.bodyRot = 0.02;
      P.sqx = 0.07; P.sqy = -0.17;
      P.hideLegs = true;
      P.headX = -5; P.headY = 11; P.headRot = 0.26;
      P.earFlat = 1;
      P.tailMode = 'wrap';
      P.eyeState = 'blink';
      P.bobY = Math.sin(t * 1.2) * 0.4;
      break;
    }
    case 'nuzzle': {    // companion head-rub: leaning in, rubbing cheeks
      const s = Math.sin(t * 6);
      P.bodyY = 4; P.bodyRot = 0.10;
      P.sqx = -0.04; P.sqy = 0.05;
      P.legs[2].fx = F[2] + 8; P.legs[2].fy = -2;
      P.legs[3].fx = F[3] + 10; P.legs[3].fy = -2;
      P.headX = 6 + s * 2; P.headY = 2 + Math.cos(t * 6) * 1.5; P.headRot = -0.12 + s * 0.08;
      P.eyeState = 'happy';
      P.tailMode = 'curl';
      break;
    }
    case 'investigate': { // purposeful walk, head up, on a mission
      const f = 7.0;
      P.legs[0].fx = F[0] + W(f, 0) * A; P.legs[0].fy = -Math.max(0, Math.sin(t * f + Math.PI / 2)) * 6;
      P.legs[1].fx = F[1] + W(f, Math.PI) * A; P.legs[1].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.5)) * 6;
      P.legs[2].fx = F[2] + W(f, Math.PI * 1.15) * (A + 1); P.legs[2].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.65)) * 6;
      P.legs[3].fx = F[3] + W(f, Math.PI * 0.15) * (A + 1); P.legs[3].fy = -Math.max(0, Math.sin(t * f + Math.PI * 0.65)) * 6;
      P.bobY = -Math.abs(W(f, 0)) * 2.2;
      P.headY = -2; P.headRot = -0.06;
      break;
    }
    case 'sniff': {     // arrived at the new thing: sit, nose down, "?"
      P.bodyY = 4; P.bodyRot = 0.10;
      P.sqx = -0.04; P.sqy = 0.05;
      P.legs[2].fx = F[2] + 8; P.legs[2].fy = -2;
      P.legs[3].fx = F[3] + 10; P.legs[3].fy = -2;
      P.headX = 7; P.headY = 8 + Math.sin(t * 5) * 1.2; P.headRot = 0.34;
      P.eyeState = 'open';
      P.tailMode = 'curl';
      break;
    }
    case 'curl': {      // low battery: curled up saving energy
      P.bodyY = 14; P.bodyRot = 0.04;
      P.sqx = 0.08; P.sqy = -0.18;
      P.hideLegs = true;
      P.headX = -4; P.headY = 9; P.headRot = 0.18;
      P.tailMode = 'wrap';
      P.eyeState = 'closed';
      P.bobY = Math.sin(t * 1.1) * 0.8;
      break;
    }
    // ---------------- panda-specific actions ----------------
    case 'waddle': {    // bear gait: slow, heavy, rolling; head sways with stride
      const f = 3.8;
      P.legs[0].fx = F[0] + W(f, 0) * A * 0.7;  P.legs[0].fy = -Math.max(0, Math.sin(t * f + Math.PI / 2)) * 4;
      P.legs[1].fx = F[1] + W(f, Math.PI) * A * 0.7; P.legs[1].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.5)) * 4;
      P.legs[2].fx = F[2] + W(f, Math.PI * 1.15) * A; P.legs[2].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.65)) * 4;
      P.legs[3].fx = F[3] + W(f, Math.PI * 0.15) * A; P.legs[3].fy = -Math.max(0, Math.sin(t * f + Math.PI * 0.65)) * 4;
      P.bobY = -Math.abs(W(f, 0)) * 4.4;
      P.bodyRot = W(f * 0.5, 0) * 0.085;
      P.sqx = W(f * 0.5, 1.2) * 0.05; P.sqy = -P.sqx;
      P.headRot = W(f * 0.5, 0.9) * 0.075;   // head leads the roll
      P.headX = W(f * 0.5, 0.9) * 2.2;
      break;
    }
    case 'bamboo': {
      // v3.2 research-backed: pandas feed SITTING UP, hooking the stalk toward
      // the mouth with curved paws and gnawing with loud sideways chews.
      const cyc = t % 1.6;
      P.bodyY = 8; P.bodyRot = 0.05;
      P.sqx = -0.03; P.sqy = 0.04;
      P.legs[2].fx = F[2] + 7; P.legs[2].fy = -2;
      P.legs[3].fx = F[3] + 9; P.legs[3].fy = -2;
      P.legs[0].fx = F[0] - 6; P.legs[0].fy = -16;   // both paws hook the stalk
      P.legs[1].fx = F[1] - 8; P.legs[1].fy = -12;
      if (cyc < 0.95) {                    // gnaw-gnaw-gnaw
        P.headY = 2; P.headX = 3;
        P.headRot = 0.14 + Math.sin(t * 9) * 0.05;
        P.mouth = 'chew'; P.chewP = Math.sin(t * 9);
        P.eyeState = 'happy';
      } else {                             // re-hook the stalk, take a bite
        P.headY = 3; P.headX = 2; P.headRot = 0.18;
        P.mouth = cyc < 1.25 ? 'bite' : 'closed';
        P.eyeState = 'happy';
      }
      P.prop = 'bamboo';
      P.particles = { kind: 'leaf', f: 2 };
      break;
    }
    case 'roll': {      // somersault: whole body rotates
      const cyc = (t % 1.5) / 1.5;
      const q = cyc < 0.15 ? 0 : cyc > 0.85 ? 1 : (cyc - 0.15) / 0.7;
      const e = q * q * (3 - 2 * q); // smoothstep
      P.wholeRot = e * Math.PI * 2;
      P.bodyY = -Math.sin(e * Math.PI) * 5;
      P.hideLegs = true;
      P.sqx = -0.06; P.sqy = 0.08;
      P.eyeState = 'happy';
      P.tailMode = 'wrap';
      break;
    }
  }
  return P;
}

// ---------------------------------------------------------------- legs
function drawLeg(ctx, ax, ay, foot, pal, fill, near, lineCol, B, legK = 1) {
  B = B || BODIES.normal;
  // v3.17: legK < 1 draws STUBBY legs — shorter limbs pull the feet toward
  // the hip, and the strokes fatten so they read as thick kitten legs
  const wf = 1 + (1 - legK) * 1.05;
  const l1 = B.legL1, l2 = B.legL2;
  const { kx, ky } = solveIK(ax, ay, foot.fx, foot.fy, l1, l2, -1);
  limb(ctx, ax, ay, kx, ky, 8.5 * wf, 6 * wf, fill);
  limb(ctx, kx, ky, foot.fx, foot.fy - 4, 6 * wf, 5 * wf, fill);
  ell(ctx, foot.fx + 2, foot.fy - 4, 6.5 * (1 + (1 - legK) * 0.4), 5 * (1 + (1 - legK) * 0.4));
  ctx.fillStyle = fill; ctx.fill();
  // toe hint
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * 0.35;
  ctx.strokeStyle = shade(lineCol, -0.1);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(foot.fx - 1, foot.fy - 7);
  ctx.lineTo(foot.fx + 1, foot.fy - 3);
  ctx.stroke();
  ctx.globalAlpha = ga;
  if (pal.socks && near > 0) {
    ell(ctx, foot.fx + 2, foot.fy - 4.5, 6.8, 5.2);
    ctx.fillStyle = pal.belly; ctx.fill();
  }
  if (pal.beans && near > 0) {
    // pink toe beans on the near paws (drawn over white socks)
    ctx.fillStyle = '#e89aa2';
    for (const [bxx, byy, br] of [[foot.fx - 2.2, foot.fy - 6.2, 1.35], [foot.fx + 1.2, foot.fy - 6.8, 1.35], [foot.fx + 4.2, foot.fy - 5.8, 1.2]]) {
      ell(ctx, bxx, byy, br, br * 0.85);
      ctx.fill();
    }
    ell(ctx, foot.fx + 1, foot.fy - 2.6, 2.7, 1.8);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- tail
function drawTail(ctx, bx, by, P, pal, t, B) {
  B = B || BODIES.normal;
  let base = pal.fur, tip = shade(pal.fur, 0.1);
  if (pal.points) { base = shade(pal.dark, 0.22); tip = pal.dark; }
  if (pal.patches) tip = pal.patches[0].c;
  if (pal.socks) tip = pal.dark;

  const segs = B.tail.segs;
  const mode = P.tailMode === ' spiral' ? 'spiral' : P.tailMode;
  // canvas +y is DOWN -> negative sin angle = tail points UP-back
  const CFG = {
    sway:   { a0: -2.45, bend: 0.052, waveF: 2.4, waveA: 0.10, kw: 2.2 },
    stream: { a0: -2.05, bend: -0.018, waveF: 9.0, waveA: 0.07, kw: 3.0 },
    spiral: { a0: -2.55, bend: -0.135, waveF: 6.2, waveA: 0.22, kw: 3.4 },
    curl:   { a0: -2.95, bend: 0.105, waveF: 1.5, waveA: 0.05, kw: 2.0 },
    wrap:   { a0: -3.05, bend: 0.055, waveF: 0.8, waveA: 0.04, kw: 1.6 },
    whip:   { a0: -1.35, bend: -0.30, waveF: 11.5, waveA: 0.52, kw: 1.1 },   // v3.16: dance "shake tail" — big fast arcs overhead
  };
  const cfg = CFG[mode] || CFG.sway;
  const pts = [];
  let x = bx, y = by;
  let ang = cfg.a0;
  for (let i = 0; i < segs; i++) {
    const k = i / (segs - 1);
    const w = Math.sin(t * cfg.waveF + k * cfg.kw) * cfg.waveA;
    ang += w * 0.55 + cfg.bend;
    const step = B.tail.step - k * 1.2;
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    pts.push({ x, y, k });
  }
  const radBase = pal.brushTail ? B.tail.r * 1.45 : B.tail.r; // somali brush tail
  const rad = k => radBase - k * (radBase - (pal.brushTail ? 4.0 : 2.8));
  for (let i = 0; i < segs - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    limb(ctx, p0.x, p0.y, p1.x, p1.y, rad(p0.k), rad(p1.k), base);
  }
  const tp = pts[segs - 1], tp1 = pts[segs - 2];
  limb(ctx, tp1.x, tp1.y, tp.x, tp.y, rad(tp1.k), rad(tp.k), tip);
  if (pal.stripe && !pal.points && !pal.patches) {
    const ga = ctx.globalAlpha;
    ctx.fillStyle = pal.stripe;
    ctx.globalAlpha = ga * 0.5;
    for (const i of [2, 4, 6]) {
      if (!pts[i]) continue;
      const p = pts[i];
      ell(ctx, p.x, p.y, 3.4, 3.0);
      ctx.fill();
    }
    ctx.globalAlpha = ga;
  }
}

// ---------------------------------------------------------------- head
function drawHead(ctx, C, P, pal, t, state, B) {
  B = B || BODIES.normal;
  ctx.save();
  ctx.translate(C.x, C.y);
  ctx.rotate(C.rot || 0);
  const r = C.r;
  const es = B.ear; // ear scale

  // ears
  const earTwitch = (Math.sin(t * 0.9) > 0.97 ? 0.12 : 0) +
    (state === 'dance' ? Math.sin(t * 12) * 0.05 : 0);
  const earFill = pal.earCol || (pal.points ? shade(pal.dark, 0.1) : pal.fur);
  for (const s of [-1, 1]) {
    ctx.save();
    // bear ears sit low and far to the side; cat ears perch on top
    ctx.translate(s * r * (pal.pandaFace ? 0.72 : 0.62), -r * (pal.pandaFace ? 0.58 : 0.78));
    ctx.rotate(s * (0.32 + earTwitch + P.earFlat * 0.55));
    if (pal.roundEars) {
      // panda: round circle ears
      const er = (pal.pandaFace ? 7.4 : 8.5) * es;
      ell(ctx, 0, -5 * es, er, er);
      const eg = radialFill(ctx, -2, -8, 2, 12 * es, [
        [0, shade(earFill, 0.14)], [1, earFill],
      ]);
      ctx.fillStyle = eg; ctx.fill();
    } else if (pal.foldEars) {
      // scottish fold: small ear folded forward — a soft low flap + crease
      ctx.beginPath();
      ctx.moveTo(-6.5 * es, 3 * es);
      ctx.quadraticCurveTo(-3.5 * es, -7.5 * es, 2.5 * es, -6 * es);
      ctx.quadraticCurveTo(7 * es, -2.5 * es, 6 * es, 4 * es);
      ctx.closePath();
      const eg = radialFill(ctx, 0, -3 * es, 2, 10 * es, [
        [0, shade(earFill, 0.12)], [1, shade(earFill, -0.18)],
      ]);
      ctx.fillStyle = eg; ctx.fill();
      ctx.strokeStyle = shade(earFill, -0.35);
      ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-3 * es, 1.5 * es);
      ctx.quadraticCurveTo(0, -4 * es, 4 * es, -2.5 * es);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-7 * es, 4 * es);
      ctx.quadraticCurveTo(-2 * es, -16 * es, 3 * es, -14 * es);
      ctx.quadraticCurveTo(8 * es, -6 * es, 7 * es, 5 * es);
      ctx.closePath();
      const eg = radialFill(ctx, 0, -6 * es, 2, 14 * es, [
        [0, shade(earFill, 0.12)], [1, shade(earFill, -0.2)],
      ]);
      ctx.fillStyle = eg; ctx.fill();
      // inner ear
      ctx.beginPath();
      ctx.moveTo(-3.5 * es, 2 * es);
      ctx.quadraticCurveTo(-1 * es, -9 * es, 2 * es, -8 * es);
      ctx.quadraticCurveTo(4.5 * es, -3 * es, 4 * es, 3 * es);
      ctx.closePath();
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * 0.9;
      ctx.fillStyle = pal.earIn; ctx.fill();
      ctx.globalAlpha = ga;
      // lynx tufts (maine coon)
      if (pal.tufts) {
        ctx.strokeStyle = shade(pal.fur, 0.28);
        ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        for (const [tx, ty, ex2, ey2] of [[-2, -14, -4, -21], [1, -15, 2, -23], [4, -13, 7, -19]]) {
          ctx.beginPath();
          ctx.moveTo(tx * es, ty * es);
          ctx.lineTo(ex2 * es, ey2 * es);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // skull
  const hg = radialFill(ctx, -r * 0.25, -r * 0.3, r * 0.15, r * 1.35, [
    [0, shade(pal.fur, 0.26)],
    [0.55, pal.fur],
    [1, shade(pal.fur, -0.26)],
  ]);
  ell(ctx, 0, 0, r, r * 0.94);
  ctx.fillStyle = hg; ctx.fill();

  // breed head marks (clipped to skull)
  ctx.save();
  ell(ctx, 0, 0, r, r * 0.94);
  ctx.clip();
  if (pal.patches) {
    const a = pal.patches[0], b = pal.patches[1];
    ell(ctx, -r * 0.45, -r * 0.45, r * 0.42, r * 0.36, 0.5);
    const g = radialFill(ctx, -r * 0.5, -r * 0.5, 2, r * 0.5, [[0, a.c], [1, a.dk]]);
    ctx.fillStyle = g; ctx.fill();
    ell(ctx, r * 0.5, -r * 0.55, r * 0.3, r * 0.26, -0.4);
    const g2 = radialFill(ctx, r * 0.5, -r * 0.55, 2, r * 0.36, [[0, b.c], [1, b.dk]]);
    ctx.fillStyle = g2; ctx.fill();
  }
  if (pal.points) {
    ell(ctx, r * 0.18, r * 0.28, r * 0.52, r * 0.42);
    const mg = radialFill(ctx, r * 0.1, r * 0.1, 3, r * 0.75, [
      [0, shade(pal.dark, 0.1)], [1, shade(pal.dark, -0.05)],
    ]);
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.75;
    ctx.fillStyle = mg; ctx.fill();
    ctx.globalAlpha = ga;
  }
  if (pal.spots) {
    for (const [dx, dy, sr] of [[-5, -r * 0.55, 2.2], [3, -r * 0.62, 1.8], [-11, -r * 0.4, 1.7]]) {
      ell(ctx, dx, dy, sr, sr * 0.85);
      ctx.fillStyle = shade(pal.dark, -0.02); ctx.fill();
    }
  }
  if (pal.blaze) {
    // white wedge from between the eyes down to the muzzle (mochi photo mark)
    ctx.beginPath();
    ctx.moveTo(-2.5, -r * 0.80);
    ctx.quadraticCurveTo(0, -r * 0.34, r * 0.30, r * 0.10);
    ctx.quadraticCurveTo(r * 0.48, r * 0.26, r * 0.40, r * 0.36);
    ctx.quadraticCurveTo(0, r * 0.46, -r * 0.32, r * 0.28);
    ctx.quadraticCurveTo(-r * 0.16, r * 0.02, -2.5, -r * 0.80);
    ctx.closePath();
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.92;
    ctx.fillStyle = pal.belly; ctx.fill();
    ctx.globalAlpha = ga;
  }
  if (pal.stripe && !pal.points) {
    ctx.strokeStyle = pal.stripe;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.4;
    ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const dx of [-6, 0, 6]) {
      ctx.beginPath();
      ctx.moveTo(dx - 3, -r * 0.86);
      ctx.quadraticCurveTo(dx, -r * 0.62, dx + (dx === 0 ? 0 : dx > 0 ? 3 : -3), -r * 0.55);
      ctx.stroke();
    }
    ctx.globalAlpha = ga;
  }
  if (pal.socks || true) {
    ell(ctx, r * 0.34, r * 0.30, r * 0.40, r * 0.34);
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.85;
    ctx.fillStyle = pal.belly; ctx.fill();
    ctx.globalAlpha = ga;
  }
  ctx.restore(); // clip

  // fluffy cheek fur (persian / ragdoll / maine coon)
  if (pal.fluffy) {
    ctx.fillStyle = pal.fur;
    for (const [ax, ay] of [[-r * 0.9, r * 0.35], [-r * 0.95, r * 0.1], [-r * 0.8, r * 0.55]]) {
      ell(ctx, ax, ay, 7, 5, hash(ax) * 3);
      ctx.fill();
    }
  }

  // v3.16 TURN AROUND (dance step 4): the back is held to the viewer — no
  // eyes, nose, mouth or whiskers; a soft darker cap reads as the back of
  // the head. Everything after this point is face.
  if (P.noFace) {
    ctx.save();
    ell(ctx, 0, 0, r, r * 0.94);
    ctx.clip();
    ell(ctx, -r * 0.06, -r * 0.04, r * 0.94, r * 0.86);
    ctx.globalAlpha *= 0.45;
    ctx.fillStyle = shade(pal.fur, -0.18);
    ctx.fill();
    ctx.globalAlpha /= 0.45;
    ctx.restore();
    ctx.restore();
    return;
  }

  // eyes
  const blink = P.eyeState === 'closed' ? 1 :
    P.eyeState === 'happy' ? 1 : (
      (Math.sin(t * 1.9) > 0.985 || Math.sin(t * 0.53 + 2.2) > 0.994) ? 1 : 0);
  // bear muzzle: dark fur around the nose & mouth (panda fact: black muzzle)
  if (pal.pandaFace) {
    ell(ctx, r * 0.38, r * 0.28, r * 0.30, r * 0.24);
    const mg = radialFill(ctx, r * 0.30, r * 0.20, 2, r * 0.42, [
      [0, shade(pal.dark, 0.42)], [1, shade(pal.dark, 0.10)],
    ]);
    ctx.fillStyle = mg; ctx.fill();
  }
  const es2 = pal.bigEye ? 1.34 : pal.pandaFace ? 1.22 : 1;   // eye scale
  for (const s of [-1, 1]) {
    const ex = s * 8.5 + r * 0.12, ey = -r * 0.12;
    // panda eye patches (behind the eyes) — bear ones are big and slant
    // down toward the cheeks
    if (pal.eyePatch) {
      if (pal.pandaFace) {
        ell(ctx, ex + s * 1.2, ey + 1.8, 8.6, 6.7, s * 0.38);
        ctx.fillStyle = pal.dark; ctx.fill();
        ell(ctx, ex + s * 4.0, ey + 5.0, 3.6, 4.4, s * 0.62);
        ctx.fill();
      } else {
        ell(ctx, ex, ey, 8.4, 6.6, s * 0.32);
        ctx.fillStyle = pal.dark; ctx.fill();
      }
    }
    if (P.eyeState === 'closed' || blink === 1) {
      ctx.strokeStyle = shade(pal.fur, -0.45);
      ctx.lineWidth = 2.2 * es2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 4.5 * es2, ey);
      ctx.quadraticCurveTo(ex, ey + (P.eyeState === 'happy' ? -3.5 * es2 : 2.5 * es2), ex + 4.5 * es2, ey);
      ctx.stroke();
      continue;
    }
    if (P.eyeState === 'happy') {
      ctx.strokeStyle = shade(pal.fur, -0.45);
      ctx.lineWidth = 2.4 * es2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 4.5 * es2, ey + 1);
      ctx.quadraticCurveTo(ex, ey - 4 * es2, ex + 4.5 * es2, ey + 1);
      ctx.stroke();
      continue;
    }
    // heterochromia: one blue + one green iris (snow angora)
    const irisBase = pal.hetero && s === 1 ? (pal.eye2 || pal.eye) : pal.eye;
    ell(ctx, ex, ey, 5.4 * es2, 4.6 * es2);
    ctx.fillStyle = '#f8f6f2'; ctx.fill();
    ell(ctx, ex + 1.2 * es2, ey, 3.6 * es2, 3.8 * es2);
    const ig = radialFill(ctx, ex + 0.6 * es2, ey - 0.8, 0.5, 4.2 * es2, [
      [0, shade(irisBase, 0.35)], [0.7, irisBase], [1, shade(irisBase, -0.4)],
    ]);
    ctx.fillStyle = ig; ctx.fill();
    ell(ctx, ex + 1.4 * es2, ey, 1.7 * es2, 3.0 * es2);
    ctx.fillStyle = pal.pupil; ctx.fill();
    ell(ctx, ex + 0.2, ey - 1.4 * es2, 1.1 * es2, 1.0 * es2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    // second sparkle for the plush big-eye look
    if (pal.bigEye) {
      ell(ctx, ex + 2.4 * es2, ey + 1.8 * es2, 0.8 * es2, 0.7 * es2);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    }
  }

  // blush cheeks (scottish fold / choco munchkin / sakura)
  if (pal.blush) {
    for (const s of [-1, 1]) {
      ell(ctx, s * 13.5 + r * 0.10, r * 0.32, 5.2, 3.1, s * 0.2);
      ctx.fillStyle = 'rgba(238,138,148,0.42)'; ctx.fill();
    }
  }

  // nose
  const nx = r * 0.52, ny = r * 0.22;
  ctx.fillStyle = pal.nose;
  ctx.beginPath();
  ctx.moveTo(nx - 3, ny - 2.2);
  ctx.lineTo(nx + 3, ny - 2.2);
  ctx.quadraticCurveTo(nx + 1.5, ny + 2.4, nx, ny + 2.6);
  ctx.quadraticCurveTo(nx - 1.5, ny + 2.4, nx - 3, ny - 2.2);
  ctx.closePath();
  ctx.fill();

  // mouth
  ctx.strokeStyle = shade(pal.fur, -0.42);
  ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  if (P.mouth === 'yawn') {
    // big wide-open yawn
    ell(ctx, nx - 1, ny + 9, 5.2, 8.5);
    ctx.fillStyle = shade(pal.tongue, -0.18); ctx.fill();
    ctx.strokeStyle = shade(pal.fur, -0.42); ctx.stroke();
    ell(ctx, nx - 1, ny + 12.5, 3.4, 4.4);
    ctx.fillStyle = pal.tongue; ctx.fill();
  } else if (P.mouth === 'open') {
    ell(ctx, nx - 1, ny + 7, 3.4, 4.2);
    ctx.fillStyle = pal.tongue; ctx.fill();
    ctx.stroke();
  } else if (P.mouth === 'bite') {
    // wide open bite: big dark maw + tongue + tiny teeth
    ell(ctx, nx - 1, ny + 8, 4.4, 6.4);
    ctx.fillStyle = '#5c3138'; ctx.fill();
    ctx.strokeStyle = shade(pal.fur, -0.42); ctx.stroke();
    ell(ctx, nx - 1, ny + 11, 3.1, 3.2);
    ctx.fillStyle = pal.tongue; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(nx - 4.2, ny + 3.4); ctx.lineTo(nx - 2.6, ny + 6.2); ctx.lineTo(nx - 1.4, ny + 3.6);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nx + 2.2, ny + 3.4); ctx.lineTo(nx + 0.8, ny + 6.2); ctx.lineTo(nx - 0.4, ny + 3.6);
    ctx.closePath(); ctx.fill();
  } else if (P.mouth === 'chew') {
    // side-to-side chew: jaw shifts with the phase, the near cheek bulges
    const cp = P.chewP || 0;
    ell(ctx, nx - 2 + cp * 1.6, ny + 6.4, 3.2 + Math.abs(cp) * 2.2, 2.9 + Math.abs(cp) * 1.5);
    ctx.fillStyle = shade(pal.fur, 0.14); ctx.fill();
    ctx.strokeStyle = shade(pal.fur, -0.42);
    ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(nx - 3.5 + cp * 2.4, ny + 5.2);
    ctx.quadraticCurveTo(nx - 1 + cp * 2.4, ny + 7.6, nx + 1.5 + cp * 2.4, ny + 5.6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(nx - 1, ny + 2.6);
    ctx.quadraticCurveTo(nx - 3.5, ny + 6.5, nx - 6.5, ny + 4.5);
    ctx.moveTo(nx - 1, ny + 2.6);
    ctx.quadraticCurveTo(nx + 1, ny + 6.8, nx + 4.5, ny + 4.2);
    ctx.stroke();
  }

  // whiskers
  ctx.strokeStyle = 'rgba(250,250,250,0.85)';
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 3; i++) {
    const wy = ny + 2 + i * 3.2;
    const wob = Math.sin(t * 3 + i) * 1.2;
    ctx.beginPath();
    ctx.moveTo(nx + 1, wy);
    ctx.quadraticCurveTo(nx + 12, wy - 2 + wob, nx + 22, wy - 5 + wob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nx - 5, wy);
    ctx.quadraticCurveTo(nx - 14, wy - 1 + wob * 0.6, nx - 21, wy - 3 + wob * 0.6);
    ctx.stroke();
  }

  // rim light skull top
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, r - 1.4, r * 0.94 - 1.4, 0, -Math.PI * 0.86, -Math.PI * 0.3);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------- particles
export function drawParticles(ctx, opts) {
  const t = opts.t || 0;
  const state = opts.state || 'idle';
  const scale = opts.scale || 1;
  const pal = PALETTES[opts.breed] || PALETTES.grey_tabby;
  const B = BODIES[pal.body] || BODIES.normal;
  const P = poseFor(state, t, opts.jumpP ?? 0.5, B, pal);
  if (!P.particles) return;
  ctx.save();
  ctx.scale(scale, scale);
  const { kind, f } = P.particles;
  if (kind === 'sparkle') {
    for (let i = 0; i < 5; i++) {
      const ph = (t * f * 0.35 + i * 0.37) % 1;
      const x = 40 + Math.sin(i * 2.7) * 42;
      const y = -95 - ph * 34;
      const s = (1 - ph) * 5 + 1;
      ctx.fillStyle = `rgba(255,236,150,${0.9 * (1 - ph)})`;
      star(ctx, x, y, s, s * 0.4, 4);
    }
  } else if (kind === 'heart') {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.4 + i * 0.33) % 1;
      const x = 44 + i * 10;
      const y = -92 - ph * 40;
      ctx.fillStyle = `rgba(240,110,130,${0.85 * (1 - ph)})`;
      heart(ctx, x, y, 4 + (1 - ph) * 3);
    }
  } else if (kind === 'z') {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.28 + i * 0.4) % 1;
      const x = 20 + i * 7 + ph * 10;
      const y = -55 - ph * 36;
      ctx.fillStyle = `rgba(190,200,220,${0.8 * (1 - ph)})`;
      ctx.font = `${10 + ph * 8}px system-ui`;
      ctx.fillText('z', x, y);
    }
  } else if (kind === 'chip') {
    for (let i = 0; i < 4; i++) {
      const ph = (t * f * 0.3 + i * 0.25) % 1;
      const x = 52 + ph * 26;
      const y = -70 + ph * 40;
      ctx.fillStyle = `rgba(180,150,110,${0.8 * (1 - ph)})`;
      ell(ctx, x, y, 2.2, 1.6, ph * 6);
      ctx.fill();
    }
  } else if (kind === 'crumb') {
    // fish-bite crumbs popping near the mouth while chewing
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.9 + i * 0.31) % 1;
      const x = 34 + i * 5 + Math.sin(t * 8 + i * 2) * 3;
      const y = -34 - (1 - ph) * 10 + ph * 14;
      ctx.fillStyle = `rgba(148,180,205,${0.85 * (1 - ph)})`;
      ell(ctx, x, y, 1.9, 1.5, ph * 5);
      ctx.fill();
    }
  } else if (kind === 'leaf') {
    // bamboo leaf bits drifting down while the panda munches
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.5 + i * 0.33) % 1;
      const x = 24 + i * 7 + Math.sin(t * 2 + i) * 4 + ph * 8;
      const y = -56 + ph * 48;
      ctx.fillStyle = `rgba(110,160,70,${0.85 * (1 - ph)})`;
      ell(ctx, x, y, 2.8, 1.5, ph * 5 + i);
      ctx.fill();
    }
  } else if (kind === 'dust') {
    // v3.5: dust puffs kicked up behind the zoomies sprint
    for (let i = 0; i < 4; i++) {
      const ph = (t * f * 0.5 + i * 0.25) % 1;
      const x = -44 - ph * 34 - i * 7;
      const y = -5 - Math.sin(ph * Math.PI) * 15;
      ctx.fillStyle = `rgba(205,195,175,${0.5 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(x, y, 3 + ph * 5.5, 0, TAU);
      ctx.fill();
    }
  } else if (kind === 'achoo') {
    // v3.5: the sneeze blast — a fan of droplets bursts from the nose
    for (let i = 0; i < 7; i++) {
      const ph = (t * f * 0.9 + i * 0.15) % 1;
      const ang = -0.62 + i * 0.21;
      const x = 34 + Math.cos(ang) * ph * 54;
      const y = -82 + Math.sin(ang) * ph * 46 + ph * 14;
      ctx.fillStyle = `rgba(80,160,230,${0.95 * (1 - ph * 0.7)})`;
      ell(ctx, x, y, Math.max(1.4, 4.4 - ph * 2.6), Math.max(1.4, 4.4 - ph * 2.6), 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ell(ctx, x - 0.8, y - 0.8, Math.max(0.6, 1.5 - ph), Math.max(0.6, 1.5 - ph), 0);
      ctx.fill();
    }
    // a little shock wedge right at the nose for the first third of the blast
    const ph0 = (t * f * 0.9) % 1;
    if (ph0 < 0.4) {
      ctx.fillStyle = `rgba(120,190,245,${0.8 * (1 - ph0 / 0.4)})`;
      ctx.beginPath();
      ctx.moveTo(30, -88);
      ctx.lineTo(52 + ph0 * 26, -102 - ph0 * 10);
      ctx.lineTo(52 + ph0 * 26, -66 + ph0 * 8);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- bamboo prop
function drawBamboo(ctx, P, t) {
  // stalk held between the front paws, leaning toward the face
  const munch = Math.max(0, Math.sin(t * 3.4)) * 1.6;
  ctx.save();
  ctx.translate(20, 0);
  ctx.rotate(-0.14);
  const g = ctx.createLinearGradient(0, 0, 0, -62);
  g.addColorStop(0, '#4c7a2e');
  g.addColorStop(1, '#7ab04a');
  ctx.fillStyle = g;
  rr(ctx, -2.6, -62, 5.2, 64, 2.4);
  ctx.fill();
  // segment joints
  ctx.fillStyle = 'rgba(28,48,16,0.4)';
  for (const yy of [-16, -34, -52]) ctx.fillRect(-2.6, yy, 5.2, 1.7);
  // leaves at the top
  ctx.fillStyle = '#5d9440';
  ell(ctx, 9, -58 - munch * 0.4, 9.5, 3.5, -0.5); ctx.fill();
  ell(ctx, -7, -54, 8.5, 3.1, 0.6); ctx.fill();
  ell(ctx, 7, -47, 7.5, 2.9, -0.3); ctx.fill();
  ctx.fillStyle = '#6ea44c';
  ell(ctx, -4, -62, 7, 2.7, 0.5); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- fish prop
function drawFish(ctx, P, t, B) {
  // a fish lying on the ground in front of the cat; shrinks as bites are taken
  B = B || BODIES.normal;
  const fx = B.feet[0] + 24;                  // just in front of the front paws
  const remain = 1 - P.fishBite / 3;          // 1 -> 2/3 -> 1/3 -> gone
  if (remain <= 0.01) return;
  const L = 26 * remain + 6;                  // body length shrinks per bite
  const flap = Math.sin(t * 7) * (0.14 + 0.1 * (1 - remain)); // fresher = livelier
  ctx.save();
  ctx.translate(fx, -4);
  ctx.rotate(flap * 0.4);
  const g = ctx.createLinearGradient(0, -6, 0, 5);
  g.addColorStop(0, '#9dbdd6'); g.addColorStop(1, '#6d92ad');
  ctx.fillStyle = g;
  ell(ctx, 0, 0, L * 0.5, 5.2 * remain + 2.2, -0.05);
  ctx.fill();
  // tail fin (falls off after the first bite — cats eat head-first, tail last)
  if (P.fishBite < 1) {
    ctx.beginPath();
    ctx.moveTo(-L * 0.5, 0);
    ctx.lineTo(-L * 0.5 - 8 * remain - 3, -5);
    ctx.lineTo(-L * 0.5 - 8 * remain - 3, 5);
    ctx.closePath();
    ctx.fill();
  }
  // head end + eye (bite marks on the rear once nibbled)
  ell(ctx, L * 0.42, -0.6, 2.6 * remain + 1.4, 3.1 * remain + 1.2);
  ctx.fillStyle = '#5d7f97'; ctx.fill();
  ell(ctx, L * 0.34, -1.6, 1.4, 1.4);
  ctx.fillStyle = '#1d2830'; ctx.fill();
  // dorsal shine
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(0, -1.6, L * 0.36, 2.4, -0.06, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- hairball prop
function drawHairball(ctx, P, t, B) {
  // the tiny souvenir: a fuzzy grey ball sitting in front of the paws
  B = B || BODIES.normal;
  const fx = B.feet[0] + 22;
  const squish = 1 + Math.sin(t * 2.2) * 0.03;
  ctx.save();
  ctx.translate(fx, -5);
  const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, 8);
  g.addColorStop(0, '#b9b3a8');
  g.addColorStop(1, '#8d867b');
  ctx.fillStyle = g;
  ell(ctx, 0, 0, 7 * squish, 6.2 / squish, 0.1);
  ctx.fill();
  // stray fuzz strands
  ctx.strokeStyle = 'rgba(150,142,130,0.8)';
  ctx.lineWidth = 1;
  for (const [a, l] of [[-1.2, 4], [0.5, 3.5], [2.2, 4.5], [3.6, 3]]) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 5.4);
    ctx.lineTo(Math.cos(a) * (6 + l), Math.sin(a) * (5.4 + l * 0.8));
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- emotes
// Floating game-style emote glyphs that pop in above the cat's head.
export const EMOTES = [
  'heart', 'love', 'note', 'question', 'exclaim', 'sweat',
  'angry', 'laugh', 'star', 'zzz', 'fish', 'bread',
  // v3.6
  'sad', 'battery', 'rainbow', 'cookie',
];

// v3.6 seasonal hats (opt-in via Settings → "Seasonal skins")
export const HATS = ['pumpkin', 'santa', 'flower', 'shades', 'tophat', 'crown', 'bow'];
export function seasonHat(month) {
  if (month === 9) return 'pumpkin';                 // October — jack-o'-lantern hours
  if (month === 11) return 'santa';                  // December — festive mode
  if (month === 2 || month === 3) return 'flower';   // Mar–Apr — spring bloom
  if (month >= 5 && month <= 7) return 'shades';     // Jun–Aug — too cool for summer
  return null;
}

// Anchor (local units, unscaled) where emotes hover: just above the head,
// centered. v3.2 fixes the "icons show up far above the cat" bug — the old
// code passed a size-scaled y AND scaled it again inside drawEmote, and the
// -158 baseline floated way over every head. Computed from the body skeleton
// so each body type (kitten/panda/large...) gets a snug anchor.
export function emoteAnchor(breed) {
  const pal = PALETTES[breed] || PALETTES.grey_tabby;
  const B = BODIES[pal.body] || BODIES.normal;
  const headTop = B.standY + B.head[1] - B.headR;   // highest point of the skull
  return { x: 10, y: headTop - 16 };
}

export function drawEmote(ctx, opts) {
  const kind = opts && opts.kind;
  if (!kind || !EMOTES.includes(kind)) return;
  const t = Math.max(0, opts.t || 0);
  const life = 2.0;
  if (t > life) return;
  const scale = opts.scale || 1;
  const pop = Math.min(1, t * 5.5);
  const spring = 1 + Math.sin(pop * Math.PI) * 0.28;
  const bob = Math.sin(t * 3.2) * 2.2;
  const fade = t > life - 0.35 ? Math.max(0, (life - t) / 0.35) : 1;

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(opts.x ?? 46, (opts.y ?? -150) + bob);
  ctx.scale(spring, spring);
  ctx.globalAlpha *= Math.max(0, Math.min(1, fade));

  const hasBadge = ['question', 'exclaim', 'note', 'angry', 'laugh'].includes(kind);
  if (hasBadge) {
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(60,70,90,0.35)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 13); ctx.lineTo(0, 19); ctx.lineTo(4, 13);
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (kind) {
    case 'question':
      ctx.fillStyle = '#3a6fd8';
      ctx.font = 'bold 19px system-ui, sans-serif';
      ctx.fillText('?', 0, 1);
      break;
    case 'exclaim':
      ctx.fillStyle = '#e0483e';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('!', 0, 1);
      break;
    case 'note': {
      ctx.fillStyle = '#7a4fd8';
      ell(ctx, -1.5, 6, 4.8, 3.9, -0.25);
      ctx.fill();
      ctx.fillRect(2.6, -10, 2.4, 16);
      ctx.strokeStyle = '#7a4fd8';
      ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4, -10);
      ctx.quadraticCurveTo(10, -8, 11, -2);
      ctx.stroke();
      break;
    }
    case 'angry': {
      // manga anger mark: 4 curved brackets facing the center
      ctx.strokeStyle = '#e0483e';
      ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-6.5, -6.5, 5, 0.1, Math.PI * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(6.5, -6.5, 5, Math.PI * 0.5, Math.PI - 0.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(6.5, 6.5, 5, Math.PI + 0.1, Math.PI * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(-6.5, 6.5, 5, Math.PI * 1.5, Math.PI * 2 - 0.1); ctx.stroke();
      break;
    }
    case 'laugh': {
      ell(ctx, 0, 0, 11, 11);
      ctx.fillStyle = '#ffd94d'; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#d9a821'; ctx.stroke();
      ctx.strokeStyle = '#5a4014';
      ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6.5, -3.5); ctx.quadraticCurveTo(-4.5, -6.5, -2.5, -3.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2.5, -3.5); ctx.quadraticCurveTo(4.5, -6.5, 6.5, -3.5); ctx.stroke();
      ell(ctx, 0, 3.5, 4.5, 3.6);
      ctx.fillStyle = '#7a3020'; ctx.fill();
      ell(ctx, 0, 5.4, 2.6, 1.6);
      ctx.fillStyle = '#e0705e'; ctx.fill();
      break;
    }
    case 'heart':
      ctx.fillStyle = '#f06e82';
      heart(ctx, 0, 0, 9);
      ell(ctx, -3.2, -3.4, 1.7, 1.2, -0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      break;
    case 'love':
      ctx.fillStyle = '#f0566e';
      heart(ctx, 0, 0, 10);
      ctx.fillStyle = '#f89aa8';
      heart(ctx, -12.5, -7.5, 4.6);
      heart(ctx, 12, -5.5, 4.0);
      break;
    case 'star':
      ctx.fillStyle = '#ffcf4d';
      star(ctx, 0, 0, 9.5, 4.0, 5);
      break;
    case 'sweat': {
      ctx.fillStyle = '#5aa8e8';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.bezierCurveTo(6.5, -1, 5.5, 5.5, 0, 7);
      ctx.bezierCurveTo(-5.5, 5.5, -6.5, -1, 0, -10);
      ctx.closePath();
      ctx.fill();
      ell(ctx, -1.6, 1.6, 1.3, 2.1, 0.3);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
      break;
    }
    case 'zzz': {
      const drawZ = (zx, zy, s, rot) => {
        ctx.save();
        ctx.translate(zx, zy);
        ctx.rotate(rot);
        ctx.font = `bold ${s}px system-ui, sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText('Z', 0, 0);
        ctx.fillStyle = '#6a86b8';
        ctx.fillText('Z', 0, 0);
        ctx.restore();
      };
      drawZ(2, -4, 14, 0.12);
      drawZ(11, 4, 10, 0.12);
      drawZ(17, 10, 7, 0.12);
      break;
    }
    case 'fish': {
      ctx.fillStyle = '#7fa8c9';
      ell(ctx, -2.5, 0, 9.5, 5.8, -0.06);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(13, -5.5);
      ctx.lineTo(13, 5.5);
      ctx.closePath();
      ctx.fill();
      ell(ctx, -7, -1.2, 1.6, 1.6);
      ctx.fillStyle = '#22303c'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(-3, 0.5, 4, -0.6, 0.6); ctx.stroke();
      break;
    }
    case 'bread': {
      // v3.5: the loaf gets a little loaf — crust with steam curls
      ctx.fillStyle = '#e0a852';
      rr(ctx, -11, -3, 22, 11, 5.5);
      ctx.fill();
      ctx.fillStyle = '#f3cd8f';
      rr(ctx, -11, -3, 22, 5, 4);
      ctx.fill();
      // crust slashes
      ctx.strokeStyle = 'rgba(140,95,35,0.85)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (const sx of [-5, 0, 5]) {
        ctx.beginPath();
        ctx.moveTo(sx - 2, -1.2);
        ctx.lineTo(sx + 2, -3.4);
        ctx.stroke();
      }
      // steam curls
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.6;
      for (const sx of [-5, 2]) {
        ctx.beginPath();
        ctx.moveTo(sx, -5);
        ctx.bezierCurveTo(sx - 3, -9, sx + 3, -11, sx, -15);
        ctx.stroke();
      }
      break;
    }
    case 'sad': {
      // broken heart — for red builds and other tragedies
      ctx.fillStyle = '#8a94c8';
      heart(ctx, 0, 1, 9);
      // crack
      ctx.strokeStyle = '#3a4468';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -7.5);
      ctx.lineTo(-2.5, -3);
      ctx.lineTo(1.5, -0.5);
      ctx.lineTo(-1, 4.5);
      ctx.stroke();
      break;
    }
    case 'battery': {
      // low battery pill with a lightning bolt
      rr(ctx, -12, -7, 22, 14, 3.5);
      ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(60,70,90,0.4)'; ctx.stroke();
      rr(ctx, 10.5, -3, 3.4, 6, 1.2); ctx.fillStyle = 'rgba(60,70,90,0.55)'; ctx.fill();
      rr(ctx, -9.6, -4.6, 8, 9.2, 1.6); ctx.fillStyle = '#e0483e'; ctx.fill();
      ctx.fillStyle = '#e8a11c';
      ctx.beginPath();
      ctx.moveTo(2.4, -5.6); ctx.lineTo(-2.6, 0.8); ctx.lineTo(0.4, 0.8); ctx.lineTo(-1, 5.6); ctx.lineTo(4, -1.2); ctx.lineTo(0.8, -1.2);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'rainbow': {
      // arcs of joy — the rare pet reward
      ctx.lineCap = 'round';
      const cols = ['#e85a5a', '#f0a83c', '#f2d94e', '#68c46a', '#5a9de0'];
      for (let i = 0; i < cols.length; i++) {
        ctx.strokeStyle = cols[i];
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(0, 6, 12.5 - i * 2.6, Math.PI, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'cookie': {
      // a celebratory chocolate-chip cookie (with a bite, obviously)
      ell(ctx, 0, 0, 11, 10.2, -0.15);
      ctx.fillStyle = '#d9a45c'; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#a87838'; ctx.stroke();
      // bite
      ctx.globalCompositeOperation = 'destination-out';
      ell(ctx, 9, -6, 4.6, 4.2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // chips
      ctx.fillStyle = '#5a3a1e';
      for (const [cx2, cy2, r2] of [[-4, -2, 1.7], [2, 2.5, 1.9], [-1.5, 5.5, 1.4], [4, -2.5, 1.5]]) {
        ell(ctx, cx2, cy2, r2, r2); ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

function star(ctx, x, y, R, r, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (i * Math.PI) / n - Math.PI / 2;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.2, x, y + s * 0.9);
  ctx.closePath();
  ctx.fill();
}

// bounding box in local units (before dir/scale) — for hit tests.
// Covers the largest body (chubby/panda) + raised paws + emote area.
export const CAT_BBOX = { x: -88, y: -160, w: 180, h: 165 };

// ---------------------------------------------------------------- v3.5 toys
// drawLaser — the red pointer dot. Drawn around the origin (caller translates
// to the dot's screen position). Pulsing glow + bright core.
export function drawLaser(ctx, opts) {
  const t = opts?.t || 0;
  const pulse = 0.8 + Math.sin(t * 9) * 0.2;
  const r = (opts?.r || 7) * (opts?.scale || 1) * pulse;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
  g.addColorStop(0, 'rgba(255,70,60,0.95)');
  g.addColorStop(0.35, 'rgba(255,60,50,0.5)');
  g.addColorStop(1, 'rgba(255,60,50,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-r * 0.15, -r * 0.15, r * 0.2, 0, TAU);
  ctx.fill();
}

// drawButterfly — an ambient butterfly flapping past. Drawn around the origin,
// wings flap fast; caller positions it and steers it across the screen.
export function drawButterfly(ctx, opts) {
  const t = opts?.t || 0;
  const s = (opts?.scale || 1) * (opts?.s || 1);
  const flap = Math.sin(t * 22);
  const hue = opts?.hue ?? 28;   // default: monarch-ish orange
  ctx.save();
  ctx.scale(s, s);
  ctx.rotate(Math.sin(t * 2.1) * 0.18);
  // wings (near side + far side, mirrored around the body axis)
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, 1);
    const w = 9 * (0.55 + 0.45 * Math.abs(flap));   // wing spread follows flap
    ctx.fillStyle = `hsla(${hue}, 85%, 60%, 0.92)`;
    // upper wing
    ctx.beginPath();
    ctx.ellipse(side * w * 0.55, -3.5, w * 0.62, 4.4, side * 0.5, 0, TAU);
    ctx.fill();
    // lower wing
    ctx.fillStyle = `hsla(${hue + 14}, 80%, 52%, 0.88)`;
    ctx.beginPath();
    ctx.ellipse(side * w * 0.42, 2.8, w * 0.4, 3.1, side * -0.35, 0, TAU);
    ctx.fill();
    // wing spots
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(side * w * 0.7, -4.2, 1.3, 1.1, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // body + antennae
  ctx.fillStyle = '#3a3230';
  rr(ctx, -1.4, -5, 2.8, 10, 1.4);
  ctx.fill();
  ctx.strokeStyle = '#3a3230';
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(-2.5, -9, -3.5, -10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(2.5, -9, 3.5, -10); ctx.stroke();
  ctx.restore();
}
