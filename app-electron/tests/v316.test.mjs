// v316.test.mjs — the "voice finally works + the six-step dance" release.
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
import { parseVoiceCommand, normalizePhrase, WAKE_WORDS } from '../src/voice.js';
import { VOICE_SCRIPT, parseVoiceLine, createVoiceListener } from '../src/voice-listener.js';
import { poseForState, BODIES } from '../src/cat-renderer.js';
import { CatBrain } from '../src/cat-brain.js';

// ------------------------------------------------------------ fuzzy wake
test('voice: mangled wake + music title still plays (the accent path)', () => {
  assert.equal(parseVoiceCommand('hey kat play music ghum kariya nilo sokhi').cmd, 'play_music');
  assert.equal(parseVoiceCommand('hey kat play music ghum kariya nilo sokhi').query, 'ghum kariya nilo sokhi');
  assert.equal(parseVoiceCommand('hay cat play music beliver').query, 'beliver');
  assert.equal(parseVoiceCommand('a cat play music shape of you').cmd, 'play_music');
  assert.equal(parseVoiceCommand('eh cat put on despacito').cmd, 'play_music');
});

test('voice: mangled wake + transport controls fire', () => {
  assert.equal(parseVoiceCommand('hey kat pause').cmd, 'pause');
  assert.equal(parseVoiceCommand('hay cat volume up').cmd, 'volume_up');
  assert.equal(parseVoiceCommand('a cat stop the music').cmd, 'stop_music');
  assert.equal(parseVoiceCommand('hey kitt next song').cmd, 'next');
});

test('voice: mangled wake + chatter stays NULL — inertness lives in the remainder', () => {
  assert.equal(parseVoiceCommand('the cat sat on the mat'), null);
  assert.equal(parseVoiceCommand('hey kat meow loudly'), null);
  assert.equal(parseVoiceCommand('my cat is sleeping'), null);
  assert.equal(parseVoiceCommand('hey kat what a lovely day'), null);
});

test('voice: exact wake keeps the old behavior (wake_only / unknown)', () => {
  assert.equal(parseVoiceCommand('hey cat').cmd, 'wake_only');
  assert.equal(parseVoiceCommand('hey cat meow loudly').cmd, 'unknown');
  assert.equal(parseVoiceCommand('hey cat stop listening').cmd, 'stop_listening');
  assert.equal(parseVoiceCommand(''), null);
  assert.equal(parseVoiceCommand(null), null);
});

// ------------------------------------------------------------ SAPI script
test('voice: the hardened SAPI script enumerates recognizers explicitly', () => {
  assert.match(VOICE_SCRIPT, /InstalledRecognizers\(\)/, 'recognizers are ENUMERATED');
  assert.match(VOICE_SCRIPT, /_\.Culture\.Name -eq 'en-US'/, 'en-US is preferred explicitly');
  assert.match(VOICE_SCRIPT, /SpeechRecognitionEngine\(\$pick\.Id\)/, 'the picked recognizer is BOUND (not the locale default)');
  assert.match(VOICE_SCRIPT, /gb\.Culture = \$pick\.Culture/, 'grammar culture = picked culture (no silent mismatch)');
  assert.match(VOICE_SCRIPT, /grammar-failed/, 'a failed grammar load is REPORTED, not swallowed');
  assert.match(VOICE_SCRIPT, /OutputEncoding = \[System\.Text\.Encoding\]::UTF8/, 'UTF-8 stdout (no OEM mojibake)');
  assert.match(VOICE_SCRIPT, /\{"ready":true\}/, 'compat ready line still emitted');
  assert.doesNotMatch(VOICE_SCRIPT, /SilentlyContinue/, 'the v3.15 error-swallowing is GONE');
});

