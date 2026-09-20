// cat-renderer.js — procedural 2D-canvas cat. Pure module: no DOM, no Electron.
// Draw is deterministic: every frame is a pure function of (t, state, breed, dir, opts).
// Coordinate system: feet on y=0, cat centered near x=0, facing +x (right). Flip via dir=-1.

'use strict';

// ---------------------------------------------------------------- palettes
export const PALETTES = {
  grey_tabby: {
    fur: '#9aa0a8', dark: '#565b63', belly: '#d7dade', stripe: '#43474e',
    earIn: '#d59aa2', nose: '#c47583', eye: '#79b356', pupil: '#1c1f24',
    tongue: '#d98a94',
  },
  orange_tabby: {
    fur: '#eaa75f', dark: '#c47f3c', belly: '#f8e3c4', stripe: '#a85a24',
    earIn: '#e0a89e', nose: '#d07f6e', eye: '#93bb4e', pupil: '#241a10',
    tongue: '#d98a94',
  },
  siamese: {
    fur: '#ece0cb', dark: '#6e5138', belly: '#f4ecdd', stripe: '#6e5138',
    earIn: '#caa79b', nose: '#8a6055', eye: '#5f9fd8', pupil: '#1a2230',
    points: true, tongue: '#d98a94',
  },
  calico: {
    fur: '#f3e9d7', dark: '#c9b69a', belly: '#faf3e6', stripe: '#b39b78',
    earIn: '#dba8a0', nose: '#cf8076', eye: '#c28a2e', pupil: '#241a10',
    patches: [
      { c: '#e08a3c', dk: '#b56a24' },
      { c: '#453c38', dk: '#2c2622' },
    ],
    tongue: '#d98a94',
  },
  persian: {
    fur: '#f1e4cf', dark: '#d3bda0', belly: '#fbf4e8', stripe: '#dcc7a8',
    earIn: '#e0b0aa', nose: '#d4858d', eye: '#5f9fd8', pupil: '#1c2733',
    fluffy: true, tongue: '#d98a94',
  },
  tuxedo: {
    fur: '#43434c', dark: '#26262d', belly: '#f4f4f4', stripe: '#1e1e24',
    earIn: '#c98f96', nose: '#b56b74', eye: '#93bb4e', pupil: '#0e0e12',
    socks: true, tongue: '#d98a94',
  },
};

export const STATES = [
  'walk', 'run', 'idle', 'sit', 'sleep', 'dance', 'scratch', 'jump', 'happy', 'eat',
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
  const scale = opts.scale || 1;
  const jumpP = opts.jumpP ?? 0.5;

  ctx.save();
  ctx.scale(dir * scale, scale);
  ctx.globalAlpha = opts.alpha ?? 1;

  const P = poseFor(state, t, jumpP);
  const bodyY = P.bodyY + P.bobY;
  const sqx = 1 + P.sqx, sqy = 1 + P.sqy;

  // ---------------- ground shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.filter = 'blur(2px)';
  ell(ctx, 2, 2, 46 * P.shadowK, 7 * P.shadowK);
  ctx.fill();
  ctx.restore();

  const shoulder = { x: 20, y: bodyY - 4 };
  const hip = { x: -24, y: bodyY - 2 };
  const headC = {
    x: 36 + P.headX, y: bodyY - 34 + P.headY + Math.sin(t * 2.1) * 1.2,
    r: 23, rot: P.headRot,
  };

  // ---------------- FAR legs (slightly darker)
  const darkFill = shade(pal.dark, 0.18);
  drawLeg(ctx, shoulder.x, shoulder.y, P.legs[1], pal, darkFill, -1, pal.dark);
  drawLeg(ctx, hip.x, hip.y, P.legs[3], pal, darkFill, -1, pal.dark);

  // ---------------- tail (behind body)
  drawTail(ctx, -36, bodyY - 16, P, pal, t);

  // ---------------- body
  ctx.save();
  ctx.translate(0, bodyY);
  ctx.rotate(P.bodyRot);
  ctx.scale(sqx, sqy);

  const bodyGrad = radialFill(ctx, -10, -10, 6, 52, [
    [0, shade(pal.fur, 0.22)],
    [0.55, pal.fur],
    [1, shade(pal.fur, -0.28)],
  ]);
  ell(ctx, 0, -8, 41, 25);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  // rear haunch volume
  ell(ctx, -22, -2, 20, 18);
  ctx.fillStyle = radialFill(ctx, -26, -8, 3, 22, [
    [0, shade(pal.fur, 0.16)], [1, shade(pal.fur, -0.2)],
  ]);
  ctx.fill();
  // chest volume
  ell(ctx, 26, 2, 14, 15);
  ctx.fillStyle = radialFill(ctx, 24, -3, 2, 16, [
    [0, shade(pal.fur, 0.10)], [1, shade(pal.fur, -0.18)],
  ]);
  ctx.fill();

  // breed marks on body (clipped)
  ctx.save();
  ell(ctx, 0, -8, 41, 25);
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
  if (pal.stripe && !pal.points) {
    ctx.strokeStyle = pal.stripe;
    ctx.globalAlpha *= 0.30;
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const sx = -18 + i * 13;
      ctx.beginPath();
      ctx.moveTo(sx, -30);
      ctx.quadraticCurveTo(sx + 3, -20, sx - 1, -12);
      ctx.stroke();
    }
    ctx.globalAlpha /= 0.30;
  }
  if (pal.socks) {
    ell(ctx, 16, 2, 24, 18, -0.15);
    ctx.fillStyle = pal.belly; ctx.fill();
  } else {
    ctx.globalAlpha *= 0.55;
    ell(ctx, 10, 8, 24, 13, -0.1);
    ctx.fillStyle = pal.belly; ctx.fill();
    ctx.globalAlpha /= 0.55;
  }
  ctx.restore(); // clip

  // rim light top
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(0, -8, 39, 23.4, 0, -Math.PI * 0.82, -Math.PI * 0.25);
  ctx.stroke();
  ctx.restore(); // body

  // ---------------- NEAR legs (base color, on top of body)
  drawLeg(ctx, shoulder.x, shoulder.y, P.legs[0], pal, pal.fur, 1, pal.dark);
  drawLeg(ctx, hip.x, hip.y, P.legs[2], pal, pal.fur, 1, pal.dark);

  // ---------------- head
  drawHead(ctx, headC, P, pal, t, state);

  ctx.restore();
}

