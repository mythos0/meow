// main.js — MeowCat Electron main process (ESM)
'use strict';
import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, Notification, shell, globalShortcut, powerMonitor, dialog, utilityProcess } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createSettings } from './src/settings-store.js';
import { ReminderScheduler } from './src/reminder-scheduler.js';
import { createTopmostEnforcer } from './src/topmost.js';
import { createWindowScanner } from './src/window-scan.js';
import { createFastWindows } from './src/fast-windows.js';
import { createPlatformTracker } from './src/platform-tracker.js';
import { computeRegionSize, initialOrigin, unionWorkAreas } from './src/region.js';
import { createSysMonitor } from './src/sys-monitor.js';
import { createMusicWatcher } from './src/music-watcher.js';
import {
  createSpikeDetector, createTypingMeter,
  batteryCrisis, shouldDanceParty, diffWindows,
  findEditorApp, musicReaction, parseStatusFile,
} from './src/system-reactions.js';
import { createPomodoro, fmtRemaining } from './src/pomodoro.js';
import { checkUnlocks, ACHIEVEMENTS, affectionProgress, unlockedPerks } from './src/achievements.js';
import { seasonHat, validateSkinDef } from './src/cat-renderer.js';
import { toRelativeZone, validZone } from './src/no-walk.js';
import { createTypingHookManager } from './src/typing-hook.js';

// ------------------------------------------------------------------ v3.2/v3.4 memory & process diet
app.disableHardwareAcceleration();                         // no GPU process (API)
app.commandLine.appendSwitch('in-process-gpu');            // belt & braces
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=160');
process.title = 'MeowCat';
const MEOW_AUMID = 'com.mythos0.meowcat';
app.setAppUserModelId(MEOW_AUMID);

// v3.10: the cat's process must never stop on its own. An unexpected crash in
// the main process used to take the whole cat down without any user action —
// now it is logged and swallowed so the desktop cat keeps living until the
// user explicitly quits it from the tray or the context menu.
process.on('uncaughtException', err => {
  console.error('[meowcat] uncaughtException (cat keeps running):', err);
  logCrash('uncaughtException', err);
});
process.on('unhandledRejection', err => {
  console.error('[meowcat] unhandledRejection (cat keeps running):', err);
  logCrash('unhandledRejection', err);
});

// v3.11: persistent crash/diagnostic journal. Every self-healed incident is
// appended to userData/meowcat-crash.log (capped) so "the cat disappeared"
// reports come with forensics instead of guesses. The cat keeps running
// through every line below — this is a black box, not an exit path.
function logCrash(kind, err) {
  try {
    const line = `[${new Date().toISOString()}] ${kind}: ${err && (err.stack || err.message || String(err))}\n`;
    const p = path.join(app.getPath('userData'), 'meowcat-crash.log');
    try {
      const st = fs.statSync(p);
      if (st.size > 128 * 1024) {   // cap: keep the newest 64KB
        const old = fs.readFileSync(p, 'utf8').slice(-64 * 1024);
        fs.writeFileSync(p, old);
      }
    } catch { /* first write */ }
    fs.appendFileSync(p, line);
  } catch { /* never die logging */ }
}
app.on('child-process-gone', (_e, details) => {
  console.error('[meowcat] child-process-gone:', details?.type, details?.reason);
  logCrash('child-process-gone', new Error(`${details?.type} ${details?.reason}`));
});

// v3.3 region window: current size + origin (screen coords) of the overlay
let region = { w: 480, h: 434 };
let regionOrigin = { x: 0, y: 0 };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let tray = null;
let catWin = null;
let enforcer = null;
let scanner = null;
let schedTimer = null;
let coinTimer = null;
let quitTimer = null;
let quitting = false;

// ---------------------------------------------------------------- settings backend (fs)
const settingsFile = () => path.join(app.getPath('userData'), 'meowcat-settings.json');
const backend = {
  read: () => { try { return fs.readFileSync(settingsFile(), 'utf8'); } catch { return null; } },
  write: s => {
    try {
      fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
      fs.writeFileSync(settingsFile(), s, 'utf8');
    } catch { /* read-only disk etc. */ }
  },
};
const store = createSettings(backend);
const sched = new ReminderScheduler(() => Date.now());
for (const r of store.get('reminders')) {
  try { sched.add(r); } catch { /* skip invalid */ }
}

function persistReminders() {
  store.set('reminders', sched.list());
}

function sendToCat(channel, data) {
  if (catWin && !catWin.isDestroyed()) {
    try { catWin.webContents.send(channel, data); } catch { /* window gone */ }
  }
}

// v3.4: window-top platform scanner, created on demand
function ensureScanner() {
  if (process.platform !== 'win32') return;
  if (!scanner) {
    scanner = createWindowScanner({
      spawnFn: spawn,
      intervalMs: 4500,   // v3.7: was 3200 — each scan is a PowerShell spawn; 4.5s is imperceptible
      onResult: onWindowScan,
      // v3.8: fresh work area each scan so maximized ("full") windows are
      // never offered as platforms — the cat walks the top border of
      // normal resized windows only
      workAreaFn: () => { try { return screen.getPrimaryDisplay().workArea; } catch { return null; } },
    });
  }
  scanner.start();
}

