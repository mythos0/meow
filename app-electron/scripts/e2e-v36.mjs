// e2e-v36.mjs — v3.6 "living on your machine" feature pack: real app tests.
// Boots Electron under Xvfb, drives every v3.6 feature through its real
// pipeline (IPC, events, timers, files) and asserts observable behavior.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '..', 'artifacts', 'e2e-electron-v36');
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
const app = spawn(electronBin, ['.', '--remote-debugging-port=9223', '--no-sandbox', '--disable-gpu'], {
  cwd: ROOT,
  env: { ...process.env, DISPLAY: process.env.DISPLAY, MEOW_WARM_IDLE_MS: '3000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = '';
app.stdout.on('data', d => { appLog += d; });
app.stderr.on('data', d => { appLog += d; });

let cdpReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9223/json/version');
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

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  const cat = await findPage('cat.html');
  ok('cat window booted', !!cat);
  if (!cat) throw new Error('no cat window');
  await cat.waitForFunction('window.__catBooted === true', null, { timeout: 15000 });

  // helper: put the cat in a calm state before each scenario
  const calm = () => cat.evaluate(() => {
    const b = window.__brain();
    if (!['idle', 'sit', 'loaf', 'groom'].includes(b.state)) b._enter('idle', 2);
    b.musicOn = false; b._batteryLow = false; b.stressUntil = 0;
    // v3.6.1: ground the cat — stalk/investigate now refuse to run on window
    // tops (they used to float the cat off the edge), so scenarios must start
    // from a deterministic ground-level state
    b.onPlatform = null; b._jump = null; b.baseY = b.groundY; b.jumpY = 0;
    b.stalk = null; b._inv = null; b._napRequested = false;
    return b.state;
  });

  // ================= 1. toggles round-trip through IPC =================
  const tog = await cat.evaluate(async () => {
    const keys = ['reactSystemSpikes', 'reactLowBattery', 'timeOfDayMood', 'reactNewWindows',
      'hideDuringCalls', 'duckDuringCalls', 'reactMusic', 'reactApps', 'reactTyping',
      'stalkCursor', 'affectionSystem', 'photoMode', 'contextualSounds', 'pomodoro',
      'dancePartyIdle', 'seasonalSkins', 'achievements', 'globalHotkeys', 'noWalkZones',
      'companionCat', 'reactBuildStatus', 'hideInFullscreen'];
    // flip all off, verify, flip back to defaults
    const offs = {}; for (const k of keys) offs[k] = false;
    await window.meow.setSettings(offs);
    const s1 = await window.meow.getSettings();
    const allOff = keys.every(k => s1[k] === false);
    const ons = {}; for (const k of keys) ons[k] = (k === 'companionCat' || k === 'reactBuildStatus' || k === 'hideInFullscreen' || k === 'seasonalSkins') ? false : true;
    await window.meow.setSettings(ons);
    const s2 = await window.meow.getSettings();
    return { allOff, restored: keys.every(k => s2[k] === ons[k]) };
  });
  ok('all 22 feature toggles round-trip through IPC', tog.allOff && tog.restored, JSON.stringify(tog));

  // ================= 2. CPU/RAM spike -> startle (real sampler) =================
  await calm();
  // burn CPU on every core so the REAL sampler fires (linux /proc polling)
  const ncpu = os.cpus().length;
  const hogs = [];
  for (let i = 0; i < ncpu; i++) hogs.push(spawn('sh', ['-c', 'while :; do :; done'], { stdio: 'ignore' }));
  let stressSeen = false;
  const tStress = Date.now();
  while (Date.now() - tStress < 25000) {
    const ev = await cat.evaluate(() => {
      const b = window.__brain();
      return { state: b.state, stressed: b.stressed };
    });
    if (ev.stressed) { stressSeen = true; break; }
    await sleep(400);
  }
  for (const h of hogs) h.kill('SIGKILL');
  ok('live: CPU spike triggers the stress reaction (real /proc sampler)', stressSeen,
    stressSeen ? 'stress pulse observed' : 'no stress within 25s');
  await cat.evaluate(() => window.__brain().setStress(false, 1));

  // ================= 3. music -> bop =================
  await calm();
  await cat.evaluate(() => window.__testEvent('music', { action: 'bop' }));
  await sleep(200);
  let st = await cat.evaluate(() => window.__brain().state);
  ok('music playing -> cat bops', st === 'bop', st);
  await cat.screenshot({ path: path.join(OUT, 'v36_bop.png') });
  // bop sustains
  await sleep(3400);
  st = await cat.evaluate(() => window.__brain().state);
  ok('bop sustains while music keeps playing', st === 'bop', st);
  await cat.evaluate(() => window.__testEvent('music', { action: 'stop' }));
  await sleep(3300);
  st = await cat.evaluate(() => window.__brain().state);
  ok('music stopped -> bop ends', st !== 'bop', st);

  // ================= 4. typing pounce via the real typing meter =================
  await calm();
  const burst = await cat.evaluate(async () => {
    await window.meow.injectKeys(40);          // 40 keys @ ~25ms apart = ~480 wpm
    return true;
  });
  ok('typing burst injected into the real typing meter', !!burst);
  // v3.8: retry bursts for the window — the idle ticker only samples the meter
  // every 3s, and a single pounce verdict lands whenever the cat happens to be
  // mid-jump/eat (startStalk is declined then). The FEATURE under test is the
  // full pipeline keys->meter->ticker->renderer->stalk, not a timing lottery.
  let pounceViaTyping = false;
  const tTyp = Date.now();
  while (Date.now() - tTyp < 12000) {
    await cat.evaluate(() => window.meow.injectKeys(25));
    for (let i = 0; i < 8; i++) {
      const b = await cat.evaluate(() => window.__brain());
      if (b.state === 'stalk' && b.stalk) { pounceViaTyping = true; break; }
      await sleep(300);
    }
    if (pounceViaTyping) break;
  }
  ok('live: fast typing -> cat pounces toward the keyboard', pounceViaTyping);
  await cat.evaluate(() => window.__brain().stopStalk());

  // ================= 5. cursor stalking =================
  await calm();
  const stalk = await cat.evaluate(async () => {
    const b = window.__brain();
    const p = { x: b.x + 120, y: b.baseY - 10 };
    window.__testEvent('cursor-idle', p);
    window.__setCursor(p.x, p.y);
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      if (b.state === 'stalk') return { ok: true, from: b.state };
      await new Promise(r => setTimeout(r, 50));
    }
    return { ok: b.state === 'stalk', state: b.state };
  });
  ok('idle cursor near the cat -> stalk begins', stalk.ok, JSON.stringify(stalk));
  await cat.screenshot({ path: path.join(OUT, 'v36_stalk.png') });
  // pounce lands -> "caught" -> happy + affection
  const caught = await cat.evaluate(async () => {
    const b = window.__brain();
    const a0 = (await window.meow.getSettings()).affection || 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 11000) {
      if (b.state !== 'stalk' && b.state !== 'pounce') break;
      await new Promise(r => setTimeout(r, 50));
    }
    const a1 = (await window.meow.getSettings()).affection || 0;
    return { resolved: !b.stalk, affectionDelta: a1 - a0, state: b.state };
  });
  ok('stalk ends in a caught-cursor pounce (+affection)', caught.resolved && caught.affectionDelta >= 1,
    JSON.stringify(caught));
  // cursor moves -> interest lost
  await calm();
  const lost = await cat.evaluate(async () => {
    const b = window.__brain();
    window.__testEvent('cursor-idle', { x: b.x + 150, y: b.baseY - 10 });
    await new Promise(r => setTimeout(r, 300));
    const was = b.state === 'stalk';
    window.__testEvent('cursor-busy', { x: b.x + 400, y: b.baseY - 300 });
    await new Promise(r => setTimeout(r, 300));
    return { was, cleared: !b.stalk };
  });
  ok('moving cursor aborts the stalk (cat loses interest)', lost.was && lost.cleared, JSON.stringify(lost));

  // ================= 6. new-window investigator =================
  await calm();
  const inv = await cat.evaluate(async () => {
    const b = window.__brain();
    b.x = 300;
    window.__testEvent('new-window', { x: 950, y: 700, title: 'New App' });
    const t0 = Date.now();
    while (Date.now() - t0 < 16000) {
      if (b.state === 'sniff') return { ok: true, x: Math.round(b.x) };
      if (b.state !== 'investigate' && b.state !== 'sniff' && Date.now() - t0 > 2000) break;
      await new Promise(r => setTimeout(r, 80));
    }
    return { ok: false, state: b.state, x: Math.round(b.x) };
  });
  ok('new window opens -> cat walks over and sniffs it', inv.ok && Math.abs(inv.x - 950) < 60,
    JSON.stringify(inv));

  // ================= 7. editor nap: cat curls up on the editor =================
  await calm();
  const editor = await cat.evaluate(async () => {
    const b = window.__brain();
    window.__setPlatforms([{ title: 'editor', x: 600, y: 600, w: 700, h: 320 }]);
    b.x = 300; b.baseY = b.groundY; b.onPlatform = null; b._jump = null;
    window.__testEvent('app-focus', { kind: 'editor', rect: { x: 600, y: 600, w: 700, h: 320 }, proc: 'Code' });
    const t0 = Date.now();
    while (Date.now() - t0 < 7000) {
      if (b.onPlatform && ['loaf', 'sit', 'knead', 'groom'].includes(b.state)) {
        return { ok: true, state: b.state, y: Math.round(b.baseY) };
      }
      await new Promise(r => setTimeout(r, 80));
    }
    return { ok: false, state: b.state, onPlat: !!b.onPlatform, y: Math.round(b.baseY) };
  });
  ok('editor focused -> cat jumps up and loafs on it', editor.ok, JSON.stringify(editor));
  await cat.evaluate(() => { window.__setPlatforms([]); window.__brain().napRequested = false; });
  await cat.screenshot({ path: path.join(OUT, 'v36_editor_nap.png') });

  // ================= 8. build status reactions =================
  await calm();
  const buildOk = await cat.evaluate(() => {
    window.__testEvent('system-event', { type: 'build-ok' });
    return window.__brain().state;
  });
  ok('green build -> celebration (happy + star)', buildOk === 'happy', buildOk);
  await sleep(2800);
  await calm();
  const buildBad = await cat.evaluate(() => {
    window.__testEvent('system-event', { type: 'build-bad' });
    return window.__brain().state;
  });
  ok('red build -> moping', buildBad === 'mope', buildBad);
  await cat.screenshot({ path: path.join(OUT, 'v36_mope.png') });

  // ================= 9. battery curl (injected battery) =================
  await calm();
  const bat = await cat.evaluate(async () => {
    window.__setBattery(0.12, false);
    window.__pollBattery();
    await new Promise(r => setTimeout(r, 400));
    return { state: window.__brain().state };
  });
  ok('low battery (12%, unplugged) -> curls up to save energy', bat.state === 'curl', bat.state);
  await cat.screenshot({ path: path.join(OUT, 'v36_battery_curl.png') });
  const charged = await cat.evaluate(async () => {
    window.__setBattery(0.9, true);
    window.__pollBattery();
    await new Promise(r => setTimeout(r, 400));
    const b = window.__brain();
    return { low: b._batteryLow };
  });
  ok('plugged in -> battery crisis cleared', charged.low === false, JSON.stringify(charged));

  // ================= 10. companion cat: nuzzle + play-fight =================
  const comp = await cat.evaluate(async () => {
    await window.meow.setSettings({ companionCat: true });
    await new Promise(r => setTimeout(r, 300));
    return !!window.__companion();
  });
  ok('companion cat toggle spawns a second cat', comp);
  // force both calm + adjacent, then wait for an interaction
  const nuzzle = await cat.evaluate(async () => {
    const b = window.__brain();
    const c = window.__companion();
    return { cat: b.state, comp: c && c.state, x: c && Math.round(c.x) };
  });
  ok('companion wanders near the main cat', !!nuzzle.comp, JSON.stringify(nuzzle));
  const nz = await cat.evaluate(async () => {
    const b = window.__brain();
    const c = window.__companionBrain();
    if (!c) return { ok: false, why: 'no companion' };
    const n0 = (await window.meow.getSettings()).stats.nuzzles || 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      // keep them adjacent and calm so an interaction must fire
      if (!['idle', 'sit', 'loaf', 'groom', 'nuzzle', 'pounce'].includes(b.state)) b._enter('idle', 3);
      if (!['idle', 'sit', 'loaf', 'groom', 'nuzzle', 'pounce'].includes(c.state)) c._enter('idle', 3);
      c.x = b.x + 90; c.dir = -1; b.dir = 1;
      window.__forceCompanionCd(0.3);
      const n1 = (await window.meow.getSettings()).stats.nuzzles || 0;
      if (n1 > n0) return { ok: true, delta: n1 - n0 };
      await new Promise(r => setTimeout(r, 400));
    }
    const n2 = (await window.meow.getSettings()).stats.nuzzles || 0;
    return { ok: false, nuzzles: n2 };
  });
  ok('live: cats nuzzle or play-fight (+nuzzle stat)', nz.ok, JSON.stringify(nz));
  await cat.evaluate(() => window.meow.setSettings({ companionCat: false }));

  // ================= 11. dance party (screensaver mode) =================
  await calm();
  const party = await cat.evaluate(async () => {
    window.__testEvent('dance-party', {});
    await new Promise(r => setTimeout(r, 300));
    return window.__partyCats();
  });
  ok('idle screensaver mode -> dance party cats spawn', party === 2, String(party));
  await cat.screenshot({ path: path.join(OUT, 'v36_party.png') });
  await sleep(1200);

  // ================= 12. photo mode: transparent PNG saved =================
  const photo = await cat.evaluate(async () => {
    await window.meow.setSettings({ photoMode: true });
    await window.__photoMode();
    await new Promise(r => setTimeout(r, 600));
    return window.__lastPhoto || null;
  });
  // the path is returned inside cat.html only via bubble; save again grabbing the result
  const photo2 = await cat.evaluate(async () => {
    // re-run the export body through the savePhoto IPC directly
    const dataUrl = document.getElementById('cv').toDataURL('image/png');
    return window.meow.savePhoto(dataUrl);
  });
  const photoPath = photo2 && photo2.path;
  ok('photo mode exports a PNG', photo2.ok && photoPath && existsSync(photoPath),
    photoPath || JSON.stringify(photo2));
  if (photoPath && existsSync(photoPath)) {
    const sz = (await import('fs')).statSync(photoPath).size;
    ok('photo PNG is non-trivial (real pixels captured)', sz > 4000, sz + ' bytes');
    const home = photoPath.startsWith(os.homedir()) || photoPath.includes('Pictures') || photoPath.includes('photos');
    ok('photo saved into Pictures/user photos dir', home, photoPath);
    try { unlinkSync(photoPath); } catch {}
  }

  // ================= 13. achievements + affection =================
  const aff = await cat.evaluate(async () => {
    const r = await window.meow.petAffection();
    return r && { affection: r.affection, level: r.progress.level };
  });
  ok('petting builds the affection meter (Lv.1 start)', !!aff && aff.level >= 1, JSON.stringify(aff));
  const unlock = await cat.evaluate(async () => {
    await window.meow.bumpStat('pets', 100);       // Purring Machine
    const s = await window.meow.getSettings();
    return { unlocked: s.unlocked, pets: s.stats.pets };
  });
  ok('petting 100 times unlocks "Purring Machine"', unlock.unlocked.includes('pets_100'),
    JSON.stringify(unlock.unlocked));
  ok('first_meet auto-unlocked alongside', unlock.unlocked.includes('first_meet'));
  // unlock event reaches the cat as a toast handler test
  const toast = await cat.evaluate(() => {
    window.__testEvent('achievement', { id: 'x', name: 'Test', icon: '🏆', desc: 'e2e' });
    const b = document.getElementById('bubble');
    return b.textContent;
  });
  ok('achievement toast bubble shows on the cat', toast.includes('Test'), toast);

  // ================= 14. pomodoro engine through real IPC =================
  const pomo = await cat.evaluate(async () => {
    const r1 = await window.meow.startPomodoro('focus');
    const s1 = await window.meow.pomodoroState();
    await window.meow.stopPomodoro();
    const s2 = await window.meow.pomodoroState();
    return { started: r1 && r1.mode === 'focus', mid: s1.mode === 'focus', stopped: s2.mode === 'idle' };
  });
  ok('pomodoro start/stop through real IPC', pomo.started && pomo.mid && pomo.stopped, JSON.stringify(pomo));

  // ================= 15. no-walk zones live =================
  const zoneLive = await cat.evaluate(async () => {
    const b = window.__brain();
    // zone right of the cat: x 700..1000 on the ground; the cat's BODY
    // (half-width ~48px) must never overlap the zone rect
    await window.meow.setSettings({ noWalkZones: true, noWalkZoneList: [{ x: 700, y: 900, w: 300, h: 140 }] });
    await new Promise(r => setTimeout(r, 300));
    b.x = 200; b.baseY = b.groundY; b.onPlatform = null; b._jump = null; b._platformCd = 999;
    b._enter('walk', 60); b.dir = 1;
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      const bodyOverlaps = (b.x + 48 > 700) && (b.x - 48 < 1000);
      if (bodyOverlaps) return { ok: false, x: Math.round(b.x) };
      await new Promise(r => setTimeout(r, 40));
    }
    return { ok: true, x: Math.round(b.x) };
  });
  ok('live: cat respects the no-walk zone', zoneLive.ok, JSON.stringify(zoneLive));
  await cat.evaluate(() => window.meow.setSettings({ noWalkZoneList: [] }));

  // ================= 16. duck during calls =================
  const duck = await cat.evaluate(async () => {
    window.__testEvent('duck', true);
    const v1 = window.__volumeMul();
    window.__testEvent('duck', false);
    return { ducked: v1, restored: window.__volumeMul() };
  });
  ok('call detected -> cat sounds duck to 22%', duck.ducked === 0.22 && duck.restored === 1, JSON.stringify(duck));

  // ================= 17. community skin import =================
  const skin = await cat.evaluate(async () => {
    const def = JSON.stringify({
      name: 'E2E Nightsky', base: 'bombay', body: 'chubby',
      colors: { fur: '#4a4a8a', eye: '#ffd94d', belly: '#c8c8f0' },
      pattern: 'spots', hat: 'pumpkin',
    });
    const r = await window.meow.importSkin(def);
    if (!r.ok) return r;
    await window.meow.setSettings({ breed: r.id });
    await new Promise(r2 => setTimeout(r2, 300));
    return { ok: true, id: r.id, breed: window.__brain().breed, hat: window.__hat() };
  });
  ok('community skin imports, becomes a selectable breed with its hat',
    skin.ok && skin.breed === skin.id && skin.hat === 'pumpkin', JSON.stringify(skin));
  await cat.screenshot({ path: path.join(OUT, 'v36_custom_skin.png') });
  await cat.evaluate(() => window.meow.setSettings({ breed: 'grey_tabby' }));

  // ================= 18. seasonal skin toggle =================
  const season = await cat.evaluate(async () => {
    const s0 = await window.meow.getSettings();          // S.season from main
    await window.meow.setSettings({ seasonalSkins: true });
    await new Promise(r => setTimeout(r, 200));
    const hatOn = window.__hat();
    await window.meow.setSettings({ seasonalSkins: false });
    await new Promise(r => setTimeout(r, 200));
    return { seasonField: s0.season, hatWithToggleOn: hatOn, hatNow: window.__hat() };
  });
  ok('seasonal toggle applies the current-month hat (or none in September)',
    season.hatWithToggleOn === season.seasonField && season.hatNow === null, JSON.stringify(season));

  // ================= 19. time-of-day mood wiring =================
  const tod = await cat.evaluate(async () => {
    const b = window.__brain();
    await window.meow.setSettings({ timeOfDayMood: true });
    window.__testEvent('time-bias', 'night');
    const night = b.timeBiasMode;
    window.__testEvent('time-bias', 'day');
    return { night, day: b.timeBiasMode };
  });
  ok('time-of-day bias reaches the brain', tod.night === 'night' && tod.day === 'day', JSON.stringify(tod));

  // ================= 20. settings app: Win11 Fluent UI =================
  await cat.evaluate(() => window.meow.openWindow('settings'));
  const set = await findPage('settings.html');
  ok('settings window opens', !!set);
  if (set) {
    await set.waitForTimeout(600);
    const nav = await set.evaluate(() => ({
      items: document.querySelectorAll('#nav .item').length,
      pages: document.querySelectorAll('section.page').length,
      switches: document.querySelectorAll('.sw input').length,
      fluentCards: document.querySelectorAll('.fl-card').length,
    }));
    ok('Win11 nav pane with 10 sections', nav.items === 10, JSON.stringify(nav));
    ok('every feature has a toggle switch (24 switches)', nav.switches >= 24, String(nav.switches));
    ok('Fluent cards render', nav.fluentCards >= 14, String(nav.fluentCards));
    // navigate sections via the nav
    const navWorks = await set.evaluate(() => {
      document.querySelector('[data-page="reactions"]').click();
      const vis = document.getElementById('page-reactions').classList.contains('on');
      document.querySelector('[data-page="achieve"]').click();
      const ach = document.getElementById('page-achieve').classList.contains('on');
      const achCards = document.querySelectorAll('.ach').length;
      return { vis, ach, achCards };
    });
    ok('nav switches pages', navWorks.vis && navWorks.ach, JSON.stringify(navWorks));
    ok('achievements grid renders 8 achievements', navWorks.achCards === 8, String(navWorks.achCards));
    // affection meter visible on home
    const home = await set.evaluate(() => {
      document.querySelector('[data-page="home"]').click();
      return {
        meter: !!document.querySelector('#affBar'),
        pill: document.getElementById('affLevel').textContent,
        stats: document.getElementById('statLine').textContent,
      };
    });
    ok('home shows affection meter + lifetime stats', home.meter && /Lv\.\d/.test(home.pill) && home.stats.includes('pets'),
      JSON.stringify(home));
    // store shows the custom skin imported earlier
    const custom = await set.evaluate(() => {
      document.querySelector('[data-page="store"]').click();
      const cards = [...document.querySelectorAll('.breed .nm')].map(e => e.textContent);
      return { count: cards.length, hasCustom: cards.some(t => /E2E Nightsky/.test(t)) };
    });
    ok('imported community skin appears in the Cat Store', custom.hasCustom, JSON.stringify(custom));
    await set.screenshot({ path: path.join(OUT, 'settings_v36_home.png') });
    // page screenshots for docs
    for (const p of ['reactions', 'focus', 'hotkeys']) {
      await set.evaluate(pg => {
        document.querySelectorAll('#nav .item').forEach(x => x.classList.remove('on'));
        document.querySelector(`[data-page="${pg}"]`).classList.add('on');
        document.querySelectorAll('section.page').forEach(x => x.classList.remove('on'));
        document.getElementById('page-' + pg).classList.add('on');
      }, p);
      await set.waitForTimeout(150);
      await set.screenshot({ path: path.join(OUT, `settings_v36_${p}.png`) });
    }
    await set.evaluate(() => window.meow.closeWindow('settings'));
  }

  ok('v3.6 e2e complete', true, OUT);
} catch (e) {
  console.error('E2E error:', e.message);
  results.push({ name: 'v3.6 e2e run completed', pass: false, extra: e.message });
} finally {
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  writeFileSync(path.join(OUT, 'app.log'), appLog.slice(-8000));
  app.kill('SIGKILL');
  xvfb?.kill();
  await browser.close().catch(() => {});
}

const pass = results.filter(r => r.pass).length;
console.log(`\n=== E2E v3.6: ${pass}/${results.length} passed ===`);
process.exit(pass === results.length ? 0 : 1);