// ---------------------------------------------------------------- pose
function poseFor(state, t, jumpP) {
  const P = {
    bodyY: -44, bobY: 0, bodyRot: 0, sqx: 0, sqy: 0, shadowK: 1,
    headX: 0, headY: 0, headRot: 0,
    legs: [
      { fx: 24, fy: 0 }, { fx: 30, fy: 0 },   // front near/far
      { fx: -22, fy: 0 }, { fx: -28, fy: 0 }, // back near/far
    ],
    tailMode: 'sway', eyeState: 'open', mouth: 'closed',
    particles: null,
  };
  const W = (f, ph) => Math.sin(t * f + ph);

  switch (state) {
    case 'walk': {
      const f = 7.0;
      P.legs[0].fx = 24 + W(f, 0) * 9;         P.legs[0].fy = -Math.max(0, Math.sin(t * f + Math.PI / 2)) * 6;
      P.legs[1].fx = 30 + W(f, Math.PI) * 9;   P.legs[1].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.5)) * 6;
      P.legs[2].fx = -22 + W(f, Math.PI * 1.15) * 10; P.legs[2].fy = -Math.max(0, Math.sin(t * f + Math.PI * 1.65)) * 6;
      P.legs[3].fx = -28 + W(f, Math.PI * 0.15) * 10; P.legs[3].fy = -Math.max(0, Math.sin(t * f + Math.PI * 0.65)) * 6;
      P.bobY = -Math.abs(W(f, 0)) * 2.2;
      P.bodyRot = W(f, Math.PI / 2) * 0.02;
      break;
    }
    case 'run': {
      const f = 12.5;
      P.legs[0].fx = 24 + W(f, 0) * 15;  P.legs[0].fy = -Math.max(0, Math.sin(t * f + 1.7)) * 11;
      P.legs[1].fx = 30 + W(f, Math.PI) * 15; P.legs[1].fy = -Math.max(0, Math.sin(t * f + 1.7 + Math.PI)) * 11;
      P.legs[2].fx = -22 + W(f, Math.PI * 1.2) * 17; P.legs[2].fy = -Math.max(0, Math.sin(t * f + 1.2 + Math.PI * 1.5)) * 12;
      P.legs[3].fx = -28 + W(f, Math.PI * 0.2) * 17; P.legs[3].fy = -Math.max(0, Math.sin(t * f + 1.2 + Math.PI * 0.5)) * 12;
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
      P.bodyY = -40; P.bodyRot = 0.10;
      P.sqx = -0.04; P.sqy = 0.05;
      P.legs[2].fx = -14; P.legs[2].fy = -2;
      P.legs[3].fx = -18; P.legs[3].fy = -2;
      P.legs[0].fx = 26; P.legs[1].fx = 31;
      P.tailMode = 'curl';
      P.eyeState = 'blink';
      P.bobY = Math.sin(t * 1.7) * 0.7;
      break;
    }
    case 'sleep': {
      P.bodyY = -26; P.bodyRot = 0.16;
      P.sqx = -0.10; P.sqy = 0.12;
      P.legs[0].fx = 20; P.legs[0].fy = -2;
      P.legs[1].fx = 24; P.legs[1].fy = -2;
      P.legs[2].fx = -10; P.legs[2].fy = -2;
      P.legs[3].fx = -14; P.legs[3].fy = -2;
      P.headX = -14; P.headY = 12; P.headRot = 0.18;
      P.tailMode = 'wrap';
      P.eyeState = 'closed';
      P.particles = { kind: 'z', f: 1.1 };
      break;
    }
    case 'dance': {
      const f = 6.2;
      P.bodyY = -46;
      P.bobY = -Math.abs(W(f, 0)) * 9;
      P.bodyRot = W(f * 0.5, 0) * 0.10;
      P.sqx = W(f, 0) * 0.05; P.sqy = -P.sqx;
      P.legs[0].fx = 24 + W(f, 0) * 4; P.legs[0].fy = -Math.max(0, W(f, 0.8)) * 16;
      P.legs[1].fx = 30; P.legs[1].fy = -Math.max(0, W(f, 0.8 + Math.PI)) * 16;
      P.legs[2].fx = -22 + W(f, Math.PI) * 3; P.legs[2].fy = -Math.max(0, W(f, Math.PI + 0.8)) * 10;
      P.headRot = W(f * 0.5, 0.4) * 0.14;
      P.tailMode = 'spiral';
      P.eyeState = 'happy';
      P.particles = { kind: 'sparkle', f: 5 };
      break;
    }
    case 'scratch': {
      const f = 10.5;
      P.bodyY = -50; P.bodyRot = -0.16;
      P.legs[2].fx = -18; P.legs[2].fy = -4;
      P.legs[3].fx = -22; P.legs[3].fy = -4;
      P.legs[0].fx = 30 + W(f, 0) * 7; P.legs[0].fy = -26 + Math.abs(W(f, 0)) * 8;
      P.legs[1].fx = 34 + W(f, Math.PI) * 7; P.legs[1].fy = -26 + Math.abs(W(f, Math.PI)) * 8;
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
      P.legs[0].fx = 28; P.legs[1].fx = 34;
      P.legs[2].fx = -18; P.legs[3].fx = -24;
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
      P.bodyY = -42;
      const dip = Math.max(0, Math.sin(t * 4.4));
      P.headY = 10 + dip * 7; P.headX = -2; P.headRot = 0.22 + dip * 0.12;
      P.eyeState = 'blink';
      P.mouth = dip > 0.6 ? 'open' : 'closed';
      break;
    }
  }
  return P;
}

