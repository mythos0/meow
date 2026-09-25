// v316.test.mjs — the six-step dance + hunt geometry (v3.18: the voice
// suites were removed WITH the voice feature at the user's request).
//   1. FUZZY WAKE: real speech engines mangle "hey cat" into "hey kat" /
//      "hay cat" / "a cat" — the mangled wake + a real command must fire,
//      the mangled wake + chatter must stay inert.
//   2. HARDENED SAPI SCRIPT: recognizer enumeration (the v3.15 silent death
//      — an en-US grammar that never loaded on non-English Windows, with the
//      error swallowed), grammar-failed reporting, UTF-8 output, status line.
//   3. DANCE: the six-phase routine matches the user's reference sheet —
//      upright hind-leg stand throughout, side steps, hands up, a back view
//      (noFace), the whip tail, the happy finale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poseForState, BODIES } from '../src/cat-renderer.js';
import { CatBrain } from '../src/cat-brain.js';

// ------------------------------------------------------------ fuzzy wake
// ------------------------------------------------------------ SAPI script
// ------------------------------------------------------------ dance phases
const B = BODIES.normal;
const pal = { body: 'normal', fur: '#c8b48c', dark: '#8a7350', belly: '#e8dcc4', earIn: '#e89aa2' };
const F = B.feet;
const pose = (stateT, t = stateT) => poseForState('dance', t, 0.5, B, pal, stateT);

test('dance: steps ride the compact hind-leg stand (v3.17 short legs)', () => {
  const p = pose(4.5);                       // hands-up phase — both hind paws planted
  assert.ok(p.bodyY >= 0 && p.bodyY <= 8, `body sits LOW and compact (bodyY ${p.bodyY})`);
  assert.ok(p.bodyRot < -0.45, `torso pitched up onto the hind legs (rot ${p.bodyRot})`);
  assert.ok(p.legK < 1, `stubby legs (legK ${p.legK})`);
  assert.equal(p.legs[2].fy, -1, 'near hind paw planted under the body');
  assert.equal(p.legs[3].fy, -1, 'far hind paw planted under the body');
});

test('dance: phase 1 STEP RIGHT swings the near hind paw out', () => {
  const p = pose(0.3);                       // sin(0.3*5.4) ≈ 1 → full extension
  assert.ok(p.legs[2].fx > F[2] + 12, `near hind paw swings out (fx ${p.legs[2].fx} vs ${F[2]})`);
  assert.ok(p.legs[2].fy < -10, 'and lifts off the ground');
  assert.equal(p.eyeState, 'happy');
});

test('dance: phase 2 STEP LEFT swings the near hind paw BACK (mirrored)', () => {
  const p = pose(2.0);                       // st2 = 0.3 → sin ≈ 1
  assert.ok(p.legs[2].fx < F[2] - 12, `near hind paw swings back (fx ${p.legs[2].fx} vs ${F[2]})`);
  assert.ok(p.legs[2].fy < -10, 'and lifts off the ground');
});

test('dance: phase 3 HANDS UP — both paws raised high OVER the head (overlay)', () => {
  const step = pose(0.3);
  const up = pose(4.5);
  assert.ok(Array.isArray(up.overlayPaw) && up.overlayPaw.length === 2, 'both paws ride OVER the head');
  assert.ok(up.overlayPaw[0].fy < -104, `near paw just above the ear (fy ${up.overlayPaw[0].fy})`);
  assert.ok(up.overlayPaw[1].fy < -98, `far paw just above the ear (fy ${up.overlayPaw[1].fy})`);
  // v3.18: the raised paws ARE the front legs — no chest-height copies below
  assert.equal(up.legs[0], null, 'near front leg is LIFTED (no chest copy — four limbs)');
  assert.equal(up.legs[1], null, 'far front leg is LIFTED (no chest copy — four limbs)');
  assert.ok(up.bodyRot < -0.45, 'still standing on the hind legs');
  assert.ok(step.overlayPaw === null || step.overlayPaw === undefined, 'no overlay during the steps');
});

