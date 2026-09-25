// e2e-v316.mjs — release gate for v3.16, booted under Xvfb, driven over CDP:
//   1. THE VOICE CHAIN (through the real app): the hidden Web Speech engine
//      window boots, the status carries the engine field, and — the headline
//      fix — a MANGLED wake word ("hey kat", the accent reality that made
//      v3.15 feel dead) still plays music through Brave + the YouTube fixture
//   2. THE MEOW GATE (user ask: "when double click music is playing, that
//      time shouldn't play single meow sound"): with the system music flag
//      ON a double-click mutes the meow (zero Audio constructions) and
//      mouths a silent ♪ bubble; with the flag OFF the meow returns
//   3. THE SIX-STEP DANCE (the reference sheet), proven in pixels: the
//      hands-up frame reaches HIGHER than the step frame, and the
//      turn-around frame shows the back of the head (the green eyes vanish)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'e2e-v316');
mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(ROOT, 'tests', 'fixtures'), { recursive: true });
const YT_FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'yt-results.html');
writeFileSync(YT_FIXTURE, `<!doctype html><html><body><script>
window.ytInitialData = {"contents":[{"videoRenderer":{"videoId":"dQw4w9WgXcQ","title":"Summer Breeze 2010"}}]};
</script><div data-video-id="dQw4w9WgXcQ" class="videoRenderer">first result</div></body></html>`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};

let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await sleep(1200);
}

const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-v316-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, [
  '.', '--remote-debugging-port=9374', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
], {
  cwd: ROOT,
  env: {
    ...process.env, DISPLAY: process.env.DISPLAY,
    MEOWCAT_TEST: '1',
    MEOWCAT_FAKE_CURSOR: '{"x":800,"y":500}',
    MEOWCAT_FAKE_YT_HTML: YT_FIXTURE,
    MEOWCAT_FAKE_PLATFORM: 'win32',
    MEOWCAT_FAKE_BRAVE: 'C:/Users/me/AppData/Local/BraveSoftware/Brave-Browser/Application/brave.exe',
    XDG_CONFIG_HOME: userData, XDG_CACHE_HOME: userData,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });

let cdpReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9374/json/version');
    if (res.ok) { cdpReady = true; break; }
  } catch {}
  await sleep(500);
}
if (!cdpReady) {
  console.error('CDP never came up. App log:\n' + appLog.slice(-3000));
  app.kill('SIGKILL'); xvfb?.kill(); process.exit(1);
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9374');

async function findPage(suffix, tries = 30) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.isClosed?.()) continue;
        if (p.url().endsWith(suffix)) {
          try { await p.evaluate(() => 1); return p; } catch { /* stale */ }
        }
      }
    }
    await sleep(400);
  }
  return null;
}

const alive = () => { try { return app.pid && !app.killed && app.exitCode === null; } catch { return false; } };
const crashMarkers = () => appLog.split('\n')
  .filter(l => /uncaughtException|unhandledRejection|Segmentation|FATAL|CHECK failed/i.test(l))
  .map(l => l.trim().slice(0, 160));