// v3.9: live platform tracker — ONE persistent PowerShell polls the hwnd the
// cat stands on (user32 GetWindowRect P/Invoke, ~0% CPU) and streams its rect
// so the cat RIDES dragged/resized window borders in real time instead of
// floating for up to one scan interval and then snapping (the float-then-jump
// half of the rendering-jump reports).
let platTracker = null;
function ensureTracker() {
  if (process.platform !== 'win32') return;
  if (!platTracker) {
    platTracker = createPlatformTracker({
      spawnFn: spawn,
      onRect: r => sendToCat('platform-rect', r),
    });
    platTracker.start();
  }
}

// ---------------------------------------------------------------- single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();   // a second launcher defers to the RUNNING cat — it never stops it
} else {
  app.on('second-instance', () => {
    if (hiddenByUser) { hiddenByUser = false; updateCatVisibility(); }
    else if (catWin && !catWin.isDestroyed()) catWin.show();
    else if (!catWin) createCatWindow();   // v3.10: re-summon the cat window too
  });
}

// ---------------------------------------------------------------- displays (v3.11 multi-monitor)
// The cat roams the bounding-box UNION of every display's work area — that is
// how it can finally be dragged onto the 2nd monitor. Single-display machines
// get exactly the old behavior (the union IS the primary work area).
function unionWA() {
  try { return unionWorkAreas(screen.getAllDisplays().map(d => d.workArea)); }
  catch { try { return screen.getPrimaryDisplay().workArea; } catch { return { x: 0, y: 0, width: 1600, height: 1000 }; } }
}
function primaryWA() {
  try { return screen.getPrimaryDisplay().workArea; } catch { return { x: 0, y: 0, width: 1600, height: 1000 }; }
}

// ---------------------------------------------------------------- cat overlay window
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

function createCatWindow() {
  try { enforcer?.stop(); } catch {}   // v3.6.1: never leak an interval at a destroyed window
  const wa = primaryWA();
  const scale = Number(store.get('size')) || 1.0;
  region = computeRegionSize(scale, wa);
  const spawnX = wa.x + wa.width / 2;
  const feetY = wa.y + wa.height - 8;
  regionOrigin = initialOrigin(wa, region, spawnX, feetY);
  catWin = new BrowserWindow({
    x: regionOrigin.x, y: regionOrigin.y, width: region.w, height: region.h,
    transparent: true, frame: false, hasShadow: false,
    skipTaskbar: true, resizable: false, movable: false,
    fullscreenable: false, minimizable: false, maximizable: false,
    show: false, icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,
      v8CacheOptions: 'none',
      spellcheck: false,   // v3.7: the overlay has no text inputs — drop the dictionary
    },
  });
  catWin.setMenuBarVisibility(false);
  catWin.loadFile(path.join(__dirname, 'windows', 'cat.html'));
  catWin.once('ready-to-show', () => {
    // v3.10: only the USER (tray / Ctrl+Alt+C) can have the cat hidden —
    // call/fullscreen auto-hide no longer exist.
    if (!hiddenByUser) catWin.show();
    // v3.7: tell the renderer its true visibility so its render loop starts in
    // sync with reality (it boots assuming "visible").
    sendToCat('cat-visible', !hiddenByUser);
  });

  // v3.10: the cat's process must NEVER stop on its own. If the overlay window
  // is closed or its renderer dies without an explicit Quit, it comes back.
  catWin.on('closed', () => {
    catWin = null;
    if (!quitting) setTimeout(() => { if (!catWin && !quitting) createCatWindow(); }, 250);
  });
  try {
    catWin.webContents.on('render-process-gone', (_e, details) => {
      if (quitting) return;
      console.error('[meowcat] renderer gone:', details?.reason, '— reviving the cat');
      try { catWin?.destroy(); } catch {}   // 'closed' handler recreates it
    });
  } catch {}

  enforcer = createTopmostEnforcer(catWin, { level: 'screen-saver', intervalMs: 3000 });
  enforcer.start();

  try { catWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
  try { catWin.setIgnoreMouseEvents(true, { forward: true }); } catch {}
}

// ---------------------------------------------------------------- tray
function trayIcon() {
  const p = path.join(__dirname, 'assets', 'tray.png');
  if (fs.existsSync(p)) return nativeImage.createFromPath(p);
  return nativeImage.createEmpty();
}

function createTray() {
  try {
    tray = new Tray(trayIcon());
  } catch {
    tray = null;
    return;
  }
  buildTrayMenu();
  tray.setToolTip('MeowCat — your desktop cat');
  tray.on('click', () => openSettings());
}

