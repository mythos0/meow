// v315.test.mjs — voice commands, the music launcher, the real-hunt loop
// geometry and the head-attach fix. node --test tests/v315.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceCommand, normalizePhrase, WAKE_WORDS } from '../src/voice.js';
import {
  buildSearchUrl, buildWatchUrl, extractFirstVideoId,
  braveCandidates, createMusicLauncher,
} from '../src/music-launcher.js';
import { VOICE_SCRIPT, parseVoiceLine, createVoiceListener } from '../src/voice-listener.js';
import {
  spawnButterfly, tickButterfly, dodgeButterfly, swatCatchable, SWAT_RADIUS,
} from '../src/butterfly.js';

const step = (bf, secs, { t0 = 0, catX, lane = { x: 0, w: 1600 }, groundY = 1000 } = {}) => {
  let last = null;
  for (let i = 0; i < Math.round(secs / 0.05); i++) {
    last = tickButterfly(bf, { dt: 0.05, now: t0 + i * 0.05, lane, groundY, catX });
  }
  return last;
};

// ------------------------------------------------------------ voice parser
test('voice: the exact user flow — hey cat + play music + <title>', () => {
  const r = parseVoiceCommand('hey cat play music ghum kariya nilo sokhi');
  assert.equal(r.cmd, 'play_music');
  assert.equal(r.query, 'ghum kariya nilo sokhi');
  assert.equal(r.woke, true);
});

test('voice: punctuation and case never break the parse', () => {
  const r = parseVoiceCommand('Hey Cat, play music Ghum Kariya Nilo Sokhi!');
  assert.equal(r.cmd, 'play_music');
  assert.equal(r.query, 'ghum kariya nilo sokhi');
});

test('voice: bare music play without wake only fires when music is named', () => {
  assert.equal(parseVoiceCommand('play music bohemian rhapsody').cmd, 'play_music');
  assert.equal(parseVoiceCommand('play song shape of you').query, 'shape of you');
  assert.equal(parseVoiceCommand('put on take five').cmd, 'play_music');
  // plain "play <something>" with no wake word stays inert
  assert.equal(parseVoiceCommand('play football'), null);
});

test('voice: transport + volume controls, with and without the wake word', () => {
  for (const [phrase, cmd] of [
    ['hey cat pause', 'pause'], ['pause the music', 'pause'],
    ['hey cat resume', 'resume'], ['continue', 'resume'],
    ['hey cat stop the music', 'stop_music'], ['stop music', 'stop_music'],
    ['hey cat next song', 'next'], ['skip', 'next'],
    ['hey cat previous song', 'previous'], ['go back', 'previous'],
    ['hey cat volume up', 'volume_up'], ['louder', 'volume_up'],
    ['hey cat volume down', 'volume_down'], ['quieter', 'volume_down'],
    ['mute', 'mute'], ['unmute', 'unmute'],
  ]) assert.equal(parseVoiceCommand(phrase).cmd, cmd, phrase);
});

test('voice: "stop listening" wins over "stop the music"; noise stays null', () => {
  assert.equal(parseVoiceCommand('hey cat stop listening').cmd, 'stop_listening');
  assert.equal(parseVoiceCommand('the cat sat on the mat'), null);
  assert.equal(parseVoiceCommand('I played football yesterday'), null);
  assert.equal(parseVoiceCommand(''), null);
  assert.equal(parseVoiceCommand(null), null);
});

test('voice: wake-only and unknown are distinct states the cat can answer to', () => {
  assert.equal(parseVoiceCommand('hey cat').cmd, 'wake_only');
  const r = parseVoiceCommand('hey cat meow loudly');
  assert.equal(r.cmd, 'unknown');
  assert.equal(r.woke, true);
});

test('voice: query is capped at 120 chars', () => {
  const r = parseVoiceCommand('hey cat play music ' + 'a'.repeat(400));
  assert.ok(r.query.length <= 120);
});

// ------------------------------------------------------------ music launcher
test('launcher: URLs and first-result extraction', () => {
  assert.equal(buildSearchUrl('ghum kariya'), 'https://www.youtube.com/results?search_query=' + encodeURIComponent('ghum kariya'));
  assert.equal(buildWatchUrl('abc12345678'), 'https://www.youtube.com/watch?v=abc12345678&autoplay=1');
  const html = '{"contents":[{"videoRenderer":{"videoId":"dQw4w9WgXcQ"}}]}';
  assert.equal(extractFirstVideoId(html), 'dQw4w9WgXcQ');
  assert.equal(extractFirstVideoId('garbage without ids'), null);
  assert.equal(extractFirstVideoId(''), null);
  assert.equal(extractFirstVideoId(null), null);
});