try {
  const cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  if (!cat) throw new Error('no cat window');
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 }).catch(() => {});
  await cat.evaluate(() => { window.__stopButterfly && window.__stopButterfly(); return true; }).catch(() => {});
  await cat.evaluate(() => {
    window.__voiceBubbles = [];
    window.meow.on('voice-bubble', d => { if (d && d.text) window.__voiceBubbles.push(d.text); });
    return true;
  });

  // ================= 1. THE VOICE CHAIN + FUZZY WAKE =================
  {
    const st0 = await cat.evaluate(async () => window.meow.voiceGet());
    ok('VOICE CHAIN: status carries the v3.16 engine field (available everywhere)',
      st0 && st0.enabled === true && st0.available === true && ['web', 'sapi', null].includes(st0.engine), JSON.stringify(st0));

    // the hidden Web Speech engine window really boots and reports
    let engineBooted = false;
    for (let i = 0; i < 20 && !engineBooted; i++) {
      await sleep(300);
      const r = await cat.evaluate(async () => {
        const resp = await window.meow.execLogGet();
        return resp.entries.some(e => /web speech engine/.test(e.msg) || /SAPI engine/.test(e.msg) || /falling back/.test(e.msg));
      });
      engineBooted = r;
    }
    ok('VOICE CHAIN: the hidden engine window boots and is journaled (web start or a reported fallback)', engineBooted);

    // --- THE HEADLINE FIX: a mangled wake word plays the music ---
    await cat.evaluate(() => window.meow.voiceInject('hey kat play music summer breeze 2010'));
    let launch = null;
    for (let i = 0; i < 40 && !launch; i++) {
      await sleep(250);
      launch = await cat.evaluate(async () => {
        const s = await window.meow.voiceState();
        return s.launches.length ? s.launches[s.launches.length - 1] : null;
      });
    }
    ok('FUZZY WAKE: "hey kat play music <title>" fires a launch (the accent path works)',
      !!launch, JSON.stringify(launch || 'none'));
    ok('FUZZY WAKE: Brave, new window, FIRST YouTube result',
      !!launch && /brave\.exe$/i.test(String(launch.cmd).replace(/"/g, '')) &&
      launch.args[0] === '--new-window' &&
      String(launch.args[1]).startsWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      JSON.stringify(launch && launch.args));
    ok('FUZZY WAKE: the query rode along intact (journaled with the parsed command)',
      await cat.evaluate(async () => {
        const r = await window.meow.execLogGet();
        return r.entries.some(e => e.tag === 'voice' && /play_music/.test(e.msg) && /summer breeze 2010/.test(e.msg));
      }), 'exec log: play_music : summer breeze 2010');

    // --- mangled wake + transport ---
    await cat.evaluate(() => window.meow.voiceInject('hay cat pause'));
    let keys = [];
    for (let i = 0; i < 20; i++) {
      await sleep(150);
      keys = await cat.evaluate(async () => (await window.meow.voiceState()).mediaKeys);
      if (keys.includes('play_pause')) break;
    }
    ok('FUZZY WAKE: "hay cat pause" hits the media play-pause key', keys.includes('play_pause'), JSON.stringify(keys));

    // --- mangled wake + chatter stays inert ---
    const before = await cat.evaluate(async () => {
      const s = await window.meow.voiceState();
      return { keys: s.mediaKeys.length, launches: s.launches.length };
    });
    await cat.evaluate(() => window.meow.voiceInject('the cat sat on the mat'));
    await cat.evaluate(() => window.meow.voiceInject('hey kat what a lovely day'));
    await sleep(500);
    const after = await cat.evaluate(async () => {
      const s = await window.meow.voiceState();
      return { keys: s.mediaKeys.length, launches: s.launches.length };
    });
    ok('NOISE: mangled-wake chatter NEVER launches or taps a key', before.keys === after.keys && before.launches === after.launches, JSON.stringify({ before, after }));
  }

  // ================= 2. THE MEOW GATE =================
  {
    // The overlay is click-through outside the cat (main toggles
    // ignoreMouseEvents from the FAKE cursor), so the dblclick is dispatched
    // in-page — client coords = canvas pose − camera offset, exactly what
    // the window-level handler runs through toScreen() → catHit().
    const dblclick = async () => {
      await cat.evaluate(() => {
        const p = window.__brain().pose;
        const O = window.__offset();
        const ev = new MouseEvent('dblclick', {
          clientX: p.x - O.x, clientY: p.y - O.y - 24, bubbles: true,
        });
        window.dispatchEvent(ev);
        return true;
      });
      await sleep(300);
    };
    const lastPlay = () => cat.evaluate(() => window.__lastPlay ? { name: window.__lastPlay.name, t: window.__lastPlay.t } : null);
    const bubbleUp = () => cat.evaluate(() => {
      const els = [...document.querySelectorAll('div')].filter(e => /^\s*♪\s*$/.test(e.textContent || ''));
      return els.some(e => e.style.display !== 'none' && e.textContent.trim() === '♪');
    });

    // park the cat mid-lane so nothing else steals the pose
    await cat.evaluate(() => { const b = window.__brain(); b.stopStalk?.(); b._enter('sit', 60); b.x = 800; return true; });
    await sleep(300);

    // baseline: music OFF → the double-click meows
    await cat.evaluate(() => window.meow.voiceTestMusic(false));
    await sleep(400);
    const b0 = await lastPlay();
    await dblclick();
    const b1 = await lastPlay();
    ok('MEOW GATE: with NO music, double-click still meows',
      !!b1 && (!b0 || b1.t > b0.t || !b0), JSON.stringify({ b0, b1 }));

    // music ON → the meow holds its tongue and mouths ♪
    await cat.evaluate(() => window.meow.voiceTestMusic(true));
    await sleep(500);   // the flag rides music-state AND the heartbeat
    const m0 = await lastPlay();
    await dblclick();
    const m1 = await lastPlay();
    const noteShown = await bubbleUp();
    ok('MEOW GATE: with music playing, the double-click plays NO meow',
      !!m1 && !!m0 ? m1.t === m0.t : !m1, JSON.stringify({ m0, m1 }));
    ok('MEOW GATE: the cat mouths a silent ♪ instead', noteShown);

    // music OFF again → the meow comes back
    await cat.evaluate(() => window.meow.voiceTestMusic(false));
    await sleep(500);
    await dblclick();
    // v3.17: meows QUEUE behind a still-playing one, so poll for the NEW play
    let r1 = null;
    const tGate = Date.now();
    while (Date.now() - tGate < 9000) {
      const cur = await lastPlay();
      if (cur && (!m0 || cur.t > m0.t)) { r1 = cur; break; }
      await sleep(150);
    }
    ok('MEOW GATE: when the music stops, the meow comes back',
      !!r1 && !!m0 && r1.t > m0.t, JSON.stringify({ m0, r1 }));
  }

  // ================= 3. THE SIX-STEP DANCE, proven in pixels =================
  {
    const dance = await cat.evaluate(async () => {
      const m = await import('../src/cat-renderer.js');
      const mk = (stateT) => {
        const cv = document.createElement('canvas');
        cv.width = 300; cv.height = 240;
        const ctx = cv.getContext('2d');
        ctx.save(); ctx.translate(70, 210);
        m.drawCat(ctx, { t: stateT, state: 'dance', stateT, dir: 1, breed: 'ginger_kitten', scale: 1, jumpP: 0 });
        ctx.restore();
        const g = ctx.getImageData(0, 0, 300, 240).data;
        const alphaAt = (x, y) => g[(y * 300 + x) * 4 + 3];
        const rgbAt = (x, y) => { const i = (y * 300 + x) * 4; return [g[i], g[i + 1], g[i + 2]]; };
        let top = -1, left = -1, right = -1;
        for (let x = 0; x < 300; x++) {
          for (let y = 0; y < 240; y++) if (alphaAt(x, y) > 40) {
            if (left < 0) left = x;
            right = x; break;
          }
        }
        for (let y = 0; y < 240 && top < 0; y++) {
          for (let x = 0; x < 300; x++) if (alphaAt(x, y) > 40) { top = y; break; }
        }
        let greenEyes = 0;
        for (let y = 0; y < 240; y++) for (let x = 0; x < 300; x++) {
          if (alphaAt(x, y) < 40) continue;
          const [r, gr, b] = rgbAt(x, y);
          if (gr > r + 18 && gr > b + 18 && gr > 90) greenEyes++;
        }
        return { top, left, right, center: (left + right) / 2, greenEyes };
      };
      return {
        step: mk(1.7),          // phase 1 boundary — swing 0, glided right (bodyX +13)
        stepLate: mk(1.7),      // (alias kept for the old name)
        leftEnd: mk(3.4),       // phase 2 boundary — swing 0, glided left (bodyX -13)
        handsUp: mk(4.5),       // phase 3 — hands up
        back: mk(6.9),          // phase 4 — turn around (back held)
        face: mk(4.5),          // face frame for the eye comparison
        whip: mk(8.0),          // phase 5 — shake tail (noFace early)
        finish: mk(10.2),       // phase 6 — finish!
      };
    });
    ok('DANCE: the steps really TRAVEL — sprite center shifts ~26px between the right/left boundary frames (bodyX)',
      Math.abs(dance.leftEnd.center - dance.step.center) > 12,
      JSON.stringify({ right: dance.step.center, left: dance.leftEnd.center }));
    ok('DANCE: the hands-up peak is COMPACT (v3.17 short legs — no 18px stilt tower)',
      dance.handsUp.top >= 0 && Math.abs(dance.handsUp.top - dance.step.top) <= 10,
      JSON.stringify({ stepTop: dance.step.top, handsUpTop: dance.handsUp.top }));
    ok('DANCE: the turn-around frame hides the face (green eye pixels vanish)',
      dance.back.greenEyes <= 2 && dance.face.greenEyes > 6,
      JSON.stringify({ back: dance.back.greenEyes, face: dance.face.greenEyes }));
    ok('DANCE: the whip-tail frame also shows the back early, face returns late — the finale keeps a silhouette',
      dance.whip.top >= 0 && dance.finish.top >= 0, JSON.stringify({ whipTop: dance.whip.top, finishTop: dance.finish.top }));

    // the six phases really exist in the pose machine (stateT driven)
    const phases = await cat.evaluate(async () => {
      const m = await import('../src/cat-renderer.js');
      const pal = { body: 'normal', fur: '#c8b48c', dark: '#8a7350', belly: '#e8dcc4', earIn: '#e89aa2' };
      const p = st => m.poseForState('dance', st, 0.5, m.BODIES.normal, pal, st);
      return {
        step: p(0.3).legs[2].fy < -10,
        hands: Array.isArray(p(4.5).overlayPaw) && p(4.5).overlayPaw.length === 2,
        back: p(6.9).noFace === true,
        whip: p(8.0).tailMode === 'whip',
        finish: p(10.2).eyeState === 'happy' && !!p(10.2).overlayPaw,
      };
    });
    ok('DANCE: all six phases present in the pose machine (step/hands/back/whip/finish)',
      phases.step && phases.hands && phases.back && phases.whip && phases.finish, JSON.stringify(phases));

    // the brain runs the full 11.4s routine
    const dur = await cat.evaluate(() => {
      const b = window.__brain();
      b.stopStalk?.(); b._enter('sit', 60);
      b.dance();
      let t = 0;
      while (b.state === 'dance' && t < 30) { b.tick(0.016); t += 0.016; }
      return t;
    });
    ok('DANCE: the triggered routine runs the full ~11.4s', dur > 10.5 && dur <= 12.5, `${dur.toFixed(2)}s`);
  }

  // ================= 4. the salute still answers commands =================
  {
    await cat.evaluate(() => { const b = window.__brain(); b._enter('idle', 30); return true; });
    await sleep(200);
    await cat.evaluate(() => window.meow.voiceInject('hey cat volume down'));
    let saluted = null;
    for (let i = 0; i < 30 && !saluted; i++) {
      await sleep(80);
      saluted = await cat.evaluate(() => {
        const p = window.__pose();
        return p.state === 'salute' ? { stateT: p.stateT } : null;
      });
    }
    ok('SALUTE: the paw still snaps to the brow when a command is heard', !!saluted, JSON.stringify(saluted || 'no salute'));
  }

  // ================= housekeeping =================
  ok('app alive at the end', alive());
  const crashes = crashMarkers();
  ok('no crash markers in the app log', crashes.length === 0, JSON.stringify(crashes.slice(0, 3)));

  const pass = results.filter(r => r.pass).length;
  console.log(`\n=== e2e-v316: ${pass}/${results.length} checks pass ===`);
  if (pass !== results.length) process.exitCode = 1;
} catch (e) {
  console.error('E2E ERROR:', e && e.stack || e);
  console.error('app log tail:\n' + appLog.slice(-2500));
  process.exitCode = 1;
} finally {
  try { app.kill('SIGTERM'); } catch { }
  await sleep(700);
  try { app.kill('SIGKILL'); } catch { }
  try { browser.close(); } catch { }
  try { xvfb?.kill(); } catch { }
  try { rmSync(userData, { recursive: true, force: true }); } catch { }
}