function buildTrayMenu() {
  if (!tray) return;
  const pomo = pomodoroEngine;
  const pomoLabel = pomo.mode === 'idle' ? '🍅 Pomodoro' : `🍅 ${pomo.mode === 'focus' ? 'Focus' : 'Break'} ${fmtRemaining(pomo.remaining)}`;
  const menu = Menu.buildFromTemplate([
    { label: 'MeowCat ' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: 'Dance!', click: () => sendToCat('do-action', 'dance') },
    { label: 'Feed', click: () => sendToCat('do-action', 'eat') },
    { label: 'Sleep now', click: () => sendToCat('do-action', 'sleep') },
    { label: 'Laser pointer!', click: () => sendToCat('laser-start') },
    { label: '📸 Photo (PNG)', click: () => sendToCat('photo-mode', {}) },
    { type: 'separator' },
    {
      label: pomoLabel,
      submenu: [
        { label: 'Start focus (25 min)', click: () => startPomodoro('focus') },
        { label: 'Start break (5 min)', click: () => startPomodoro('break') },
        { label: 'Stop timer', enabled: pomo.mode !== 'idle', click: () => stopPomodoro() },
      ],
    },
    { label: hiddenByUser ? '🐔 Show cat' : '🙈 Hide cat', click: () => { hiddenByUser = !hiddenByUser; updateCatVisibility(); } },
    { type: 'separator' },
    { label: 'Reminders…', click: () => openReminders() },
    { label: 'Settings…', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ---------------------------------------------------------------- helper windows
const WIN_SPECS = {
  settings: { width: 920, height: 980, title: 'MeowCat Settings', resizable: true, minW: 780, minH: 620 },
};

function makeWindow(name) {
  const spec = WIN_SPECS[name];
  const w = new BrowserWindow({
    width: spec.width, height: spec.height, show: false,
    resizable: spec.resizable ?? false, minimizable: true, autoHideMenuBar: true,
    minWidth: spec.minW, minHeight: spec.minH,
    title: spec.title, backgroundColor: '#1c1b22', icon: ICON_PATH,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, spellcheck: false },
  });
  w.loadFile(path.join(__dirname, 'windows', name + '.html'));
  return w;
}

const fastWins = createFastWindows({
  factory: {
    settings: () => makeWindow('settings'),
  },
});

function openSettings() {
  try { return fastWins.show('settings'); } catch { fastWins.warm('settings'); return fastWins.show('settings'); }
}

function openReminders() {
  const w = openSettings();
  try { w?.webContents?.send('focus-reminders'); } catch {}
}

// ---------------------------------------------------------------- scheduler + coins
function startBackgroundJobs() {
  schedTimer = setInterval(() => {
    const due = sched.dueReminders();
    for (const item of due) {
      sendToCat('reminder-fired', item);
      try {
        if (Notification.isSupported()) {
          // v3.8: the toast carries the ACTUAL reminder message — the old
          // generic "Your cat has a message for you!" body hid what the
          // reminder was even for.
          const n = new Notification({
            title: '🐱 MeowCat reminder',
            body: item.label,
            silent: !item.sound,
          });
          if (item.sound) n.on('click', () => sendToCat('do-action', 'dance'));
          n.show();
        }
      } catch {}
      bumpStatAndCheck('reminders', 1);
    }
    if (due.length) persistReminders();
  }, 1000);
  schedTimer.unref?.();

  // passive coin income: +1 / 30s
  coinTimer = setInterval(() => { store.addCoins(1); }, 30000);
  coinTimer.unref?.();

  // v3.6: pomodoro heartbeat (1s while a timer runs)
  let pomoTickN = 0;
  quitTimer = setInterval(() => {
    const evt = pomodoroEngine.tick();
    if (evt === 'focus-done') {
      onPomodoroDone('focus');
    } else if (evt === 'break-done') {
      onPomodoroDone('break');
    } else if (pomodoroEngine.mode !== 'idle') {
      // live countdown to the settings UI — steady 5s cadence, no Date.now()% luck
      if (++pomoTickN % 5 === 0) broadcastPomodoro('tick');
    } else pomoTickN = 0;
  }, 1000);
  quitTimer.unref?.();
}

// ---------------------------------------------------------------- auto-start
function autoStartPath() {
  try {
    const dir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (dir && process.platform === 'win32') {
      const exes = fs.readdirSync(dir).filter(f => /^meowcat.*\.exe$/i.test(f));
      for (const f of exes) {
        const p = path.join(dir, f);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* fall through */ }
  return process.execPath;
}
function applyAutoStart(on) {
  try { app.setLoginItemSettings({ openAtLogin: !!on, path: autoStartPath() }); } catch {}
}

// ================================================================ v3.6 feature systems

// ---------- visibility (ONLY the user can hide the cat) ----------
// v3.10: call-detection and fullscreen auto-hide were removed entirely.
// The cat never hides itself and its process never stops on its own —
// only the tray 'Hide cat' / Ctrl+Alt+C may hide it, only 'Quit' stops it.
let hiddenByUser = false;         // global hotkey or tray "Hide cat"

function updateCatVisibility() {
  const show = !hiddenByUser;
  if (catWin && !catWin.isDestroyed()) {
    try { show ? catWin.show() : catWin.hide(); } catch { /* gone */ }
    // v3.7: the renderer pauses its rAF loop while hidden — a transparent
    // overlay painting 60fps for nobody was pure CPU burn.
    sendToCat('cat-visible', show);
  }
  if (tray) {
    const why = hiddenByUser ? 'hidden by hotkey' : 'your desktop cat';
    try { tray.setToolTip('MeowCat — ' + why); } catch {}
  }
  buildTrayMenu();   // refresh Hide/Show label
}

// ---------- system monitor (CPU/RAM spikes + battery relay) ----------
const spikeDetector = createSpikeDetector({});
let lastBatteryPushed = null;   // last battery state relayed to the renderer

function onSystemSample({ cpu, ram, battery, charging }) {
  if (store.get('reactSystemSpikes')) {
    const verdict = spikeDetector.push({ cpu, ram });
    if (verdict === 'stress') sendToCat('system-event', { type: 'stress' });
  }
  // v3.6.1: the low-battery feature finally has a real data source —
  // relay battery state to the renderer whenever it CHANGES (5s sampler).
  if (store.get('reactLowBattery') && battery != null && charging != null) {
    const state = { level: battery / 100, charging: !!charging };
    const sig = `${state.level}|${state.charging}`;
    if (sig !== lastBatteryPushed) {
      lastBatteryPushed = sig;
      sendToCat('system-event', { type: 'battery', ...state });
    }
  }
}

// v3.10: onProcessList (call-app detection + ducking) is gone — the monitor
// no longer samples process lists at all (one less recurring subprocess).

const sysMon = createSysMonitor({
  spawnFn: spawn,
  readFn: p => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } },
  intervalMs: process.platform === 'win32' ? 8000 : 5000,   // v3.7: Windows one-shots are expensive
  onSample: onSystemSample,
});

// ---------- music watcher (SMTC / playerctl) ----------
let prevMusic = null;
const musicWatcher = createMusicWatcher({
  spawnFn: spawn,
  onMusic: parsed => {
    const action = musicReaction(prevMusic, parsed);
    prevMusic = parsed;
    if (action && store.get('reactMusic')) sendToCat('music', { action, ...parsed });
  },
});

// ---------- typing meter (global keyboard hook on Windows) ----------
// v3.11 THE AUTO-QUIT FIX. uiohook-napi is a NATIVE module: a hard crash
// inside its keyboard thread (secure desktop / UAC prompt / RDP / driver
// quirks) aborts the whole Electron process — uncaughtException can never
// catch it. That was the last un-guarded path that could make the cat vanish
// without the user asking ("major bug: cat auto quitting"). The hook now
// runs in an Electron utilityProcess: a native crash kills only the child,
// the manager respawns it with backoff, and the cat never notices.
const typingMeter = createTypingMeter({});
const typingHook = createTypingHookManager({
  spawnFn: () => utilityProcess.fork(path.join(__dirname, 'src', 'typing-hook-child.cjs'), [], {
    serviceName: 'MeowCatTypingHook',
  }),
  onKey: () => typingMeter.key(),
  onDown: () => logCrash('typing-hook-down', new Error('utility child exited — respawning')),
});

function startTypingHook() {
  if (!store.get('reactTyping')) return;
  typingHook.start();
}
function stopTypingHook() {
  typingHook.stop();
}

// ---------- idle ticker: typing pounce/nap, cursor stalking, dance party ----------
let idleTimer = null;
let cursorTimer = null;
let lastCursor = null;
let cursorIdleSince = 0;
let cursorIdleSent = false;
let lastPartyAt = 0;
let lastNapAt = 0;

function startIdleTicker() {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    try {
      // typing bursts -> excited pounce at the keyboard
      if (store.get('reactTyping')) {
        const act = typingMeter.tick();
        if (act === 'pounce') sendToCat('typing', { action: 'pounce' });
      }
      // system-wide idle: dance party (screensaver mode) + nap
      let idleSec = 0;
      try { idleSec = powerMonitor.getSystemIdleTime(); } catch { idleSec = 0; }
      if (store.get('reactTyping') && idleSec > 12 * 60 && Date.now() - lastNapAt > 30 * 60_000) {
        lastNapAt = Date.now();
        sendToCat('typing', { action: 'nap' });
      }
      if (store.get('dancePartyIdle') &&
          shouldDanceParty(idleSec, { lastPartyAgeSec: (Date.now() - lastPartyAt) / 1000 })) {
        lastPartyAt = Date.now();
        sendToCat('dance-party', {});
      }
    } catch { /* never die over a ticker */ }
  }, 3000);
  idleTimer.unref?.();
}
function stopIdleTicker() { if (idleTimer) { clearInterval(idleTimer); idleTimer = null; } }

function startCursorWatch() {
  if (cursorTimer || !store.get('stalkCursor')) return;
  cursorTimer = setInterval(() => {
    try {
      const p = screen.getCursorScreenPoint();
      const moved = lastCursor ? Math.hypot(p.x - lastCursor.x, p.y - lastCursor.y) : 999;
      lastCursor = p;
      if (moved < 4) {
        if (!cursorIdleSince) cursorIdleSince = Date.now();
        if (!cursorIdleSent && Date.now() - cursorIdleSince > 2500) {
          cursorIdleSent = true;
          sendToCat('cursor-idle', p);
        }
      } else if (cursorIdleSent) {
        cursorIdleSince = 0; cursorIdleSent = false;
        sendToCat('cursor-busy', p);
      }
    } catch { /* headless dev */ }
  }, 500);
  cursorTimer.unref?.();
}
function stopCursorWatch() {
  if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
  cursorIdleSent = false; cursorIdleSince = 0;
}

// ---------- window scan results: platforms + new-window + fullscreen + apps ----------
let lastPlatSig = '[]';
let lastGameRoar = 0;

function onWindowScan(plats) {
  const clean = plats.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, title: p.title, proc: p.proc, id: p.id }));
  sendToCat('platforms', clean);

  // new app opened -> walk over and investigate
  if (store.get('reactNewWindows')) {
    const prevParsed = JSON.parse(lastPlatSig);
    const added = diffWindows(prevParsed, clean);
    if (added.length) {
      const w = added[0];
      sendToCat('new-window', { x: w.x + w.w / 2, y: w.y, title: w.title });
    }
  }
  lastPlatSig = JSON.stringify(clean);

  // v3.10: fullscreen auto-hide removed — the cat stays on stage, always.

  // app-specific reactions: loaf on editors, get hyped over games
  if (store.get('reactApps') && clean.length) {
    const top = clean[0];             // EnumWindows is z-ordered: first ≈ foreground
    const proc = top.proc || '';
    if (findEditorApp([proc])) {
      sendToCat('app-focus', { kind: 'editor', rect: { x: top.x, y: top.y, w: top.w, h: top.h }, proc });
    } else if (Date.now() - lastGameRoar > 90_000 &&
               /steam|epic|riot|minecraft|javaw|roblox|league|valorant|unity|unreal|game/i.test(proc)) {
      lastGameRoar = Date.now();
      sendToCat('app-focus', { kind: 'game', proc });
    }
  }
}