test('launcher: Brave is preferred when its exe exists, default browser otherwise', async () => {
  const env = { LOCALAPPDATA: 'C:/Users/me/AppData/Local', ProgramFiles: 'C:/Program Files' };
  const cands = braveCandidates(env);
  assert.ok(cands[0].endsWith('BraveSoftware/Brave-Browser/Application/brave.exe'.replace(/\//g, path.sep)));
  const launches = [];
  const mk = (exists) => createMusicLauncher({
    platform: 'win32', env,
    existsFn: p => exists(p),
    fetchFn: async () => ({ text: async () => '{"videoRenderer":{"videoId":"dQw4w9WgXcQ"}}' }),
    spawnFn: (cmd, args) => launches.push({ cmd, args }),
  });
  const r1 = await mk(p => p.includes('AppData')).play('test song');
  assert.equal(r1.browser, 'brave');
  assert.equal(r1.videoId, 'dQw4w9WgXcQ');
  assert.ok(launches[0].cmd.includes('brave.exe'));
  assert.deepEqual(launches[0].args, ['--new-window', buildWatchUrl('dQw4w9WgXcQ')]);
  const r2 = await mk(() => false).play('test song');
  assert.equal(r2.browser, 'default');
  assert.equal(launches[1].cmd, 'cmd.exe');
  assert.deepEqual(launches[1].args.slice(0, 3), ['/c', 'start', '']);
});

test('launcher: search-page fallback when the fetch yields nothing', async () => {
  const launches = [];
  const r = await createMusicLauncher({
    platform: 'win32', env: {},
    existsFn: () => false,
    fetchFn: async () => ({ text: async () => '<html>no ids here</html>' }),
    spawnFn: (cmd, args) => launches.push({ cmd, args }),
  }).play('obscure song');
  assert.equal(r.videoId, null);
  assert.ok(r.url.includes('/results?search_query='));
  assert.equal(r.ok, true);
});

test('launcher: empty query never launches anything', async () => {
  const r = await createMusicLauncher({ platform: 'win32', fetchFn: async () => { throw new Error('no'); } }).play('  ');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'empty-query');
});

import path from 'node:path';

// ------------------------------------------------------------ voice listener
test('listener: the SAPI script is Windows PowerShell and grammar-shaped', () => {
  assert.ok(VOICE_SCRIPT.includes('System.Speech'));
  assert.ok(VOICE_SCRIPT.includes("SetInputToDefaultAudioDevice"));
  assert.ok(VOICE_SCRIPT.includes("RecognizeMode]::Multiple"));
  assert.ok(VOICE_SCRIPT.includes("'hey cat'"), 'the wake word is in the grammar');
  assert.ok(VOICE_SCRIPT.includes('AppendDictation'), 'the song title rides free dictation');
  assert.ok(VOICE_SCRIPT.includes('no-mic'), 'a missing microphone is reported, not a crash');
});

test('listener: stdout lines parse into phrases / ready / errors', () => {
  assert.deepEqual(parseVoiceLine('{"text":"hey cat pause","confidence":0.87}'), { text: 'hey cat pause', confidence: 0.87 });
  assert.deepEqual(parseVoiceLine('{"ready":true}'), { ready: true });
  assert.deepEqual(parseVoiceLine('{"error":"no-mic"}'), { error: 'no-mic' });
  assert.equal(parseVoiceLine('garbage'), null);
  assert.equal(parseVoiceLine(''), null);
  // a huge text is capped, a wild confidence is clamped
  const p = parseVoiceLine(JSON.stringify({ text: 'x'.repeat(500), confidence: 9 }));
  assert.equal(p.text.length, 200);
  assert.equal(p.confidence, 1);
});

test('listener: phrases below the confidence floor never reach the handler', () => {
  let seen = [];
  // fake child process object
  const handlers = {};
  const fakeChild = {
    stdout: { on: (ev, fn) => { handlers['stdout:' + ev] = fn; } },
    stderr: { on: () => {} },
    on: (ev, fn) => { handlers[ev] = fn; },
    kill: () => {},
  };
  const L = createVoiceListener({
    platform: 'win32',
    spawnFn: () => fakeChild,
    onPhrase: (text, conf) => seen.push({ text, conf }),
  });
  L.start();
  handlers['stdout:data']?.(Buffer.from('{"ready":true}\n{"text":"the cat sat on the mat","confidence":0.95}\n'));
  assert.equal(seen.length, 1, 'the listener streams RAW phrases — the parser in main decides meaning');
  // the CONFIDENCE floor is the listener's own gate:
  seen = [];
  handlers['stdout:data']?.(Buffer.from('{"text":"hey cat pause","confidence":0.1}\n'));
  assert.equal(seen.length, 0, 'low-confidence chatter is dropped');
  handlers['stdout:data']?.(Buffer.from('{"text":"hey cat pause","confidence":0.9}\n'));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].text, 'hey cat pause');
  L.stop();
});

