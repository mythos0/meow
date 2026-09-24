// e2e-v314.mjs — REAL app release gate for v3.14, booted under Xvfb, driven
// over CDP with REAL mouse/keyboard input wherever a human would:
//   1. ZONE DRAWER CRASH REGRESSION: the drawer opens per display, a real
//      mouse drag finishes a zone, the overlay closes, the app STAYS ALIVE
//      (the "app crashed while selecting a zone" report), rapid re-draw and
//      Esc cancel survive too
//   2. HIDDEN UNLOCK: the feedback form with message "1234" reveals the
//      Execution Log in the nav (any other message does NOT)
//   3. EXECUTION LOG TERMINAL: hacker-terminal page exists, shows REAL
//      entries (boot/settings), and LIVE-appends a quick-action within 6s
//   4. REAR-SWAT CATCH: the cat rears onto its hind legs and a front-paw
//      swat catches a pinned butterfly — proven in PIXELS (the standing cat
//      is measurably taller) and through the real store (butterflies stat)
//   5. DODGE + RE-HUNT: an out-of-reach butterfly dodges (flee state), the
//      cat drops and chases and rears again
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', 'artifacts', 'e2e-v314');
mkdirSync(OUT, { recursive: true });
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

const userData = mkdtempSync(path.join(os.tmpdir(), 'meowcat-v314-'));
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, [
  '.', '--remote-debugging-port=9371', '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
], {
  cwd: ROOT,
  env: {
    ...process.env, DISPLAY: process.env.DISPLAY,
    MEOWCAT_TEST: '1',
    MEOWCAT_FAKE_CURSOR: '{"x":800,"y":500}',
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
    const res = await fetch('http://127.0.0.1:9371/json/version');
    if (res.ok) { cdpReady = true; break; }
  } catch {}
  await sleep(500);
}
if (!cdpReady) {
  console.error('CDP never came up. App log:\n' + appLog.slice(-3000));
  app.kill('SIGKILL'); xvfb?.kill(); process.exit(1);
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9371');

async function findPage(suffix, tries = 30) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.isClosed?.()) continue;
        if (p.url().endsWith(suffix)) {
          try { await p.evaluate(() => 1); return p; } catch { /* stale handle */ }
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

let cat = null;
async function openZoneOverlay() {
  await cat.evaluate(() => window.meow.openWindow('settings'));
  const st = await findPage('settings.html');
  if (!st) return null;
  await st.waitForFunction(() => !!document.getElementById('zoneSelect'), null, { timeout: 8000 }).catch(() => {});
  await st.evaluate(() => {
    const btn = document.querySelector('[data-page="behavior"]');
    if (btn) btn.click();
    document.querySelectorAll('section.page').forEach(p => p.classList.remove('on'));
    document.getElementById('page-behavior').classList.add('on');
  }).catch(() => {});
  await st.click('#zoneSelect');
  return findPage('zone-select.html');
}

try {
  cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  if (!cat) throw new Error('no cat window');
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 20000 }).catch(() => {});
  await cat.evaluate(() => { window.__stopButterfly && window.__stopButterfly(); return true; }).catch(() => {});

  // pixel span helper: how TALL is the cat at column cx right now?
  await cat.evaluate(() => {
    window.__pixSpan = cx => {
      const cv = document.getElementById('cv');
      const r = window.__region();
      const lx = Math.round(cx - r.x);
      if (lx < 0 || lx >= cv.width) return -1;
      const g = cv.getContext('2d');
      let top = -1, bot = -1;
      const d = g.getImageData(Math.max(0, lx - 30), 0, 61, cv.height).data;
      const W = 61;
      for (let y = 0; y < cv.height; y++) {
        for (let x = 0; x < W; x++) {
          if (d[(y * W + x) * 4 + 3] > 40) { if (top < 0) top = y; bot = y; break; }
        }
      }
      return top < 0 ? 0 : bot - top;
    };
    return true;
  });

  const park = async x => {
    await cat.evaluate(x0 => {
      const b = window.__brain();
      b.onPlatform = null; b._jump = null; b._inv = null;
      b.stopStalk?.(); b.stopLaser?.();
      b._enter('idle', 45);
      b.x = x0; b.baseY = b.bounds.y + b.bounds.h - 8; b.jumpY = 0;
    }, x);
    await sleep(400);
  };

  // ================= 1. ZONE DRAWER — the crash regression =================
  {
    const zone = await openZoneOverlay();
    ok('zone drawer opened', !!zone);
    if (zone) {
      await zone.waitForFunction('window.__zoneCfg && window.__zoneCfg().origin', null, { timeout: 8000 }).catch(() => {});
      const cfg = await zone.evaluate(() => window.__zoneCfg());
      ok('overlay is PER-DISPLAY (origin config, not a union monster)',
        !!cfg && cfg.origin && Number.isFinite(cfg.origin.x) && cfg.width > 0 && cfg.height > 0, JSON.stringify(cfg));
      // REAL mouse drag
      await zone.mouse.move(400, 300);
      await zone.mouse.down();
      for (let i = 1; i <= 10; i++) await zone.mouse.move(400 + i * 30, 300 + i * 30);
      await zone.mouse.up();
      let closed = false;
      for (let i = 0; i < 24 && !closed; i++) { closed = zone.isClosed(); if (!closed) await sleep(250); }
      ok('overlay closed after the draw (hide→deferred destroy, no crash)', closed);
    }
    await sleep(1200);
    ok('APP STILL ALIVE right after selecting a zone (the reported crash)', alive(), `exit=${app.exitCode}`);
    const zones = await cat.evaluate(async () => (await window.meow.getSettings()).noWalkZoneList).catch(() => null);
    ok('drawn zone landed in the real list', Array.isArray(zones) && zones.length === 1, JSON.stringify(zones));
    ok('no crash markers in the app log', crashMarkers().length === 0, crashMarkers().join(' | '));

    // rapid redraw race
    const z2 = await openZoneOverlay();
    ok('drawer reopens cleanly after a just-finished draw (stale-gen race fixed)', !!z2);
    if (z2) {
      await z2.mouse.move(200, 200);
      await z2.mouse.down();
      await z2.mouse.move(500, 500, { steps: 5 });
      await z2.mouse.up();
      await z2.mouse.move(600, 200).catch(() => {});
      await z2.mouse.down().catch(() => {});
      await z2.mouse.move(900, 500, { steps: 5 }).catch(() => {});
      await z2.mouse.up().catch(() => {});
    }
    await sleep(1500);
    ok('app alive after the rapid double-draw race', alive());
    // Esc cancel
    const z3 = await openZoneOverlay();
    if (z3) { await z3.keyboard.press('Escape'); await sleep(900); }
    ok('app alive after Esc cancel', alive());
  }

  // ================= 2. HIDDEN UNLOCK via feedback "1234" =================
  {
    await cat.evaluate(() => window.meow.openWindow('settings'));
    const st = await findPage('settings.html');
    await st.evaluate(() => {
      document.querySelectorAll('section.page').forEach(p => p.classList.remove('on'));
      document.getElementById('page-about').classList.add('on');
    });
    const hiddenBefore = await st.evaluate(() => document.getElementById('navExecLog').style.display === 'none');
    ok('Execution Log is HIDDEN on a fresh profile', hiddenBefore);
    // wrong code must not unlock
    await st.fill('#fbMsg', 'great cat, five stars');
    await st.click('#fbSend');
    await sleep(700);
    const stillHidden = await st.evaluate(() => document.getElementById('navExecLog').style.display === 'none');
    ok('feedback WITHOUT 1234 does NOT unlock', stillHidden);
    // the real code
    await st.fill('#fbMsg', '1234');
    await st.click('#fbSend');
    await st.waitForFunction(() => document.getElementById('navExecLog').style.display !== 'none', null, { timeout: 6000 }).catch(() => {});
    const revealed = await st.evaluate(() => ({
      visible: document.getElementById('navExecLog').style.display !== 'none',
      toast: document.getElementById('toast').textContent,
    }));
    ok('feedback "1234" reveals the hidden Execution Log menu item', revealed.visible, revealed.toast);
    ok('feedback stored is real (persisted list)', await st.evaluate(async () => {
      const s = await window.meow.getSettings();
      return Array.isArray(s.feedbackList) && s.feedbackList.some(f => f.message === '1234');
    }));
    await st.click('#navExecLog');
    await sleep(600);
    const term = await st.evaluate(() => ({
      on: document.getElementById('page-execlog').classList.contains('on'),
      lines: document.getElementById('termBody').childElementCount,
      hasBoot: [...document.querySelectorAll('#termBody .ln .tag')].some(t => t.textContent === 'boot'),
      banner: document.getElementById('termBanner').textContent.includes('E X E C U T I O N   L O G'),
    }));
    ok('terminal page opens with the hacker banner', term.on && term.banner);
    ok('terminal shows REAL historical entries incl. the boot line', term.lines > 3 && term.hasBoot, `lines=${term.lines}`);
    ok('the unlock itself is journaled in the log', await st.evaluate(async () => {
      const r = await window.meow.execLogGet();
      return r.entries.some(e => e.tag === 'access' && /UNLOCKED/.test(e.msg));
    }));

    // LIVE tail: a real quick-action must appear within 6s
    const before = await st.evaluate(() => document.getElementById('termBody').childElementCount);
    await cat.evaluate(() => window.meow.quickAction('dance'));
    let live = null;
    for (let i = 0; i < 24 && !live; i++) {
      await sleep(250);
      live = await st.evaluate(() => {
        const lines = [...document.querySelectorAll('#termBody .ln')];
        const found = lines.find(l => l.textContent.includes('quick action'));
        return found ? { lines: lines.length } : null;
      });
    }
    ok('LIVE: the quick-action entry streamed into the terminal in real time', !!live,
      `before=${before} after=${live && live.lines}`);

    // grep filter really filters
    const filtered = await st.evaluate(() => {
      const inp = document.getElementById('termGrep');
      inp.value = 'no-such-entry-xyz';
      inp.dispatchEvent(new Event('input'));
      const none = document.getElementById('termBody').childElementCount;
      inp.value = 'boot';
      inp.dispatchEvent(new Event('input'));
      const boot = document.getElementById('termBody').childElementCount;
      inp.value = '';
      inp.dispatchEvent(new Event('input'));
      return { none, boot };
    });
    ok('grep filter works (0 for junk, >0 for "boot")', filtered.none === 0 && filtered.boot > 0, JSON.stringify(filtered));
  }

  // ================= 3. REAR-SWAT CATCH, proven in pixels =================
  {
    await cat.evaluate(() => window.meow.setSettings({ stalkCursor: false }));   // keep the idle cursor from competing for the cat's attention
    await sleep(300);
    await park(800);
    // pin the butterfly exactly at the paw point → the first swat MUST catch
    const pin = await cat.evaluate(() => {
      window.__spawnButterfly();
      const b = window.__brain();
      b.dir = 1;
      const ok = window.__pinButterfly(b.x + 26, b.baseY - 104);
      return ok;
    });
    ok('butterfly pinned at the paw point for a deterministic catch', pin);
    const idleSpan = await cat.evaluate(() => window.__pixSpan(window.__brain().pose.x + 30));   // front half (head/paws column)
    ok('idle cat pixel span measured', idleSpan > 100, `span=${idleSpan}`);

    // start the hunt at the pinned butterfly (unless an auto-hunt already
    // caught it — the pin sits 26px from an idle cat)
    await cat.evaluate(() => {
      const b = window.__brain();
      const bf = window.__bfly();
      if (bf && !(b.stalk && b.stalk.kind === 'butterfly')) b.startStalk(bf.x, bf.y, 'butterfly');
      return true;
    });
    // wait for the REAR and catch a mid-swat frame at the paw apex
    let reared = null;
    for (let i = 0; i < 240 && !reared; i++) {
      await sleep(50);
      reared = await cat.evaluate(() => {
        const p = window.__pose();
        const b = window.__brain();
        if (p.state !== 'rear') return null;
        const swatT = p.stateT;
        if (!(swatT > 0.60 && swatT < 0.70)) return null;   // paw ≥ ~95% up
        return { stateT: swatT, span: window.__pixSpan(b.pose.x + 30 * b.dir), y: p.y };
      });
    }
    if (!reared) {
      const dbg = await cat.evaluate(() => ({
        st: window.__pose().state, stalk: window.__brain().stalk,
        bfly: window.__bfly(), hunt: window.__bflyHuntState(),
        pin: !!window.__bfly(),
      }));
      console.error('REAR FORENSICS:', JSON.stringify(dbg));
    }
    ok('the cat REARS UP onto its hind legs (new rear state + swat phase)', !!reared, JSON.stringify(reared || 'never reared'));
    // the standing cat is measurably TALLER than the idle cat
    ok('PIXELS: standing cat is taller than on all fours (hind-leg stand visible)',
      !!reared && reared.span > idleSpan + 4, `rear=${reared && reared.span} idle=${idleSpan}`);

    // the catch lands through the real system
    let caught = null;
    for (let i = 0; i < 120 && !caught; i++) {
      await sleep(100);
      caught = await cat.evaluate(() => {
        const h = window.__bflyHuntState();
        const bf = window.__bfly();
        return (!bf && h.caughtPending) ? h : null;
      });
    }
    ok('SWAT CONNECTED: butterfly caught with the front paws', !!caught);
    // the reward flows through the real store when the rear ends
    let stat = null;
    for (let i = 0; i < 120 && !stat; i++) {
      await sleep(100);
      stat = await cat.evaluate(async () => {
        const s = await window.meow.getSettings();
        return s.stats && s.stats.butterflies >= 1 ? s.stats.butterflies : null;
      });
    }
    ok('real reward: butterflies stat incremented via the store', !!stat, `butterflies=${stat}`);
    ok('the hunt is journaled in the execution log (real entries)', await cat.evaluate(async () => {
      const r = await window.meow.execLogGet();
      return r.entries.some(e => /SWAT CONNECTED/.test(e.msg)) &&
             r.entries.some(e => /butterfly caught/.test(e.msg));
    }));
    await cat.evaluate(() => window.__pinButterfly(null));
  }

  // ================= 4. DODGE + RE-HUNT =================
  {
    await cat.evaluate(() => window.meow.setSettings({ stalkCursor: false }));
    await sleep(300);
    await park(800);
    // pin FAR above the paw (260px above feet; paw reaches ~104±66) → miss.
    // Pin + hunt in ONE evaluate using the cat's own coords (no tick race).
    await cat.evaluate(() => {
      const b = window.__brain();
      window.__spawnButterfly();
      window.__pinButterfly(b.x + 26, b.baseY - 260);
      b.startStalk(b.x + 26, b.baseY - 260, 'butterfly');
      return true;
    });
    let dodged = null;
    for (let i = 0; i < 240 && !dodged; i++) {
      await sleep(50);
      dodged = await cat.evaluate(() => {
        const h = window.__bflyHuntState();
        const bf = window.__bfly();
        return h.attempts >= 1 && bf && bf.state === 'flee' ? { attempts: h.attempts, state: bf.state } : null;
      });
    }
    ok('the swat MISSED and the butterfly DODGED (flee state)', !!dodged, JSON.stringify(dodged || 'never dodged'));
    // the cat drops and keeps hunting — a second rear happens
    let rear2 = null;
    for (let i = 0; i < 300 && !rear2; i++) {
      await sleep(50);
      rear2 = await cat.evaluate(() => {
        const h = window.__bflyHuntState();
        const p = window.__pose();
        return h.attempts >= 2 && p.state === 'rear' ? { attempts: h.attempts } : null;
      });
    }
    ok('the cat keeps CHASING and rears for another swipe (attempts ≥ 2)', !!rear2, JSON.stringify(rear2 || 'gave up too early'));
    await cat.evaluate(() => window.__pinButterfly(null));
    await sleep(400);
  }

  // ================= final: everything still standing =================
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