// ---------- build/test status file watcher ----------
// v3.6.1: a 5s poll instead of fs.watch — watch dies on atomic replaces
// (CI exporters rename files into place) and re-creating it on every
// unrelated settings change was pure churn. Verdicts fire on CHANGE only.
let statusPoller = null;
let lastStatusVerdict = null;

function applyStatusFile(on) {
  if (statusPoller) { clearInterval(statusPoller); statusPoller = null; }
  const p = store.get('statusFile');
  lastStatusVerdict = null;
  if (!on || !p) return;
  const readIt = () => {
    try {
      const verdict = parseStatusFile(fs.readFileSync(p, 'utf8'));
      if (verdict && verdict !== lastStatusVerdict) {
        lastStatusVerdict = verdict;
        sendToCat('system-event', { type: verdict === 'good' ? 'build-ok' : 'build-bad' });
      }
    } catch { /* file vanished mid-write */ }
  };
  statusPoller = setInterval(readIt, 5000);
  statusPoller.unref?.();
  readIt();
}

// ---------- pomodoro ----------
const pomodoroEngine = createPomodoro();

function startPomodoro(kind) {
  if (!store.get('pomodoro')) return null;
  pomodoroEngine.start(kind);
  buildTrayMenu();
  broadcastPomodoro('start');
  return pomodoroEngine.snapshot();
}
function stopPomodoro() {
  pomodoroEngine.stop();
  buildTrayMenu();
  broadcastPomodoro('stop');
}
function onPomodoroDone(which) {
  buildTrayMenu();
  if (which === 'focus') {
    sendToCat('pomodoro', { event: 'focus-done' });
    try {
      if (Notification.isSupported()) {
        new Notification({ title: '🍅 Focus round done!', body: 'Your cat did a celebration dance. Take 5!' }).show();
      }
    } catch {}
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 5) bumpStatAndCheck('pomodoroLate', 1);
  } else {
    sendToCat('pomodoro', { event: 'break-done' });
    try {
      if (Notification.isSupported()) {
        new Notification({ title: '☕ Break over', body: 'Back to it — your cat is watching.' }).show();
      }
    } catch {}
  }
  broadcastPomodoro('done');
}
function broadcastPomodoro(event) {
  const snap = pomodoroEngine.snapshot();
  sendToCat('pomodoro', { event, ...snap });
  try {
    const w = fastWins.isAlive('settings') ? fastWins.get('settings') : null;
    if (w && !w.isDestroyed()) w.webContents.send('pomodoro', { event, ...snap });
  } catch {}
}