test('listener: non-win32 platforms never spawn anything', () => {
  let spawned = 0;
  const L = createVoiceListener({ platform: 'linux', spawnFn: () => { spawned++; return {}; } });
  L.start();
  assert.equal(L.running, false);
  assert.equal(spawned, 0);
  L.stop();
});

// ------------------------------------------------------------ salute + dance
test('salute: a heard command snaps the cat to the salute (unless mid-hunt)', async () => {
  const { CatBrain, CAT_WEIGHTS, ACTIONS } = await import('../src/cat-brain.js');
  const b = new CatBrain({ rand: () => 0.5 });
  b.saluteNow();
  assert.equal(b.state, 'salute');
  for (let i = 0; i < 100; i++) b.tick(0.02);   // 2s > 1.7s pose
  assert.notEqual(b.state, 'salute', 'the salute releases on its own');
  // mid-hunt the pose is refused (bubbles alone acknowledge)
  b.startStalk(500, 500, 'butterfly');
  const before = b.state;
  const allowed = b.saluteNow();
  assert.equal(allowed, false, 'no salute while stalking');
  assert.equal(b.state, before);
});

test('salute: never randomly selected — it is event-driven only', async () => {
  const { CatBrain, ACTIONS } = await import('../src/cat-brain.js');
  const b = new CatBrain({ rand: () => 0.5 });
  assert.ok(ACTIONS.includes('salute'), 'the pose exists');
  assert.equal(b.weights.salute, undefined, 'but carries no ambient weight');
  assert.equal(b.weights.rear, undefined, 'like the rear');
});

test('dance: the user-triggered dance runs the FULL 8.6s routine', async () => {
  const { CatBrain } = await import('../src/cat-brain.js');
  const b = new CatBrain({ rand: () => 0.5 });
  b.dance();
  assert.equal(b.state, 'dance');
  for (let i = 0; i < 420; i++) b.tick(0.02);   // 8.4s — still dancing (phase D)
  assert.equal(b.state, 'dance', 'the routine is still going at 8.4s');
  for (let i = 0; i < 20; i++) b.tick(0.02);    // past 8.6s
  assert.notEqual(b.state, 'dance', 'and ends after the finale');
});

// ------------------------------------------------------------ hunt geometry
test('hunt: the rearing paw cannot reach a HIGH hover — swats miss (dodge loop)', () => {
  const pawX = 426, pawY = 1000 - 104;                    // cat.html paw point
  const bf = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 0, rand: () => 0.5 });
  bf.x = 430; bf.y = 1000 - 180;                          // a HIGH hover position
  assert.equal(swatCatchable(bf, pawX, pawY), false, '180px up is out of the 54px paw radius');
  // within reach only when the butterfly truly dips to the paw
  bf.y = 1000 - 100;
  assert.equal(swatCatchable(bf, pawX, pawY), true, 'a dip inside ~54px of the paw connects');
  assert.ok(SWAT_RADIUS === 54, 'radius tightened 66 -> 54');
});

test('hunt: after a dodge the butterfly returns to the hunted hover near the cat', () => {
  const bf = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 0, rand: () => 0.3 });
  bf.x = 430; bf.y = 1000 - 120; bf.state = 'hunted';
  dodgeButterfly(bf, 400, 880, 0, () => 0);               // swat missed → dodge
  assert.equal(bf.state, 'flee');
  assert.ok(bf.climb > 0, 'the dodge carries a sharp climb');
  step(bf, 2.0, { t0: 0, catX: 410 });                    // flee window passes
  assert.equal(bf.state, 'hunted', 'back to the nervous hover (the cat is still there)');
  // but if the cat gave up and wandered off, it stays calm
  const bf2 = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 0, rand: () => 0.3 });
  bf2.x = 430; bf2.y = 1000 - 120; bf2.state = 'hunted';
  dodgeButterfly(bf2, 400, 880, 0, () => 0);
  step(bf2, 2.0, { t0: 0, catX: 2000 });                  // the cat is far away now
  assert.equal(bf2.state, 'cruise', 'free to cruise away once the hunt is over');
});

test('hunt: the dip cycle is deterministic — a full loop always enters paw reach', () => {
  // pin the exact swat geometry and simulate a hunt where the cat holds still
  const pawX = 426, pawY = 896;                           // 104px above ground 1000
  let connected = false;
  const bf = spawnButterfly({ lane: { x: 0, w: 1600 }, catX: 400, groundY: 1000, now: 0, rand: () => 0.5 });
  bf.x = 430; bf.y = 900; bf.state = 'hunted';
  for (let i = 0; i < 160; i++) {                         // 8s at 50ms — two+ cycles
    tickButterfly(bf, { dt: 0.05, now: i * 0.05, lane: { x: 0, w: 1600 }, groundY: 1000, catX: 400 });
    if (swatCatchable(bf, pawX, pawY)) { connected = true; break; }
  }
  assert.equal(connected, true, 'within two dip cycles the butterfly comes into paw reach');
});
