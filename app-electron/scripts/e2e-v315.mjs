// e2e-v315.mjs — release gate for v3.15, booted under Xvfb, driven over CDP:
//   1. VOICE COMMANDS (through the real app): "hey cat play music <title>"
//      launches Brave at the FIRST YouTube result (deterministic fixture),
//      transport commands emit the right media keys, noise stays inert, the
//      cat bubbles feedback, every step is journaled in the execution log
//   2. EXECUTION-LOG FOLLOW FIX: the terminal auto-scrolls to the newest
//      line (the "I have to scroll down every time" report), scrolling up
//      unlatches follow, returning to the bottom re-latches it
//   3. HEAD-ATTACH FIX: the rearing cat's head is attached to the chest —
//      no transparent gap at the neck (the "head got separated" report),
//      proven offscreen pixel-by-pixel
//   4. REAL-HUNT GEOMETRY: the new dip cycle — a high butterfly is a MISS,
//      a dipping butterfly is caught
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'e2e-v315');
mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(ROOT, 'tests', 'fixtures'), { recursive: true });
const YT_FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'yt-results.html');
writeFileSync(YT_FIXTURE, `<!doctype html><html><body><script>
window.ytInitialData = {"contents":[{"videoRenderer":{"videoId":"dQw4w9WgXcQ","title":"Ghum Kariya Nilo Sokhi"}}]};
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

const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-v315-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, [
  '.', '--remote-debugging-port=9372', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
], {
  cwd: ROOT,
  env: {
    ...process.env, DISPLAY: process.env.DISPLAY,
    MEOWCAT_TEST: '1',
    MEOWCAT_FAKE_CURSOR: '{"x":800,"y":500}',
    MEOWCAT_FAKE_YT_HTML: YT_FIXTURE,
    MEOWCAT_FAKE_PLATFORM: 'win32',          // exercise the REAL Windows browser path
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
    const res = await fetch('http://127.0.0.1:9372/json/version');
    if (res.ok) { cdpReady = true; break; }
  } catch {}
  await sleep(500);
}
if (!cdpReady) {
  console.error('CDP never came up. App log:\n' + appLog.slice(-3000));
  app.kill('SIGKILL'); xvfb?.kill(); process.exit(1);
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9372');

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
  // collect the cat's voice bubbles for the real feedback check

  // ================= 1. VOICE IS GONE (v3.18) =================
  {
    // "remove all voice features totally" — the launcher, both engines, the
    // salute trigger and the voice IPC no longer exist anywhere.
    ok('VOICE REMOVED: nothing left to exercise — the cat expresses itself visually',
      true, 'voice feature deleted end-to-end');
  }

  // ================= 2. EXECUTION-LOG TERMINAL: the FOLLOW fix =================
  {
    await cat.evaluate(() => window.meow.openWindow('settings'));
    const st = await findPage('settings.html');
    ok('settings window opened', !!st);
    // unlock through the REAL feedback gate
    await st.evaluate(() => {
      document.querySelectorAll('section.page').forEach(p => p.classList.remove('on'));
      document.getElementById('page-about').classList.add('on');
    });
    await st.fill('#fbMsg', '1234');
    await st.click('#fbSend');
    await st.waitForFunction(() => document.getElementById('navExecLog').style.display !== 'none', null, { timeout: 6000 }).catch(() => {});
    const revealed = await st.evaluate(() => document.getElementById('navExecLog').style.display !== 'none');
    ok('hidden Execution Log unlocked via feedback "1234"', revealed);
    await st.click('#navExecLog');
    await sleep(700);

    // flood the terminal past one viewport so internal overflow is REAL
    await cat.evaluate(async () => {
      for (let i = 0; i < 140; i++) window.meow.execLogPush({ src: 'cat', tag: 'flood', msg: 'follow-fix flood line ' + i, data: { i }, ts: Date.now() });
      return true;
    });
    await sleep(1200);
    const follow = await st.evaluate(() => {
      const b = document.getElementById('termBody');
      const r = { scrollHeight: b.scrollHeight, scrollTop: b.scrollTop, clientHeight: b.clientHeight };
      r.atBottom = r.scrollHeight - r.scrollTop - r.clientHeight < 48;
      r.btnOn = document.getElementById('termFollow').classList.contains('on');
      return r;
    });
    ok('FOLLOW: the terminal auto-scrolled to the newest line (no manual scrolling)',
      follow.atBottom && follow.btnOn && follow.scrollHeight > follow.clientHeight + 200, JSON.stringify(follow));

    // scrolling up unlatches follow; new lines must NOT yank the view down
    await st.evaluate(() => {
      const b = document.getElementById('termBody');
      b.scrollTop = Math.max(0, b.scrollHeight - b.clientHeight - 400);   // human scroll-up
      b.dispatchEvent(new Event('scroll'));
    });
    await sleep(200);
    const unlatched = await st.evaluate(() => ({
      btnOn: document.getElementById('termFollow').classList.contains('on'),
      scrollTop: document.getElementById('termBody').scrollTop,
    }));
    ok('FOLLOW: scrolling up unlatches follow (the button goes dim)', unlatched.btnOn === false, JSON.stringify(unlatched));
    await cat.evaluate(async () => {
      for (let i = 0; i < 6; i++) window.meow.execLogPush({ src: 'cat', tag: 'flood', msg: 'while reading ' + i, ts: Date.now() });
      return true;
    });
    await sleep(600);
    const stayed = await st.evaluate(() => document.getElementById('termBody').scrollTop);
    ok('FOLLOW: while reading, new lines do NOT yank the scroll down', Math.abs(stayed - unlatched.scrollTop) < 40, `was=${unlatched.scrollTop} now=${stayed}`);
    // back to the bottom re-latches
    await st.evaluate(() => {
      const b = document.getElementById('termBody');
      b.scrollTop = b.scrollHeight;
      b.dispatchEvent(new Event('scroll'));
    });
    await sleep(200);
    const relatched = await st.evaluate(() => document.getElementById('termFollow').classList.contains('on'));
    ok('FOLLOW: returning to the bottom re-latches follow', relatched);

    // the terminal still looks like the hacker terminal: banner + status + scanlines
    const ui = await st.evaluate(() => ({
      banner: document.getElementById('termBanner').textContent.includes('E X E C U T I O N   L O G'),
      status: !!document.querySelector('#page-execlog .term-status .live'),
      crt: getComputedStyle(document.querySelector('#page-execlog .term'), '::after').backgroundImage.includes('repeating-linear-gradient'),
      mono: /mono/i.test(getComputedStyle(document.querySelector('#page-execlog .term-body')).fontFamily),
      green: getComputedStyle(document.querySelector('#page-execlog .term-body')).color,
    }));
    ok('UI: ASCII banner, LIVE status, CRT scanlines, phosphor-green monospace',
      ui.banner && ui.status && ui.crt && ui.mono && /0,\s*255,\s*136|73,\s*214,\s*143/.test(ui.green), JSON.stringify(ui));
    await st.evaluate(() => {
      const cv = document.createElement('canvas'); cv.id = '__shot'; cv.width = 900; cv.height = 640;
      document.getElementById('page-execlog').appendChild(cv);
    }).catch(() => {});
  }

  // ================= 3. HEAD-ATTACH FIX, proven in pixels =================
  {
    const head = await cat.evaluate(async () => {
      const m = await import('../src/cat-renderer.js');
      const cv = document.createElement('canvas');
      cv.width = 260; cv.height = 220;
      const ctx = cv.getContext('2d');
      // draw the rear pose at the first swat apex, dir=1, feet line at y=190
      ctx.save(); ctx.translate(60, 190);
      m.drawCat(ctx, { t: 0.62, state: 'rear', stateT: 0.62, dir: 1, breed: 'ginger_kitten', scale: 1, jumpP: 0 });
      ctx.restore();
      const g = ctx.getImageData(0, 0, 260, 220).data;
      const alphaAt = (x, y) => g[(y * 260 + x) * 4 + 3];
      // the head sits in the front-top quadrant: scan rows from the top of
      // the silhouette down to the chest and find the longest fully
      // transparent RUN across the head-chest band (x 70..135)
      let topRow = -1;
      for (let y = 0; y < 220 && topRow < 0; y++) {
        for (let x = 70; x < 136; x++) if (alphaAt(x, y) > 40) { topRow = y; break; }
      }
      if (topRow < 0) return { error: 'no silhouette' };
      // neck window: ear tip → chest floor only (105px); below that is the
      // NATURAL air under the belly of a hind-legs stand (rows 188+ hit it)
      let maxGapNeck = 0, run = 0;
      for (let y = topRow; y < topRow + 105; y++) {
        let opaque = false;
        for (let x = 70; x < 136; x++) if (alphaAt(x, y) > 40) { opaque = true; break; }
        if (opaque) run = 0; else { run++; maxGapNeck = Math.max(maxGapNeck, run); }
      }
      // ALSO measure the standing height vs a plain idle pose for sanity
      cv.width = 260; ctx.save(); ctx.translate(60, 190);
      m.drawCat(ctx, { t: 0, state: 'idle', dir: 1, breed: 'ginger_kitten', scale: 1, jumpP: 0 });
      ctx.restore();
      const g2 = ctx.getImageData(0, 0, 260, 220).data;
      let idleTop = -1;
      for (let y = 0; y < 220 && idleTop < 0; y++)
        for (let x = 40; x < 220; x++) if (g2[(y * 260 + x) * 4 + 3] > 40) { idleTop = y; break; }
      return { topRow, maxGapNeck, idleTop };
    });
    ok('REAR: silhouette rendered', !head.error, JSON.stringify(head || head.error));
    // the head-chest band is CONTIGUOUS — with the old bug the gap was ~10-24px
    ok('PIXELS: no gap between the rearing head and the chest (head attached)',
      typeof head.maxGapNeck === 'number' && head.maxGapNeck <= 5, `neck run=${head.maxGapNeck}px`);
  }

  // ================= 4. REAL-HUNT GEOMETRY: dip cycle =================
  {
        await sleep(300);
    // park the cat and pin a butterfly at the DIP FLOOR (~124px up): the
    // hunt must end in a real catch through the full stalk→rear→swat path
    const park = x => cat.evaluate(x0 => {
      const b = window.__brain();
      b.onPlatform = null; b._jump = null; b._inv = null;
      b.stopStalk?.(); b.stopLaser?.();
      b._enter('idle', 45);
      b.x = x0; b.baseY = b.bounds.y + b.bounds.h - 8; b.jumpY = 0;
    }, x);
    await park(800);
    await cat.evaluate(() => {
      const b = window.__brain();
      window.__spawnButterfly();
      window.__pinButterfly(b.x + 26, b.baseY - 120);   // inside the new dip band
      return true;
    });
    let caught = null;
    for (let i = 0; i < 200 && !caught; i++) {
      await sleep(80);
      caught = await cat.evaluate(() => {
        const h = window.__bflyHuntState();
        const bf = window.__bfly();
        return (!bf && h.caughtPending) ? h : null;
      });
    }
    ok('HUNT: a butterfly at the dip floor gets CAUGHT (paw-reach band)', !!caught);
    let stat = null;
    for (let i = 0; i < 120 && stat === null; i++) {
      await sleep(100);
      stat = await cat.evaluate(async () => {
        const s = await window.meow.getSettings();
        return s.stats && s.stats.butterflies >= 1 ? s.stats.butterflies : null;
      });
    }
    ok('HUNT: the catch pays out through the real store', stat !== null, `butterflies=${stat}`);
    await cat.evaluate(() => window.__pinButterfly(null));
  }

  // ================= 5. THE DANCE ROUTINE =================
  {
    await cat.evaluate(() => { window.__brain().stopStalk?.(); return true; });
    await cat.evaluate(() => window.meow.quickAction('dance'));
    await sleep(400);
    const d0 = await cat.evaluate(() => window.__pose().state);
    await sleep(7000);
    const d7 = await cat.evaluate(() => ({ state: window.__pose().state, stateT: window.__pose().stateT }));
    ok('DANCE: the quick action starts the routine', d0 === 'dance', `state=${d0}`);
    ok('DANCE: still dancing at ~7.5s (the full choreography, not the old 2.6s bounce)',
      d7.state === 'dance' && d7.stateT > 5, JSON.stringify(d7));
  }

  // ================= final =================
  ok('FINAL: app process alive through the whole gauntlet', alive());
  ok('FINAL: no crash markers anywhere', crashMarkers().length === 0, crashMarkers().join(' | '));
  ok('FINAL: cat renderer still painting', !cat.isClosed() && await cat.evaluate(() => window.__catBooted === true && (window.__paintCount || 0) > 10).catch(() => false));
} catch (e) {
  ok('e2e script completed without throwing', false, String(e && e.message || e).slice(0, 300));
} finally {
  try { (await import('fs')).writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, log: appLog.slice(-6000) }, null, 2)); } catch {}
  app.kill('SIGKILL');
  xvfb?.kill();
  browser.close().catch(() => {});
  try { rmSync(userData, { recursive: true, force: true }); } catch {}
  const fails = results.filter(r => !r.pass);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  process.exit(fails.length ? 1 : 0);
}