// ---------- achievements + affection ----------
function bumpStatAndCheck(key, n = 1) {
  const v = store.bumpStat(key, n);
  if (v != null) checkAndSendUnlocks();
  return v;
}

function checkAndSendUnlocks() {
  if (!store.get('achievements')) return;
  const fresh = checkUnlocks(store.get('stats'), store.get('unlocked'));
  for (const id of fresh) {
    if (store.unlock(id)) {
      const a = ACHIEVEMENTS.find(x => x.id === id);
      if (a) sendToCat('achievement', {
        id: a.id, name: a.name, icon: a.icon, desc: a.desc,
        // v3.6.1: perks ride along with the unlock so the renderer can activate
        // them immediately (rainbow pets etc. used to stay dead in production)
        perks: unlockedPerks(store.get('unlocked')),
      });
    }
  }
}

// ---------- feature flag -> poller orchestration ----------
const FLAG_KEYS = new Set([
  'reactSystemSpikes', 'reactMusic',
  'stalkCursor', 'reactTyping', 'dancePartyIdle', 'reactBuildStatus',
  'statusFile', 'globalHotkeys', 'windowHopping', 'reactApps',
  'reactNewWindows', 'reactLowBattery',
]);

function applyFeatureFlags() {
  const needMonitor = store.get('reactSystemSpikes');
  if (needMonitor) sysMon.start(); else { sysMon.stop(); spikeDetector.reset(); }
  if (store.get('reactMusic')) musicWatcher.start(); else { musicWatcher.stop(); prevMusic = null; }
  if (store.get('stalkCursor')) startCursorWatch(); else stopCursorWatch();
  if (store.get('reactTyping') || store.get('dancePartyIdle')) { startIdleTicker(); startTypingHook(); }
  else { stopIdleTicker(); stopTypingHook(); }
  if (!store.get('reactTyping')) stopTypingHook();   // hook serves typing only — never keep it for the party
  lastBatteryPushed = null;   // next sample re-pushes battery state (idempotent)
  applyStatusFile(store.get('reactBuildStatus'));
  applyHotkeys(store.get('globalHotkeys'));
  const needScanner = store.get('windowHopping') || store.get('reactApps') ||
                      store.get('reactNewWindows');
  if (needScanner && process.platform === 'win32') ensureScanner();
  else scanner?.stop();
}