// ---------------------------------------------------------------- legs
function drawLeg(ctx, ax, ay, foot, pal, fill, near, lineCol) {
  const l1 = 16, l2 = 18;
  const { kx, ky } = solveIK(ax, ay, foot.fx, foot.fy, l1, l2, -1);
  limb(ctx, ax, ay, kx, ky, 8.5, 6, fill);
  limb(ctx, kx, ky, foot.fx, foot.fy - 4, 6, 5, fill);
  ell(ctx, foot.fx + 2, foot.fy - 4, 6.5, 5);
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
}

// ---------------------------------------------------------------- tail
function drawTail(ctx, bx, by, P, pal, t) {
  let base = pal.fur, tip = shade(pal.fur, 0.1);
  if (pal.points) { base = shade(pal.dark, 0.22); tip = pal.dark; }
  if (pal.patches) tip = pal.patches[0].c;
  if (pal.socks) tip = pal.dark;

  const segs = 9;
  const mode = P.tailMode === ' spiral' ? 'spiral' : P.tailMode;
  // canvas +y is DOWN -> negative sin angle = tail points UP-back
  const CFG = {
    sway:   { a0: -2.45, bend: 0.052, waveF: 2.4, waveA: 0.10, kw: 2.2 },
    stream: { a0: -2.05, bend: -0.018, waveF: 9.0, waveA: 0.07, kw: 3.0 },
    spiral: { a0: -2.55, bend: -0.135, waveF: 6.2, waveA: 0.22, kw: 3.4 },
    curl:   { a0: -2.95, bend: 0.105, waveF: 1.5, waveA: 0.05, kw: 2.0 },
    wrap:   { a0: -3.05, bend: 0.055, waveF: 0.8, waveA: 0.04, kw: 1.6 },
  };
  const cfg = CFG[mode] || CFG.sway;
  const pts = [];
  let x = bx, y = by;
  let ang = cfg.a0;
  for (let i = 0; i < segs; i++) {
    const k = i / (segs - 1);
    const w = Math.sin(t * cfg.waveF + k * cfg.kw) * cfg.waveA;
    ang += w * 0.55 + cfg.bend;
    const step = 8.2 - k * 1.2;
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    pts.push({ x, y, k });
  }
  for (let i = 0; i < segs - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const r0 = 7.5 - p0.k * 5.4, r1 = 7.5 - p1.k * 5.4;
    limb(ctx, p0.x, p0.y, p1.x, p1.y, r0, r1, base);
  }
  const tp = pts[segs - 1], tp1 = pts[segs - 2];
  limb(ctx, tp1.x, tp1.y, tp.x, tp.y, 2.6, 3.4, tip);
  if (pal.stripe && !pal.points && !pal.patches) {
    const ga = ctx.globalAlpha;
    ctx.fillStyle = pal.stripe;
    ctx.globalAlpha = ga * 0.5;
    for (const i of [2, 4, 6]) {
      const p = pts[i];
      ell(ctx, p.x, p.y, 3.4, 3.0);
      ctx.fill();
    }
    ctx.globalAlpha = ga;
  }
}