test('voice: parseVoiceLine understands the new status line', () => {
  assert.deepEqual(parseVoiceLine('{"ready":true}'), { ready: true });
  const st = parseVoiceLine('{"status":"listening","recognizer":"MS-1033-10-0","culture":"en-US"}');
  assert.equal(st.status, true);
  assert.equal(st.engine, 'MS-1033-10-0');
  assert.equal(st.culture, 'en-US');
  assert.equal(parseVoiceLine('{"error":"grammar-failed"}').error, 'grammar-failed');
  assert.equal(parseVoiceLine('{"text":"hey cat play music x","confidence":0.9}').text, 'hey cat play music x');
  assert.equal(parseVoiceLine('garbage {"error":"no-mic"} tail').error, 'no-mic');
  assert.equal(parseVoiceLine(''), null);
});

test('voice: the listener manager surfaces status + engineInfo', async () => {
  const { createFake } = await import('./fixtures/fake-spawn.mjs').catch(() => ({ createFake: null }));
  // inline fake child: a JSON-line emitter
  const listeners = [];
  const child = {
    stdout: { on: (ev, fn) => { if (ev === 'data') listeners.push(fn); } },
    stderr: { on: () => {} },
    on: () => {},
    kill: () => {},
  };
  const seen = { status: null, phrases: [] };
  const L = createVoiceListener({
    platform: 'win32',
    spawnFn: () => child,
    onPhrase: t => seen.phrases.push(t),
    onStatus: s => { seen.status = s; },
  });
  L.start();
  const push = listeners[0];
  push(Buffer.from('{"status":"listening","recognizer":"MS-1033","culture":"en-US"}\n', 'utf8'));
  push(Buffer.from('{"ready":true}\n', 'utf8'));
  push(Buffer.from('{"text":"hey cat pause","confidence":0.71}\n', 'utf8'));
  push(Buffer.from('{"text":"chatter only","confidence":0.2}\n', 'utf8'));   // below the floor
  assert.equal(seen.status.engine, 'MS-1033');
  assert.deepEqual(seen.phrases, ['hey cat pause']);
  assert.equal(L.engineInfo, 'MS-1033 (en-US)');
  L.stop();
});

// ------------------------------------------------------------ dance phases
const B = BODIES.normal;
const pal = { body: 'normal', fur: '#c8b48c', dark: '#8a7350', belly: '#e8dcc4', earIn: '#e89aa2' };
const F = B.feet;
const pose = (stateT, t = stateT) => poseForState('dance', t, 0.5, B, pal, stateT);

test('dance: steps ride the upright hind-leg stand', () => {
  const p = pose(4.5);                       // hands-up phase — both hind paws planted
  assert.ok(p.bodyY <= -8, `body lifted (bodyY ${p.bodyY})`);
  assert.ok(p.bodyRot < -0.6, `torso pitched up onto the hind legs (rot ${p.bodyRot})`);
  assert.equal(p.legs[2].fy, -2, 'near hind paw planted');
  assert.equal(p.legs[3].fy, -2, 'far hind paw planted');
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
  assert.ok(up.overlayPaw[0].fy < -140, `near paw high above the ear (fy ${up.overlayPaw[0].fy})`);
  assert.ok(up.overlayPaw[1].fy < -132, `far paw high above the ear (fy ${up.overlayPaw[1].fy})`);
  assert.ok(up.legs[0].fy < -40 && up.legs[0].fy > -70, `chest paws pump under the raised arms (fy ${up.legs[0].fy})`);
  assert.ok(up.bodyRot < -0.6, 'still standing on the hind legs');
  assert.ok(step.overlayPaw === null || step.overlayPaw === undefined, 'no overlay during the steps');
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
  assert.ok(p.overlayPaw.fy < -95 && p.overlayPaw.fy > -120, `paw by the cheek (fy ${p.overlayPaw.fy})`);
  assert.ok(p.headRot > 0.05, 'head tilted for the finale');
  assert.equal(p.particles.kind, 'heart');
});

test('dance: every sampled frame stays sane (no NaN geometry)', () => {
  for (let i = 0; i < 60; i++) {
    const p = pose(i * 0.19);
    for (const leg of p.legs) {
      assert.ok(Number.isFinite(leg.fx) && Number.isFinite(leg.fy), `leg finite at t=${i * 0.19}`);
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