// ---------- global hotkeys ----------
function applyHotkeys(on) {
  try {
    if (on) {
      globalShortcut.register('Control+Alt+C', () => { hiddenByUser = !hiddenByUser; updateCatVisibility(); });
      globalShortcut.register('Control+Alt+P', () => { if (store.get('photoMode')) sendToCat('photo-mode', {}); });
    } else {
      globalShortcut.unregister('Control+Alt+C');
      globalShortcut.unregister('Control+Alt+P');
    }
  } catch { /* hotkeys unavailable (headless) */ }
}

// ================================================================ IPC
ipcMain.handle('settings:get', () => ({
  ...store.all,
  workArea: screen.getPrimaryDisplay().workArea,
  // v3.11: every display's work area — the renderer roams the union so the
  // cat can walk and be dragged onto the 2nd monitor
  workAreas: screen.getAllDisplays().map(d => d.workArea),
  season: seasonHat(new Date().getMonth()),
}));
ipcMain.handle('settings:set', (_e, kv) => {
  const applied = {};
  let flagsChanged = false;
  for (const [k, v] of Object.entries(kv || {})) {
    if (store.set(k, v)) applied[k] = v;
    // v3.11: the first user-picked breed latches the marker — the
    // grey_tabby→ginger_kitten default migration must never override it
    if (k === 'breed') store.set('breedExplicit', true);
    if (k === 'autoStart') applyAutoStart(v);
    if (FLAG_KEYS.has(k)) flagsChanged = true;
  }
  // v3.6.1: only re-orchestrate pollers when a flag actually changed —
  // a breed switch or size slider used to restart the status poller too.
  if (flagsChanged) applyFeatureFlags();
  if (catWin && !catWin.isDestroyed()) catWin.webContents.send('settings-changed', applied);
  return applied;
});
ipcMain.handle('coins:add', (_e, n) => store.addCoins(n));
ipcMain.handle('coins:get', () => store.get('coins'));
ipcMain.handle('store:buy', (_e, breed) => store.buyBreed(breed));

ipcMain.handle('reminders:list', () => sched.list());
ipcMain.handle('reminders:add', (_e, spec) => {
  const item = sched.add(spec);
  persistReminders();
  return item;
});
ipcMain.handle('reminders:remove', (_e, id) => { const ok = sched.remove(id); persistReminders(); return ok; });

// v3.3: the cat window follows the cat
ipcMain.handle('region:move', (_e, rect) => {
  if (!catWin || catWin.isDestroyed()) return null;
  // v3.11: clamp against the UNION of all displays — the cat may now roam
  // onto the 2nd monitor, and its window follows across display boundaries.
  const wa = unionWA();
  const num = (v, dflt) => (Number.isFinite(v) ? v : dflt);   // v3.6.1: NaN can never poison the region
  const w = Math.max(320, Math.min(num(rect?.w, region.w), wa.width));
  const h = Math.max(280, Math.min(num(rect?.h, region.h), wa.height));
  const x = Math.max(wa.x, Math.min(wa.x + wa.width - w, num(rect?.x, regionOrigin.x)));
  const y = Math.max(wa.y, Math.min(wa.y + wa.height - h, num(rect?.y, regionOrigin.y)));
  const nx = Math.round(x), ny = Math.round(y);
  const sizeChanged = w !== region.w || h !== region.h;
  const posChanged = nx !== regionOrigin.x || ny !== regionOrigin.y;
  region = { w, h };
  regionOrigin = { x: nx, y: ny };
  // v3.7: move-only updates use setPosition (a same-size setBounds can force
  // the transparent surface through a full native resize cycle = flicker),
  // and identical rects are skipped entirely.
  if (posChanged || sizeChanged) {
    try {
      if (sizeChanged) catWin.setBounds({ x: nx, y: ny, width: w, height: h });
      else catWin.setPosition(nx, ny, false);
    } catch {}
  }
  return { ...regionOrigin, ...region };
});

ipcMain.handle('hit-test', (_e, overCat) => {
  if (catWin && !catWin.isDestroyed()) {
    try { catWin.setIgnoreMouseEvents(!overCat, { forward: true }); } catch {}
  }
  return overCat;
});

// v3.9: the renderer retargets the platform tracker when it lands on /
// leaves a window top (id = hwnd, or null)
ipcMain.handle('platform-track', (_e, id) => {
  ensureTracker();
  try { platTracker?.track(Number.isFinite(id) ? id : null); } catch { /* dying stream */ }
  return true;
});

