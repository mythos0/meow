// v322.test.mjs — the "natural upper legs" release.
//
// THE USER'S BUG: "when cat is dancing or walking why the cat upper 2 leg
// gotten long?" Root cause (measured): poses asked paws to reach points
// past the limb's real bone total — walk x1.52, run x1.60, sit x1.45, dance
// hands-up x2.76 of legL1+legL2 — and drawLeg drew the lower segment all
// the way to the unreachable paw: rubber-band stilts instead of knees.
//
// Pins three contracts so legs can never stretch again:
//   1. HONEST SKELETONS: every BODIES entry has legL1+legL2 equal to its
//      standing height (sh[1] - standY) + exactly 1px of slack.
//   2. REACHABLE POSES: across ALL states x breeds x dense t/stateT/jumpP,
//      no paw (planted, lifted, or overlay) is asked more than 13px past
//      its anchor's reach — the drawLeg clamp hides anything up to that,
//      and the zoomies gallop extreme measures 11.4px (in-motion invisible).
//   3. NATURAL DANCE PAWS: the hands-up / finish raised paws stay within
//      the STUBBY reach (bones x legK) — cheek height with a bent elbow,
//      never the old straight stilts to the ears.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { poseForState, BODIES, PALETTES, STATES } from '../src/cat-renderer.js';

// ------------------------------------------------------------ 1. honest bones
describe('v3.22 honest skeletons: legL1+legL2 == standing height + 1', () => {
  for (const [name, B] of Object.entries(BODIES)) {
    test(`body ${name}: bones match shoulder height`, () => {
      const height = B.sh[1] - B.standY;   // shoulder height above the ground
      assert.equal(B.legL1 + B.legL2, height + 1,
        `${name}: legL1+legL2=${B.legL1 + B.legL2}, standing height=${height}`);
      assert.ok(B.legL1 > 8 && B.legL2 > 8, `${name}: both bones substantive`);
    });
  }

  test('munchkin keeps the shortest legs, large the longest', () => {
    const total = n => BODIES[n].legL1 + BODIES[n].legL2;
    assert.ok(total('munchkin') < total('normal'), 'munchkin < normal');
    assert.ok(total('normal') < total('large'), 'normal < large');
  });
});

// ------------------------------------------------------------ 2. reachable poses
describe('v3.22 reachable poses: no paw is asked far past the limb reach', () => {
  const PAD = 13; // design slack; drawLeg clamps the rest (zoomies peak = 11.4)
  for (const [breed, pal] of Object.entries(PALETTES)) {
    const B = BODIES[pal.body] || BODIES.normal;
    const reach = B.legL1 + B.legL2;
    const allStates = [...STATES];   // dance included in STATES
    for (const state of allStates) {
      test(`${breed}/${state}: every paw within reach+${PAD}`, () => {
        let worst = 0, worstAt = '';
        for (let i = 0; i < 600; i++) {
          const t = i / 41;
          const stT = state === 'dance' ? (i % 75) / 75 * 10.4 : 0;
          const P = poseForState(state, t, (i % 100) / 100, B, pal, stT);
          const bodyY = B.standY + P.bodyY + P.bobY;
          const sh = { x: B.sh[0], y: bodyY - B.sh[1] };
          const hp = { x: B.hp[0], y: bodyY - B.hp[1] };
          const check = (ax, ay, fx, fy, tag) => {
            const d = Math.hypot(fx - ax, fy - ay);
            if (d > worst) { worst = d; worstAt = `${tag} t=${t.toFixed(2)} stT=${stT.toFixed(2)}`; }
          };
          P.legs.forEach((L, li) => {
            if (!L) return;
            const a = li < 2 ? sh : hp;
            check(a.x, a.y, L.fx, L.fy, `leg${li}`);
          });
          if (P.overlayPaw) {
            const paws = Array.isArray(P.overlayPaw) ? P.overlayPaw : [P.overlayPaw];
            for (const paw of paws) check(sh.x, sh.y, paw.fx, paw.fy, 'overlay');
          }
        }
        assert.ok(worst <= reach + PAD,
          `${breed}/${state}: worst paw ${worst.toFixed(1)} > reach ${reach}+${PAD} (${worstAt})`);
      });
    }
  }

  test('walk: planted paws stay at ground level (no float from clamping)', () => {
    const B = BODIES.normal, pal = PALETTES.grey_tabby;
    for (let i = 0; i < 200; i++) {
      const P = poseForState('walk', i / 23, 0.5, B, pal, 0);
      for (const L of P.legs) assert.ok(L.fy >= -8, `walk paw lifted too high: fy=${L.fy}`);
    }
  });
});