// ---------------------------------------------------------------- head
function drawHead(ctx, C, P, pal, t, state) {
  ctx.save();
  ctx.translate(C.x, C.y);
  ctx.rotate(C.rot || 0);
  const r = C.r;

  // ears
  const earTwitch = (Math.sin(t * 0.9) > 0.97 ? 0.12 : 0) +
    (state === 'dance' ? Math.sin(t * 12) * 0.05 : 0);
  const earFill = pal.points ? shade(pal.dark, 0.1) : pal.fur;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * r * 0.62, -r * 0.78);
    ctx.rotate(s * (0.32 + earTwitch));
    ctx.beginPath();
    ctx.moveTo(-7, 4);
    ctx.quadraticCurveTo(-2, -16, 3, -14);
    ctx.quadraticCurveTo(8, -6, 7, 5);
    ctx.closePath();
    const eg = radialFill(ctx, 0, -6, 2, 14, [
      [0, shade(earFill, 0.12)], [1, shade(earFill, -0.2)],
    ]);
    ctx.fillStyle = eg; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3.5, 2);
    ctx.quadraticCurveTo(-1, -9, 2, -8);
    ctx.quadraticCurveTo(4.5, -3, 4, 3);
    ctx.closePath();
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.9;
    ctx.fillStyle = pal.earIn; ctx.fill();
    ctx.globalAlpha = ga;
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

  // fluffy cheek fur (persian)
  if (pal.fluffy) {
    ctx.fillStyle = pal.fur;
    for (const [ax, ay] of [[-r * 0.9, r * 0.35], [-r * 0.95, r * 0.1], [-r * 0.8, r * 0.55]]) {
      ell(ctx, ax, ay, 7, 5, hash(ax) * 3);
      ctx.fill();
    }
  }

  // eyes
  const blink = P.eyeState === 'closed' ? 1 :
    P.eyeState === 'happy' ? 1 : (
      (Math.sin(t * 1.9) > 0.985 || Math.sin(t * 0.53 + 2.2) > 0.994) ? 1 : 0);
  for (const s of [-1, 1]) {
    const ex = s * 8.5 + r * 0.12, ey = -r * 0.12;
    if (P.eyeState === 'closed' || blink === 1) {
      ctx.strokeStyle = shade(pal.fur, -0.45);
      ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 4.5, ey);
      ctx.quadraticCurveTo(ex, ey + (P.eyeState === 'happy' ? -3.5 : 2.5), ex + 4.5, ey);
      ctx.stroke();
      continue;
    }
    if (P.eyeState === 'happy') {
      ctx.strokeStyle = shade(pal.fur, -0.45);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 4.5, ey + 1);
      ctx.quadraticCurveTo(ex, ey - 4, ex + 4.5, ey + 1);
      ctx.stroke();
      continue;
    }
    ell(ctx, ex, ey, 5.4, 4.6);
    ctx.fillStyle = '#f8f6f2'; ctx.fill();
    ell(ctx, ex + 1.2, ey, 3.6, 3.8);
    const ig = radialFill(ctx, ex + 0.6, ey - 0.8, 0.5, 4.2, [
      [0, shade(pal.eye, 0.35)], [0.7, pal.eye], [1, shade(pal.eye, -0.4)],
    ]);
    ctx.fillStyle = ig; ctx.fill();
    ell(ctx, ex + 1.4, ey, 1.7, 3.0);
    ctx.fillStyle = pal.pupil; ctx.fill();
    ell(ctx, ex + 0.2, ey - 1.4, 1.1, 1.0);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
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
  if (P.mouth === 'open') {
    ell(ctx, nx - 1, ny + 7, 3.4, 4.2);
    ctx.fillStyle = pal.tongue; ctx.fill();
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
  const P = poseFor(state, t, opts.jumpP ?? 0.5);
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

// bounding box in local units (before dir/scale) — for hit tests
export const CAT_BBOX = { x: -75, y: -135, w: 155, h: 140 };