ipcMain.handle('open-window', (_e, name) => {
  if (name === 'reminders') openReminders();
  else openSettings();
});

ipcMain.handle('close-window', (_e, name) => {
  try { fastWins.hide('settings'); } catch { /* ignore */ }
});

ipcMain.handle('app-info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  platform: process.platform,
  aumid: MEOW_AUMID,
  // v3.6.1: real visibility state (backgroundThrottling:false keeps the
  // renderer's visibilityState "visible" even when hidden, so e2e + support
  // diagnostics need this from the source of truth)
  // v3.10: only the user-hidden flag remains — call/fullscreen hide are gone.
  hidden: { user: hiddenByUser },
}));
ipcMain.handle('open-external', (_e, url) => {
  try {
    if (typeof url === 'string' && /^https:\/\/github\.com\/[\w.-]+(\/[\w.-]+)?(\/[\w.-]+)?\/?$/.test(url)) {
      shell.openExternal(url);
    }
  } catch { /* ignore */ }
});

ipcMain.handle('context-menu', (_e, pos) => {
  const menu = Menu.buildFromTemplate([
    { label: '⚙ Settings…', click: () => openSettings() },
    { label: '⏰ Reminders…', click: () => openReminders() },
    { type: 'separator' },
    { label: '💃 Dance!', click: () => sendToCat('do-action', 'dance') },
    { label: '🍖 Feed', click: () => sendToCat('do-action', 'eat') },
    { label: '💤 Sleep now', click: () => sendToCat('do-action', 'sleep') },
    { label: '🔴 Laser pointer!', click: () => sendToCat('laser-start') },
    { label: '📸 Photo (PNG)', click: () => sendToCat('photo-mode', {}) },
    { type: 'separator' },
    { label: 'Quit MeowCat', click: () => { quitting = true; app.quit(); } },
  ]);
  try {
    menu.popup({
      window: catWin || undefined,
      x: Number.isFinite(pos?.x) ? Math.round(pos.x) : undefined,
      y: Number.isFinite(pos?.y) ? Math.round(pos.y) : undefined,
    });
  } catch { menu.popup(); }
});

// ---------------- v3.6 IPC ----------------
// photo mode: renderer freezes, snaps its transparent canvas, ships the PNG here
ipcMain.handle('photo:save', (_e, dataUrl) => {
  try {
    const m = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) return { ok: false, reason: 'bad-data' };
    if (m[1].length > 48 * 1024 * 1024) return { ok: false, reason: 'too-large' };   // sanity cap (~36MB PNG)
    let dir;
    try { dir = app.getPath('pictures'); } catch { dir = path.join(app.getPath('userData'), 'photos'); }
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const file = path.join(dir, `MeowCat-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`);
    fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
    return { ok: true, path: file };
  } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
});

// affection + stats + achievements
ipcMain.handle('affection:pet', () => {
  if (!store.get('affectionSystem')) return null;
  const a = store.addAffection(1);
  bumpStatAndCheck('pets', 1);
  return { affection: a, progress: affectionProgress(a) };
});
ipcMain.handle('stat:inc', (_e, key, n) => bumpStatAndCheck(key, n ?? 1));

// pomodoro controls (settings + tray share the same engine)
ipcMain.handle('pomodoro:start', (_e, kind) => startPomodoro(kind === 'break' ? 'break' : 'focus'));
ipcMain.handle('pomodoro:stop', () => stopPomodoro());
ipcMain.handle('pomodoro:state', () => pomodoroEngine.snapshot());

// no-walk zones: renderer gets the raw list and converts with its workArea
ipcMain.handle('zones:list', () => store.get('noWalkZoneList'));

// v3.11: no-walk zones are drawn like a Windows Snipping Tool selection — a
// fullscreen dimmed overlay with a crosshair on EVERY display (one window
// spanning the union bounds), drag a rectangle, Esc cancels. The old
// type-four-numbers form is gone.
let zoneWin = null;

ipcMain.handle('zones:select', () => {
  try {
    if (zoneWin && !zoneWin.isDestroyed()) { zoneWin.focus(); return true; }
    const u = unionWA();
    zoneWin = new BrowserWindow({
      x: u.x, y: u.y, width: u.width, height: u.height,
      transparent: true, frame: false, hasShadow: false,
      skipTaskbar: true, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false,
      show: false, backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true, nodeIntegration: false, spellcheck: false,
      },
    });
    zoneWin.setMenuBarVisibility(false);
    zoneWin.setAlwaysOnTop(true, 'screen-saver');
    zoneWin.loadFile(path.join(__dirname, 'windows', 'zone-select.html'));
    zoneWin.once('ready-to-show', () => {
      try {
        zoneWin.show();
        zoneWin.focus();
        zoneWin.webContents.send('zone-config', {
          union: u,
          primary: primaryWA(),
        });
      } catch { /* gone */ }
    });
    zoneWin.on('closed', () => { zoneWin = null; });
    return true;
  } catch { return false; }
});