// ------------------------------------------------------------ 3. natural dance paws
describe('v3.22 natural dance raised paws (stubby reach, bent elbow)', () => {
  const B = BODIES.normal, pal = PALETTES.grey_tabby;
  const stubby = (B.legL1 + B.legL2) * 0.74;

  // distance measured EXACTLY like drawCat: from the live shoulder (with
  // bodyY + bobY applied) to the overlay paw
  const pawDist = (P, B) => {
    const sy = B.standY + P.bodyY + P.bobY - B.sh[1];
    return paw => Math.hypot(paw.fx - B.sh[0], paw.fy - sy);
  };

  test('step 3 HANDS UP: both paws stay within the stubby reach', () => {
    for (let i = 0; i <= 40; i++) {
      const st = 3.45 + i / 40 * 2.1;   // strictly inside step 3 (3.4 .. 5.6)
      const P = poseForState('dance', st, 0.5, B, pal, st);
      assert.equal(P.legs[0], null, 'near front leg is the overlay (no 6 legs)');
      assert.equal(P.legs[1], null, 'far front leg is the overlay (no 6 legs)');
      assert.ok(P.overlayPaw, `overlay paws exist at st=${st.toFixed(2)}`);
      const paws = Array.isArray(P.overlayPaw) ? P.overlayPaw : [P.overlayPaw];
      for (const paw of paws) {
        const d = pawDist(P, B)(paw);
        assert.ok(d <= stubby * 1.02, `paw at ${d.toFixed(1)} > stubby reach ${stubby.toFixed(1)} (st=${st.toFixed(2)})`);
        // while up (rise done, before the lower-back) the paws climb toward
        // the cheeks: a real "hands up" beat, not a planted paw
        if (st > 3.85 && st < 5.0) assert.ok(paw.fy < -40, `paw fy=${paw.fy.toFixed(1)} did not rise (st=${st.toFixed(2)})`);
      }
    }
  });

  test('step 6 FINISH: the cheek paw stays within the stubby reach', () => {
    for (let i = 0; i <= 30; i++) {
      const st = 9.4 + i / 30 * 1.1;
      const P = poseForState('dance', st, 0.5, B, pal, st);
      assert.ok(P.overlayPaw, `overlay paw exists at st=${st.toFixed(2)}`);
      const paw = Array.isArray(P.overlayPaw) ? P.overlayPaw[0] : P.overlayPaw;
      const d = pawDist(P, B)(paw);
      assert.ok(d <= stubby * 1.02, `paw at ${d.toFixed(1)} > stubby reach ${stubby.toFixed(1)} (st=${st.toFixed(2)})`);
    }
  });

  test('the same contract holds for the kittens (smaller stubby reach)', () => {
    for (const breed of ['ginger_kitten', 'smokey_kitten']) {
      const KB = BODIES[PALETTES[breed].body] || BODIES.normal;
      const kStubby = (KB.legL1 + KB.legL2) * 0.74;
      for (const st of [3.6, 4.2, 4.8, 5.3, 9.8, 10.3]) {
        const P = poseForState('dance', st, 0.5, KB, PALETTES[breed], st);
        const paws = P.overlayPaw ? (Array.isArray(P.overlayPaw) ? P.overlayPaw : [P.overlayPaw]) : [];
        for (const paw of paws) {
          const d = pawDist(P, KB)(paw);
          assert.ok(d <= kStubby * 1.02, `${breed} st=${st}: paw ${d.toFixed(1)} > reach ${kStubby.toFixed(1)}`);
        }
      }
    }
  });
});