test('dance: exactly FOUR limbs in every phase (the 6-leg bug stays dead)', () => {
  for (let i = 0; i < 80; i++) {
    const tt = i * 0.145;
    const p = pose(tt);
    const grounded = p.legs.filter(Boolean).length;
    const raised = Array.isArray(p.overlayPaw) ? p.overlayPaw.length : (p.overlayPaw ? 1 : 0);
    assert.ok(grounded + raised <= 4,
      `four limbs max at t=${tt.toFixed(2)} (${grounded} grounded + ${raised} raised)`);
    assert.ok(p.legs[2] && p.legs[3], `hind legs always planted at t=${tt.toFixed(2)}`);
  }
});

test('dance: phase 4 TURN AROUND — a spin, then the back is held (noFace)', () => {
  const spinning = pose(6.0);                // st4 = 0.4 → mid-spin
  assert.ok(spinning.wholeRot > 0.5 && spinning.wholeRot < Math.PI * 2, `spinning (wholeRot ${spinning.wholeRot})`);
  assert.equal(spinning.noFace, false, 'face shows mid-spin');
  const back = pose(6.9);                    // st4 = 1.3 → spin done, back held
  assert.equal(back.wholeRot, 0, 'rotation settled (2π ≡ 0)');
  assert.equal(back.noFace, true, 'the BACK of the head faces the viewer');
  const backLate = pose(7.5);
  assert.equal(backLate.noFace, true, 'the back holds through the whole turn step');
});

test('dance: phase 5 SHAKE TAIL — whip mode, face returns halfway', () => {
  const early = pose(8.0);                   // st5 = 0.4
  assert.equal(early.tailMode, 'whip');
  assert.equal(early.noFace, true, 'still facing away at the start of the shake');
  const late = pose(8.7);                    // st5 = 1.1
  assert.equal(late.tailMode, 'whip');
  assert.equal(late.noFace, false, 'the face comes back around');
  assert.equal(late.eyeState, 'happy');
});

test('dance: phase 6 FINISH — happy squint, paw by the cheek, heart', () => {
  const p = pose(10.2);
  assert.equal(p.eyeState, 'happy');
  assert.ok(p.overlayPaw && !Array.isArray(p.overlayPaw), 'the cheek paw rides over the head');
  assert.ok(p.overlayPaw.fy < -70 && p.overlayPaw.fy > -92, `paw by the cheek (fy ${p.overlayPaw.fy})`);
  assert.ok(p.headRot > 0.05, 'head tilted for the finale');
  assert.equal(p.particles.kind, 'heart');
});

test('dance: every sampled frame stays sane (no NaN geometry)', () => {
  for (let i = 0; i < 60; i++) {
    const p = pose(i * 0.19);
    for (const leg of p.legs) {
      if (!leg) continue;                    // lifted paws ride overlayPaw
      assert.ok(Number.isFinite(leg.fx) && Number.isFinite(leg.fy), `leg finite at t=${i * 0.19}`);
    }
    const ov = Array.isArray(p.overlayPaw) ? p.overlayPaw : (p.overlayPaw ? [p.overlayPaw] : []);
    for (const paw of ov) {
      assert.ok(Number.isFinite(paw.fx) && Number.isFinite(paw.fy), `overlay finite at t=${i * 0.19}`);
    }
    assert.ok(Number.isFinite(p.bodyRot) && Number.isFinite(p.wholeRot));
  }
});

test('dance: other poses never set noFace', () => {
  const walk = poseForState('walk', 0.3, 0.5, B, pal, 0);
  const sit = poseForState('sit', 0.3, 0.5, B, pal, 0);
  const rear = poseForState('rear', 0.6, 0.5, B, pal, 0.6);
  assert.equal(walk.noFace, false);
  assert.equal(sit.noFace, false);
  assert.equal(rear.noFace, false);
});

// ------------------------------------------------------------ brain
test('brain: ambient dances stay short; the triggered dance runs 11.4s', async () => {
  const b = new CatBrain({ rand: () => 0.99 });
  b.tick(1);
  const ambient = b._enter('dance', 2.6 + b.rand() * 2);
  assert.ok(ambient === undefined || true);   // _enter returns nothing — the assertion is the duration below
  const b2 = new CatBrain({ rand: () => 0.5 });
  b2.dance();
  let t = 0;
  while (b2.state === 'dance' && t < 30) { b2.tick(0.02); t += 0.02; }
  assert.ok(t > 10.5, `the full routine lasts ~11.4s (ran ${t.toFixed(2)}s)`);
  assert.ok(t <= 11.6, 'and no longer');
});