ipcMain.handle('zone-select:finish', (_e, rect) => {
  try {
    if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
        Number.isFinite(rect.w) && Number.isFinite(rect.h) && rect.w > 12 && rect.h > 12) {
      const rel = toRelativeZone({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }, primaryWA());
      if (validZone(rel)) {
        const next = [...store.get('noWalkZoneList'), rel].slice(-24);
        store.set('noWalkZoneList', next);
        if (catWin && !catWin.isDestroyed()) catWin.webContents.send('settings-changed', { noWalkZoneList: next });
      }
    }
  } catch { /* ignore bad rects */ }
  try { zoneWin?.close(); } catch {}
  return true;
});
ipcMain.handle('zone-select:cancel', () => {
  try { zoneWin?.close(); } catch {}
  return true;
});

// community skins: settings sends the JSON text; main validates + stores
ipcMain.handle('skins:import', (_e, jsonText) => {
  try {
    const def = JSON.parse(String(jsonText || ''));
    const err = validateSkinDef(def);
    if (err) return { ok: false, reason: err };
    // v3.6.1: importing the SAME skin twice must not duplicate it —
    // dedupe on a stable signature of the definition
    const sig = JSON.stringify(def);
    const existing = store.get('customSkins').find(s => s.sig === sig);
    if (existing) {
      store.ownBreed('custom:' + existing.id);
      return { ok: true, id: 'custom:' + existing.id, deduped: true };
    }
    const base = String(def.name || 'skin').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'skin';
    const id = `${base}_${Date.now().toString(36).slice(-4)}`;
    store.addCustomSkin({ id, name: def.name, def, sig });
    store.ownBreed('custom:' + id);
    sendToCat('settings-changed', { customSkins: store.get('customSkins') });
    return { ok: true, id: 'custom:' + id };
  } catch (e) { return { ok: false, reason: 'invalid json' }; }
});

// status file picker — the "Browse…" button in settings used to be a stub
ipcMain.handle('status:browse', async () => {
  try {
    const r = await dialog.showOpenDialog({
      title: 'Pick the status file the cat should watch',
      properties: ['openFile', 'showOverwriteConfirmation'],
    });
    if (r.canceled || !r.filePaths?.length) return null;
    return r.filePaths[0];
  } catch { return null; }
});

// e2e / accessibility: synthetic keystrokes feed the same typing meter
ipcMain.handle('keys:inject', (_e, count) => {
  const now = Date.now();
  for (let i = 0; i < Math.max(1, Math.min(200, count | 0)); i++) typingMeter.key(now - i * 40);
  return true;
});

// settings quick actions -> the cat
ipcMain.handle('quick-action', (_e, act) => {
  if (act === 'laser') sendToCat('laser-start');
  else if (act === 'photo') { if (store.get('photoMode')) sendToCat('photo-mode', {}); }
  else if (act === 'dance' || act === 'eat' || act === 'sleep') sendToCat('do-action', act);
  return true;
});

app.whenReady().then(() => {
  applyAutoStart(store.get('autoStart'));
  createCatWindow();
  createTray();
  startBackgroundJobs();
  applyFeatureFlags();

  // initial pushes once the cat renderer is alive
  setTimeout(() => {
    sendToCat('no-walk-zones', store.get('noWalkZoneList'));
    if (store.get('timeOfDayMood')) {
      sendToCat('time-bias', timeBiasNow());
    }
    if (store.get('achievements') && store.get('affection') >= 250) {
      sendToCat('boot-greet', {});   // affection lvl 4: the cat greets you
    }
  }, 2500);

  screen.on('display-metrics-changed', () => {
    if (catWin && !catWin.isDestroyed()) catWin.webContents.send('workarea-changed');
  });
  // v3.11: monitors plugged/unplugged — refresh the union bounds the cat
  // roams, and keep the lane window inside a valid display.
  screen.on('display-added', () => { try { catWin && !catWin.isDestroyed() && catWin.webContents.send('workarea-changed'); } catch {} });
  screen.on('display-removed', () => {
    try {
      if (catWin && !catWin.isDestroyed()) catWin.webContents.send('workarea-changed');
      const u = unionWA();
      if (catWin && (catWin.getBounds().x > u.x + u.width || catWin.getBounds().y > u.y + u.height)) {
        catWin.setPosition(u.x + u.width - region.w, u.y + u.height - region.h, false);
      }
    } catch { /* gone */ }
  });
  // v3.11: after system sleep/resume, transparent windows have historically
  // died silently on some Windows driver stacks — revive the cat if needed.
  powerMonitor.on('resume', () => {
    try {
      if (!catWin || catWin.isDestroyed()) { createCatWindow(); return; }
      if (hiddenByUser) return;
      if (!catWin.isVisible()) catWin.show();
    } catch { /* never die on resume */ }
  });
  app.on('activate', () => { if (!catWin) createCatWindow(); });
});

function timeBiasNow() {
  const h = new Date().getHours();
  return (h >= 22 || h < 7) ? 'night' : 'day';
}

app.on('window-all-closed', () => {
  if (quitting) app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  enforcer?.stop();
  scanner?.stop();
  platTracker?.stop();   // v3.9: no orphan PowerShell
  sysMon.stop();
  musicWatcher.stop();
  stopIdleTicker();
  stopCursorWatch();
  stopTypingHook();
  applyHotkeys(false);
  if (statusPoller) clearInterval(statusPoller);
  fastWins.closeAll();
  if (schedTimer) clearInterval(schedTimer);
  if (coinTimer) clearInterval(coinTimer);
  if (quitTimer) clearInterval(quitTimer);
});
