// e2e-linux.mjs — REAL app test: boot Electron under Xvfb, verify live behavior via CDP
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'e2e-electron');
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
};

// -------------------------------------------------- start Xvfb
let xvfb = null;
if (!process.env.DISPLAY) {
  xvfb = spawn('Xvfb', [':99', '-screen', '0', '1600x1000x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));
}

// -------------------------------------------------- start electron
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const app = spawn(electronBin, ['.', '--remote-debugging-port=9222', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT,
  env: { ...process.env, DISPLAY: process.env.DISPLAY, MEOW_WARM_IDLE_MS: '3000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });

// wait for CDP
let cdpReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    if (res.ok) { cdpReady = true; break; }
  } catch {}
  await new Promise(r => setTimeout(r, 500));
}
if (!cdpReady) {
  console.error('CDP never came up. App log:\n' + appLog.slice(-3000));
  app.kill('SIGKILL');
  xvfb?.kill();
  process.exit(1);
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');

async function findPage(suffix, tries = 20) {
  for (let i = 0; i < tries; i++) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.url().endsWith(suffix)) return p;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

try {
  // ------------------------------------------------ 1. cat window alive + rendering
  const cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  if (!cat) throw new Error('no cat window');

  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 }).catch(() => {});
  const hasCanvas = await cat.evaluate(() => {
    const cv = document.getElementById('cv');
    if (!cv) return false;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
    return n > 500;
  });
  ok('cat paints opaque pixels on canvas', hasCanvas);

  // --------------------------------------------- 1b. v3.4 process diet (counted from the real tree)
  function procBreakdown(rootPid) {
    const out = execFileSync('ps', ['-eo', 'pid,ppid,comm,args'], { encoding: 'utf8' });
    const rows = out.split('\n').slice(1).map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean)
      .map(m => ({ pid: +m[1], ppid: +m[2], comm: m[3], args: m[4] }));
    const kids = new Map();
    for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r.pid); }
    const b = { main: 0, gpu: 0, crashpad: 0, zygote: 0, renderer: 0, utility: 0, total: 0, mainComm: '?' };
    const walk = pid => {
      const r = rows.find(x => x.pid === pid);
      if (r) {
        const isApp = r.comm === 'MeowCat' || (r.comm === 'electron' && r.args.includes('dist/electron')) || r.comm.startsWith('crashpad');
        if (isApp) {
          b.total++;
          if (r.comm.startsWith('crashpad')) b.crashpad++;
          else if (r.args.includes('--type=zygote')) b.zygote++;
          else if (r.args.includes('--type=renderer')) b.renderer++;
          else if (r.args.includes('--type=gpu-process')) b.gpu++;
          else if (r.args.includes('--type=utility')) b.utility++;
          else { b.main++; b.mainComm = r.comm; }
        }
        for (const c of kids.get(pid) || []) walk(c);
      }
    };
    walk(rootPid);
    return b;
  }
  const pb = procBreakdown(app.pid);
  ok('process diet: main process runs as "MeowCat" (not electron)', pb.main === 1 && pb.mainComm === 'MeowCat', `comm=${pb.mainComm}`);
  ok('process diet: no GPU process', pb.gpu === 0, String(pb.gpu));
  ok('process diet: no crashpad handler process', pb.crashpad === 0, String(pb.crashpad));
  ok('process diet: exactly 1 renderer at rest', pb.renderer === 1, String(pb.renderer));
  const expectMax = process.platform === 'win32' ? 3 : 6; // linux adds 2 zygotes + utility
  ok(`process diet: total app processes <= ${expectMax} at rest`, pb.total <= expectMax,
    `${pb.total} procs (main=${pb.main} renderer=${pb.renderer} utility=${pb.utility} zygote=${pb.zygote})`);

  // v3.3: region window (RAM diet) — overlay must be a small follower, not fullscreen
  const reg = await cat.evaluate(() => window.__region && window.__region());
  const waSet = await cat.evaluate(() => window.meow.getSettings());
  const wa = waSet?.workArea || { width: 1600, height: 1000 };
  ok('overlay is a compact region window (<50% of workArea)', reg && reg.w * reg.h < wa.width * wa.height * 0.5,
    `region ${reg?.w}x${reg?.h} vs workArea ${wa.width}x${wa.height}`);

  // ------------------------------------------------ 2. brain alive: pose changes over time
  const p1 = await cat.evaluate(() => window.__pose && window.__pose());
  await cat.waitForTimeout(1800);
  const p2 = await cat.evaluate(() => window.__pose && window.__pose());
  ok('brain pose advances (animation clock)', p1 && p2 && p2.t > p1.t, `t ${p1?.t?.toFixed(2)} → ${p2?.t?.toFixed(2)}`);
  ok('cat state machine runs', p1 && p2 && (p1.x !== p2.x || p1.state !== p2.state || p1.t !== p2.t),
    `${p1?.state}@${p1?.x} → ${p2?.state}@${p2?.x}`);

  // screenshots of live cat at two moments
  await cat.screenshot({ path: path.join(OUT, 'cat_live_1.png') });
  await cat.waitForTimeout(700);
  await cat.screenshot({ path: path.join(OUT, 'cat_live_2.png') });

  // ------------------------------------------------ 3. forced action via IPC broadcast
  await cat.evaluate(() => window.__doAction && window.__doAction('dance'));
  await cat.waitForTimeout(300);
  const st = await cat.evaluate(() => window.__pose && window.__pose());
  ok('tray-style action (dance) reaches the cat', st && st.state === 'dance', st?.state);

  // ------------------------------------------------ 4. coins via real IPC
  const c0 = await cat.evaluate(() => window.meow.getCoins());
  await cat.evaluate(() => window.meow.addCoins(10));
  const c1 = await cat.evaluate(() => window.meow.getCoins());
  ok('coins persist through IPC+store', c1 === c0 + 10, `${c0} → ${c1}`);

  // ------------------------------------------------ 5. settings persist
  await cat.evaluate(() => window.meow.setSettings({ size: 1.25, sounds: false }));
  const s = await cat.evaluate(() => window.meow.getSettings());
  ok('settings round-trip', s.size === 1.25 && s.sounds === false, `size=${s.size}`);
  await cat.evaluate(() => window.meow.setSettings({ size: 1.0, sounds: true }));

  // ------------------------------------------------ 6. reminders via real scheduler
  await cat.evaluate(() => { window.__firedReminders = []; });
  await cat.evaluate(() => window.meow.addReminder({ label: 'e2e test', at: Date.now() + 1500, anim: 'dance' }));
  let fired = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const firedList = await cat.evaluate(() => window.__firedReminders || []);
    if (firedList.includes('e2e test')) { fired = true; break; }
    await cat.waitForTimeout(250);
  }
  ok('reminder fires → main→renderer IPC → cat notified', fired);
  const rlist = await cat.evaluate(() => window.meow.listReminders());
  ok('one-shot reminder consumed after firing', rlist.length === 0, `${rlist.length} left`);

  // ------------------------------------------------ 7. settings window opens fast (warm pool) & renders
  const openMs = await cat.evaluate(async () => {
    const t = Date.now();
    await window.meow.openWindow('settings');
    return Date.now() - t;
  });
  const set = await findPage('settings.html');
  ok('settings window opens', !!set);
  if (set) {
    ok('settings open (warm) is fast (<300ms)', openMs < 300, openMs + 'ms');
    // close via IPC → pool must stay warm (page target stays alive)
    await set.evaluate(() => window.meow.closeWindow('settings'));
    await cat.waitForTimeout(350);
    const stillAlive = await set.evaluate(() => document.title !== undefined).then(() => true).catch(() => false);
    ok('close keeps the window warm (page target alive)', stillAlive);
    // reopen — must be instant AND focused
    const openMs2 = await cat.evaluate(async () => {
      const t = Date.now();
      await window.meow.openWindow('settings');
      return Date.now() - t;
    });
    let focused = false;
    const tF = Date.now();
    while (Date.now() - tF < 1500) {
      focused = await set.evaluate(() => document.hasFocus()).catch(() => false);
      if (focused) break;
      await cat.waitForTimeout(25);
    }
    ok('reopen is instant (warm reuse, <300ms)', openMs2 < 300, openMs2 + 'ms');
    ok('reopened settings window takes focus', focused);

    await set.waitForTimeout(500);
    const breedCount = await set.evaluate(() => document.querySelectorAll('.breed').length);
    const hasAllBase = await set.evaluate(() => {
      const have = new Set([...document.querySelectorAll('.breed')].map(b => b.dataset.breed));
      return ['grey_tabby', 'orange_tabby', 'siamese', 'calico', 'persian', 'tuxedo', 'bombay',
        'russian_blue', 'ginger_kitten', 'ragdoll', 'bengal', 'maine_coon', 'panda', 'mochi',
        'scottish_fold', 'snow_angora', 'somali', 'british_plush', 'choco_munchkin', 'sakura']
        .every(b => have.has(b));
    });
    ok('settings shows all 20 base breed cards (plus any community skins)',
      breedCount >= 20 && hasAllBase, `${breedCount} cards, base covered: ${hasAllBase}`);
    const unlimited = await set.evaluate(() => !document.querySelector('.breed.locked'));
    ok('unlimited coins: no locked breeds', unlimited);
    const storeUi = await set.evaluate(() => !!document.querySelector('.coins-pill') && !!document.querySelector('.tagnew'));
    ok('premium store UI renders (pill + NEW badges)', storeUi);
    const hopOn = await set.evaluate(() => { const el = document.getElementById('hopToggle'); return !!el && el.checked; });
    ok('window-hopping toggle present, default on', hopOn === true);
    await cat.evaluate(() => window.meow.setSettings({ windowHopping: false }));
    const hopOff = await set.evaluate(() => window.meow.getSettings().then(s => s.windowHopping));
    ok('window-hopping setting round-trips through IPC', hopOff === false);
    await cat.evaluate(() => window.meow.setSettings({ windowHopping: true }));
    await set.screenshot({ path: path.join(OUT, 'settings_live.png') });
  }

  // ------------------------------------------------ 7b. double-click on cat opens settings
  if (set) {
    await set.evaluate(() => window.meow.closeWindow('settings'));   // start hidden
    await cat.waitForTimeout(350);
    // click in WINDOW-LOCAL coords (the overlay is a small follower now)
    const pos = await cat.evaluate(() => window.__catLocal());
    await cat.mouse.dblclick(pos.x, pos.y - 40);
    let dblOk = false;
    const tD = Date.now();
    while (Date.now() - tD < 3000) {
      const v = await set.evaluate(() => document.visibilityState === 'visible').catch(() => false);
      if (v) { dblOk = true; break; }
      await cat.waitForTimeout(30);
    }
    ok('double-click on the cat opens the settings popup', dblOk);
    // About page: version + developer link
    const about = await set.evaluate(async () => {
      const ver = document.getElementById('ver');
      for (let i = 0; i < 40 && !ver.textContent; i++) await new Promise(r => setTimeout(r, 50));
      return { ver: ver.textContent, dev: !!document.getElementById('lnkDev') };
    });
    ok('about page shows version + developer link', about.dev && about.ver.startsWith('v'), JSON.stringify(about));
  }

  // ------------------------------------------------ 7c. store: panda unlocks free under unlimited promo
  const buy = await cat.evaluate(async () => {
    const before = await window.meow.getCoins();
    const r = await window.meow.buyBreed('panda');
    const after = await window.meow.getCoins();
    return { r, before, after };
  });
  ok('panda unlocks free (unlimited coins promo)', buy.r && buy.r.ok && buy.after === buy.before,
    JSON.stringify(buy.r));

  // ------------------------------------------------ 8. reminders UI lives inside the settings window (v3.2 merge)
  await cat.evaluate(() => window.meow.openWindow('settings'));
  const rem = await findPage('settings.html');
  ok('settings window opens for reminders UI', !!rem);
  if (rem) {
    await rem.waitForTimeout(600);
    // v3.6: the reminders editor lives on the "Focus & Reminders" nav page
    await rem.evaluate(() => {
      document.querySelectorAll('#nav .item').forEach(x => x.classList.remove('on'));
      document.querySelector('[data-page="focus"]').classList.add('on');
      document.querySelectorAll('section.page').forEach(p => p.classList.remove('on'));
      document.getElementById('page-focus').classList.add('on');
    });
    await rem.fill('#remLabel', 'drink water');
    await rem.evaluate(() => { document.getElementById('remWhen').value = ''; });
    // set when = now + 60s
    await rem.evaluate(() => {
      const d = new Date(Date.now() + 60000);
      const pad = n => String(n).padStart(2, '0');
      document.getElementById('remWhen').value =
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
    await rem.click('#addBtn');
    await rem.waitForTimeout(500);
    const n = await rem.evaluate(() => document.querySelectorAll('.rem').length);
    ok('reminder added from merged settings UI', n >= 1, `${n} rows`);
    await rem.screenshot({ path: path.join(OUT, 'reminders_live.png') });
    // cleanup so one-shot doesn't fire later mid-run
    await rem.evaluate(() => window.meow.listReminders().then(async l => {
      for (const it of l) await window.meow.removeReminder(it.id);
    }));
  }

  // ------------------------------------------------ 9. platform hop: cat jumps onto a window top border (live)
  const hop = await cat.evaluate(async () => {
    const b = window.__brain && window.__brain();
    if (!b) return { ok: false, why: 'no brain' };
    window.__setPlatforms([{ title: 'Fake Window', x: 500, y: 640, w: 620, h: 300 }]);
    if (b.state === 'sleep') b._enter('idle', 0.5);   // pin the walk path for this test
    b.x = 360; b.baseY = b.groundY; b.onPlatform = null; b._jump = null;
    b._platformCd = 0;
    b._enter('walk', 30); b.dir = 1;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      if (b.onPlatform) break;
      await new Promise(r => setTimeout(r, 60));
    }
    return { ok: !!b.onPlatform, state: b.state, baseY: Math.round(b.baseY), x: Math.round(b.x) };
  });
  ok('live: cat jumps onto a nearby window top border', hop.ok, JSON.stringify(hop));
  // cleanup: remove platforms so later checks run on the ground
  await cat.evaluate(() => window.__setPlatforms([]));

  // ------------------------------------------------ 9b. region window follows the cat (v3.3)
  const slide = await cat.evaluate(async () => {
    const b = window.__brain && window.__brain();
    if (!b) return { ok: false, why: 'no brain' };
    const r0 = window.__region();
    if (b.state === 'sleep') b._enter('idle', 0.5);
    b._jump = null; b.onPlatform = null; b.baseY = b.groundY;
    b.x = r0.x + 150;                    // near the left comfort-band edge
    b._platformCd = 999;                 // no hopping during this test
    b._enter('walk', 4); b.dir = -1;
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const r1 = window.__region();
      if (r1.x < r0.x - 40) return { ok: true, from: r0.x, to: r1.x };
      await new Promise(r => setTimeout(r, 60));
    }
    return { ok: false, r0, end: window.__region(), x: Math.round(b.x) };
  });
  ok('live: region window slides to follow the walking cat', slide.ok, JSON.stringify(slide));

  // ------------------------------------------------ 9c. tap the cat -> love emote anchored above it (v3.2 fix, live)
  await cat.waitForTimeout(600);
  const emote = await cat.evaluate(() => window.__catLocal());
  await cat.mouse.click(emote.x, emote.y - 40);   // quick tap = pet
  await cat.waitForTimeout(450);                  // pendingPet delay 280ms
  const emoteState = await cat.evaluate(() => {
    const b = window.__brain && window.__brain();
    return { kind: b?.emote?.kind || null, state: b?.state };
  });
  ok('live: tapping the cat triggers the love emote on the pet',
    emoteState.kind === 'love', JSON.stringify(emoteState));
  await cat.screenshot({ path: path.join(OUT, 'cat_live_emote.png') });

  // ------------------------------------------------ 9d. v3.5 funny pack: laser pointer toy (live)
  const laserT = await cat.evaluate(async () => {
    const b = window.__brain && window.__brain();
    if (!b) return { ok: false, why: 'no brain' };
    if (b.state === 'sleep') b._enter('idle', 0.5);
    window.__spawnLaser();
    const t0 = Date.now();
    let dot = window.__laser && window.__laser();
    while (Date.now() - t0 < 1500 && !dot) {
      await new Promise(r => setTimeout(r, 50));
      dot = window.__laser && window.__laser();
    }
    const st0 = b.state;
    // keep the dot underfoot → the brain must chase and pounce quickly
    let pounced = false;
    const t1 = Date.now();
    while (Date.now() - t1 < 9000 && !pounced) {
      if (window.__laser()) window.__setLaser(b.x + 24, b.baseY - 10);
      if (b.state === 'pounce') pounced = true;
      await new Promise(r => setTimeout(r, 40));
    }
    return { ok: !!dot && st0 === 'laser' && pounced, hadDot: !!dot, st0, pounced, state: b.state };
  });
  ok('live: laser toy spawns, brain chases and pounces', laserT.ok, JSON.stringify(laserT));

  // laser catch resolution: dot underfoot at pounce landing → +3 coins + happy
  const catchT = await cat.evaluate(async () => {
    const b = window.__brain && window.__brain();
    const c0 = await window.meow.getCoins();
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      if (window.__laser()) window.__setLaser(b.x + 20, b.baseY - 8);
      if (!window.__laser() && !b.laser) break;   // chase resolved (caught or timed out)
      await new Promise(r => setTimeout(r, 40));
    }
    const c1 = await window.meow.getCoins();
    return { gained: c1 - c0, state: b.state, dotLeft: !!window.__laser() };
  });
  ok('live: laser catch pays +3 coins and ends the chase', catchT.gained >= 3 && !catchT.dotLeft,
    JSON.stringify(catchT));

  // ------------------------------------------------ 9e. v3.5: ambient butterfly (live)
  const bfT = await cat.evaluate(async () => {
    const b = window.__brain && window.__brain();
    if (!b) return { ok: false, why: 'no brain' };
    if (b.state === 'sleep') b._enter('idle', 0.5);
    else if (!['idle', 'sit', 'loaf', 'groom'].includes(b.state)) b._enter('idle', 2);
    window.__spawnButterfly();
    const t0 = Date.now();
    let bf = window.__butterfly && window.__butterfly();
    while (Date.now() - t0 < 1500 && !bf) {
      await new Promise(r => setTimeout(r, 50));
      bf = window.__butterfly && window.__butterfly();
    }
    return { ok: !!bf, bf, state: b.state };
  });
  ok('live: ambient butterfly spawns and drifts', bfT.ok, JSON.stringify(bfT));

  // ------------------------------------------------ 9f. v3.5 identity surfaces (never "Electron")
  const catTitle = await cat.evaluate(() => document.title);
  ok('cat window <title> is MeowCat', catTitle === 'MeowCat', JSON.stringify(catTitle));
  const info = await cat.evaluate(() => (window.meow.appInfo ? window.meow.appInfo() : null));
  ok('AppUserModelID is com.mythos0.meowcat', !!info && info.aumid === 'com.mythos0.meowcat', JSON.stringify(info));
  ok('app version reported as 3.6.0', !!info && info.version === '3.6.0', info && info.version);

  // ------------------------------------------------ 10. v3.4: warm settings window self-destroys when idle
  await cat.evaluate(() => window.meow.openWindow('settings'));
  const set2 = await findPage('settings.html');
  ok('settings reopened for idle-destroy test', !!set2);
  if (set2) {
    await set2.evaluate(() => window.meow.closeWindow('settings'));
    await cat.waitForTimeout(4300);   // MEOW_WARM_IDLE_MS=3000 in the e2e run
    const dead = await set2.evaluate(() => true).then(() => false).catch(() => true);
    ok('idle settings window self-destroys (frees its renderer process)', dead);
    const reopenMs = await cat.evaluate(async () => {
      const t = Date.now();
      await window.meow.openWindow('settings');
      return Date.now() - t;
    });
    ok('settings reopens after idle destroy (cold start ok, <1500ms)', reopenMs < 1500, reopenMs + 'ms');
    await cat.evaluate(() => window.meow.closeWindow('settings'));
  }

  // topmost enforcer sanity: window has always-on-top state via CDP? (skip on Linux)
  ok('e2e screenshots saved', true, OUT);
} catch (e) {
  console.error('E2E error:', e.message);
  results.push({ name: 'e2e run completed', pass: false, extra: e.message });
} finally {
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  writeFileSync(path.join(OUT, 'app.log'), appLog.slice(-8000));
  app.kill('SIGKILL');
  xvfb?.kill();
  await browser.close().catch(() => {});
}

const pass = results.filter(r => r.pass).length;
console.log(`\n=== E2E: ${pass}/${results.length} passed ===`);
process.exit(pass === results.length ? 0 : 1);
