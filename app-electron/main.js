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
import { computeRegionSize, initialOrigin, unionWorkAreas, dragWindowTarget } from './src/region.js';
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
import { createExecLog } from './src/exec-log.js';

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

// v3.12 THE HARD QUIT GATE — layer two of the auto-quit fix. v3.11 removed
// the native crash path (keyboard hook → utilityProcess) and v3.10 swallowed
// JS exceptions, yet the cat could still vanish on real machines. From this
// release the process refuses to die unless the USER pressed Quit: every
// other path into before-quit (a stray app.quit() from any code path, the OS
// closing the last window, a future regression) is intercepted, logged with
// the culprit's stack trace into the crash journal, and REVERSED. The only
// exits that pass are the explicit tray/context-menu Quit (quitting=true)
// and the duplicate-launcher deference at boot.
app.on('before-quit', e => {
  if (!quitting) {
    e.preventDefault();
    console.error('[meowcat] BLOCKED an automatic quit — the cat stays alive');
    logCrash('blocked-auto-quit', new Error('before-quit with no user Quit action\n' + new Error().stack));
    return;
  }
  logCrash('user-quit', new Error('explicit Quit — cleaning up'));
  onExplicitShutdown();
});

// v3.12: app.exit() and process.exit() bypass before-quit — they are patched
// to the same gate so a stray call cannot kill the cat either.
const __realAppExit = app.exit.bind(app);
app.exit = code => {
  if (!quitting) {
    logCrash('blocked-app-exit', new Error('app.exit(' + code + ') with no user Quit action\n' + new Error().stack));
    return;
  }
  __realAppExit(code);
};
const __realProcessExit = process.exit.bind(process);
process.exit = code => {
  if (!quitting) {
    logCrash('blocked-process-exit', new Error('process.exit(' + code + ') with no user Quit action\n' + new Error().stack));
    return;
  }
  __realProcessExit(code);
};

// v3.12: console/terminal signals must not take the cat down either — the
// cat outlives the terminal that launched it (SIGINT/SIGTERM/SIGHUP are
// ignored until the user actually quits; only SIGKILL/TerminateProcess,
// which nothing legitimate uses, remains).
for (const __sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  try {
    process.on(__sig, () => {
      if (!quitting) {
        logCrash('signal-ignored', new Error(__sig + ' received with no user Quit action — cat stays alive'));
        return;
      }
      __realProcessExit(0);
    });
  } catch { /* some signals may be unavailable */ }
}

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
  // v3.14: real self-heal incidents are execution-log entries too (the
  // terminal page renders them in red)
  try {
    execLog.push({
      src: 'sys', tag: kind, ts: Date.now(),
      msg: String(err && (err.message || err)).split('\n')[0].slice(0, 200),
      data: { kind },
    });
  } catch { /* log not ready yet */ }
}
app.on('child-process-gone', (_e, details) => {
  console.error('[meowcat] child-process-gone:', details?.type, details?.reason);
  logCrash('child-process-gone', new Error(`${details?.type} ${details?.reason}`));
});

// ---------------- v3.14 THE EXECUTION LOG ----------------
// Every real thing the cat system executes, ring-buffered and streamable to
// the hidden terminal page in the Cat Store. Entries are appended ONLY by
// code that genuinely ran — nothing synthetic, nothing cosmetic.
const execLog = createExecLog({ cap: 600 });
function xlog(src, tag, msg, data) {
  try {
    const entry = execLog.push({ src, tag, msg, data, ts: Date.now() });
    if (entry) broadcastExecLog(entry);
  } catch { /* the log never breaks the cat */ }
}
function broadcastExecLog(entry) {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      try { if (!win.isDestroyed()) win.webContents.send('exec-log:entry', entry); } catch { /* gone */ }
    }
  } catch { /* cosmetic */ }
}

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
let quitting = false;   // true ONLY after the user pressed Quit (or a duplicate launcher defers)

// v3.12: teardown shared by the real quit path (before-quit with quitting=true).
function onExplicitShutdown() {
  try { enforcer?.stop(); } catch {}
  try { scanner?.stop(); } catch {}
  try { platTracker?.stop(); } catch {}   // v3.9: no orphan PowerShell
  try { sysMon.stop(); } catch {}
  try { musicWatcher.stop(); } catch {}
  stopIdleTicker();
  stopCursorWatch();
  stopTypingHook();
  applyHotkeys(false);
  if (statusPoller) clearInterval(statusPoller);
  try { fastWins.closeAll(); } catch {}
  if (schedTimer) clearInterval(schedTimer);
  if (coinTimer) clearInterval(coinTimer);
  if (quitTimer) clearInterval(quitTimer);
  dragStop();   // v3.12: no drag poller outlives the app
}

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
  quitting = true;   // v3.12: a duplicate launcher defers to the RUNNING cat — a legitimate quit
  app.quit();
} else {
  app.on('second-instance', () => {
    if (hiddenByUser) { hiddenByUser = false; updateCatVisibility(); }
    else if (catWin && !catWin.isDestroyed()) catWin.show();
    else if (!catWin) createCatWindow();   // v3.10: re-summon the cat window too
  });
}

// ---------------------------------------------------------------- displays (v3.11 multi-monitor, v3.12 test seam)
// The cat roams the bounding-box UNION of every display's work area — that is
// how it can finally be dragged onto the 2nd monitor. Single-display machines
// get exactly the old behavior (the union IS the primary work area).
// v3.12: MEOWCAT_FAKE_DISPLAYS (JSON array of work-area rects) overrides the
// real monitor list so the e2e suite can exercise true multi-display
// geometry (drag + lane hop + zone base) inside a single-X-screen sandbox.
function allDisplays() {
  const raw = process.env.MEOWCAT_FAKE_DISPLAYS;
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length &&
          arr.every(d => d && Number.isFinite(d.x) && Number.isFinite(d.y) &&
                         Number.isFinite(d.width) && Number.isFinite(d.height))) {
        return arr.map((d, i) => ({ id: i + 1, workArea: { x: d.x, y: d.y, width: d.width, height: d.height } }));
      }
    } catch { /* malformed — fall through to real displays */ }
  }
  return screen.getAllDisplays();
}
function unionWA() {
  try { return unionWorkAreas(allDisplays().map(d => d.workArea)); }
  catch { try { return screen.getPrimaryDisplay().workArea; } catch { return { x: 0, y: 0, width: 1600, height: 1000 }; } }
}
function primaryWA() {
  try { const ds = allDisplays(); return ds[0]?.workArea || screen.getPrimaryDisplay().workArea; }
  catch { return { x: 0, y: 0, width: 1600, height: 1000 }; }
}

// ---------------------------------------------------------------- cat overlay window
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

let catWinRetryTimer = null;
function createCatWindow() {
  // v3.12: window creation is on the critical "cat exists" path — a throw
  // here used to leave the app alive but catless forever (the closed→recreate
  // chain died with the exception). Now every failure is logged and retried
  // forever until the cat is back on the desktop.
  try {
    makeCatWindow();
    if (catWinRetryTimer) { clearTimeout(catWinRetryTimer); catWinRetryTimer = null; }
  } catch (e) {
    logCrash('create-cat-window', e);
    if (!catWinRetryTimer) {
      catWinRetryTimer = setTimeout(() => {
        catWinRetryTimer = null;
        if (!catWin && !quitting) createCatWindow();
      }, 1500);
      catWinRetryTimer.unref?.();
    }
  }
}

function makeCatWindow() {
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
  xlog('main', 'window', `cat overlay created at ${regionOrigin.x},${regionOrigin.y} ${region.w}x${region.h}`);
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
      logCrash('render-process-gone', new Error(details?.reason || 'unknown'));
      try { catWin?.destroy(); } catch {}   // 'closed' handler recreates it
    });
  } catch {}
  // v3.12: a failed first load (AV file lock, disk hiccup) used to leave a
  // blank overlay forever — retry the load on our own.
  try {
    catWin.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
      if (!isMain || quitting) return;
      logCrash('did-fail-load', new Error(`${code} ${desc} ${url || ''}`));
      setTimeout(() => {
        try { if (catWin && !catWin.isDestroyed()) catWin.webContents.loadFile(path.join(__dirname, 'windows', 'cat.html')); } catch {}
      }, 800);
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
  workArea: primaryWA(),
  // v3.11: every display's work area — the renderer roams the union so the
  // cat can walk and be dragged onto the 2nd monitor
  workAreas: allDisplays().map(d => d.workArea),
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
  const ak = Object.keys(applied);
  if (ak.length) xlog('main', 'settings', `settings changed: ${ak.join(', ')}`, applied);
  return applied;
});
ipcMain.handle('coins:add', (_e, n) => store.addCoins(n));
ipcMain.handle('coins:get', () => store.get('coins'));
ipcMain.handle('store:buy', (_e, breed) => {
  const r = store.buyBreed(breed);
  xlog('main', 'store', `store:buy ${breed} → ${r && r.ok ? 'OWNED' : 'rejected'}`, r);
  return r;
});

ipcMain.handle('reminders:list', () => sched.list());
ipcMain.handle('reminders:add', (_e, spec) => {
  const item = sched.add(spec);
  persistReminders();
  xlog('main', 'reminder', `reminder set: ${item && item.label || 'untitled'}`, item);
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

// ---------------- v3.12 MAIN-DRIVEN DRAG ----------------
// The old drag relied on renderer mousemove, which stops firing the instant
// the cursor leaves the overlay window — exactly what happens at a monitor
// boundary before the window has caught up, and why the cat could never be
// pulled onto the 2nd monitor. Now main polls the REAL global cursor
// (screen.getCursorScreenPoint) at ~60Hz while a drag is active: it streams
// the cat position + the window origin to the renderer and moves the window
// itself, clamped against the union of every display. The renderer keeps a
// chase fallback if the stream ever stalls.
let drag = null;          // { grabX, grabY, timer, startedAt }
let lastDragSentAt = 0;   // diagnostics

// v3.12 e2e seam: a deterministic fake cursor for drag tests. Real machines
// never set MEOWCAT_TEST — screen.getCursorScreenPoint stays authoritative.
let fakeCursor = null;
try {
  const raw = process.env.MEOWCAT_FAKE_CURSOR;
  if (raw) { const p = JSON.parse(raw); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) fakeCursor = { x: p.x, y: p.y }; }
} catch { /* malformed env — real cursor */ }
function cursorPoint() {
  if (fakeCursor) return fakeCursor;
  try { return screen.getCursorScreenPoint(); } catch { return { x: 0, y: 0 }; }
}

function dragStop() {
  if (drag && drag.timer) { clearInterval(drag.timer); }
  if (drag) xlog('main', 'drag', `drag ended after ${((Date.now() - drag.startedAt) / 1000).toFixed(1)}s`);
  drag = null;
}

ipcMain.handle('drag:start', (_e, grab) => {
  try {
    if (!catWin || catWin.isDestroyed()) return false;
    const gx = Number.isFinite(grab?.x) ? grab.x : 0;
    const gy = Number.isFinite(grab?.y) ? grab.y : 0;
    dragStop();
    drag = { grabX: gx, grabY: gy, timer: null, startedAt: Date.now() };
    xlog('main', 'drag', `drag started (grab ${gx},${gy}) — polling the real cursor at 60Hz`);
    const step = () => {
      try {
        if (!drag || !catWin || catWin.isDestroyed()) { dragStop(); return; }
        if (Date.now() - drag.startedAt > 120_000) { dragStop(); return; }   // safety cap
        const p = cursorPoint();
        const u = unionWA();
        // identical margins to the renderer's brain.x/baseY clamps
        const catX = Math.max(u.x + 60, Math.min(u.x + u.width - 60, p.x - drag.grabX));
        const catY = Math.max(u.y + 120, Math.min(u.y + u.height - 8, p.y - drag.grabY));
        const t = dragWindowTarget(region, catX, catY, u);
        if (t.x !== regionOrigin.x || t.y !== regionOrigin.y) {
          regionOrigin = t;
          try { catWin.setPosition(t.x, t.y, false); } catch { /* gone */ }
        }
        lastDragSentAt = Date.now();
        sendToCat('drag-pos', { x: catX, y: catY, ox: t.x, oy: t.y, t: lastDragSentAt });
      } catch { /* cursor read hiccup — the next tick retries */ }
    };
    step();
    drag.timer = setInterval(step, 16);
    drag.timer.unref?.();
    return true;
  } catch { return false; }
});
ipcMain.handle('drag:end', () => { dragStop(); return true; });

// v3.12 e2e-only: teleport the (fake) cursor so drag tests are deterministic.
// Guarded behind MEOWCAT_TEST=1; a no-op in production.
ipcMain.handle('dev:move-cursor', (_e, p) => {
  if (process.env.MEOWCAT_TEST !== '1') return false;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { fakeCursor = { x: p.x, y: p.y }; return true; }
  return false;
});

// ---------------- v3.12 LIVENESS WATCHDOG ----------------
// One ping every 5s; the renderer answers with its paint counter + state.
//   · no pong for 15s            → the renderer is hung/dead → reload it
//   · awake + visible, paints frozen for ~10s → DWM kick (hide/show)
//   · still frozen after the kick → reload
// This is the "cat vanished but the process lives" guard: a blank transparent
// overlay is indistinguishable from a quit for the user, so we now detect and
// repair it on our own.
let hbTimer = null;
let lastPongAt = 0;
let lastPongInfo = null;
let lastPaintCount = -1;
let paintStalls = 0;

function startHeartbeat() {
  if (hbTimer) return;
  lastPongAt = Date.now();
  hbTimer = setInterval(() => {
    try {
      if (!catWin || catWin.isDestroyed()) return;
      catWin.webContents.send('heartbeat', { t: Date.now() });
      if (!lastPongInfo) return;   // still booting
      const silentFor = Date.now() - lastPongAt;
      if (silentFor > 15_000) {
        logCrash('heartbeat-timeout', new Error(`no renderer pong for ${silentFor}ms — reloading the cat`));
        lastPongAt = Date.now();
        lastPongInfo = null;
        try { catWin.webContents.reload(); } catch {}
        return;
      }
      const st = lastPongInfo.state;
      const awake = lastPongInfo.visible && !['sleep', 'curl'].includes(st);
      if (awake) {
        if (lastPongInfo.paintCount === lastPaintCount) {
          paintStalls++;
          if (paintStalls === 2) {
            logCrash('paint-stall', new Error('canvas frozen while awake+visible — DWM kick'));
            try { catWin.hide(); setTimeout(() => { try { catWin && !catWin.isDestroyed() && catWin.show(); } catch {} }, 120); } catch {}
          } else if (paintStalls >= 4) {
            paintStalls = 0;
            logCrash('paint-stall', new Error('canvas still frozen after kick — reloading the cat'));
            try { catWin.webContents.reload(); } catch {}
          }
        } else {
          paintStalls = 0;
          lastPaintCount = lastPongInfo.paintCount;
        }
      }
    } catch { /* the watchdog never kills the cat */ }
  }, 5000);
  hbTimer.unref?.();
}
ipcMain.handle('heartbeat:pong', (_e, info) => {
  lastPongAt = Date.now();
  if (info && typeof info === 'object') lastPongInfo = info;
  return true;
});

// v3.12 e2e-only: prove the quit gate by attempting a NON-explicit quit.
// Guarded behind MEOWCAT_TEST=1 so production never sees it.
ipcMain.handle('dev:force-quit', () => {
  if (process.env.MEOWCAT_TEST !== '1') return false;
  app.quit();   // quitting=false → the gate must block this
  return true;
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

// ---------------- v3.14 EXECUTION LOG IPC ----------------
ipcMain.on('exec-log:push', (_e, entry) => {
  // renderer-side real events (cat brain actions, hunts, swats, sounds…)
  try {
    const e = execLog.push(entry);
    if (e) broadcastExecLog(e);
  } catch { /* never break the renderer */ }
});
ipcMain.handle('exec-log:get', () => ({
  entries: execLog.all(),
  unlocked: !!store.get('execLogUnlocked'),
  pid: process.pid,
  version: app.getVersion(),
}));

// v3.14 the hidden door: the feedback form in the Cat Store unlocks the
// execution-log terminal when the message is exactly "1234"
ipcMain.handle('feedback:submit', (_e, payload) => {
  try {
    const message = String(payload?.message ?? '').trim();
    const contact = String(payload?.contact ?? '').slice(0, 120);
    const rating = Number.isFinite(payload?.rating) ? Math.max(1, Math.min(5, payload.rating | 0)) : null;
    const list = [...(store.get('feedbackList') || []), { message: message.slice(0, 2000), contact, rating, ts: Date.now() }].slice(-50);
    store.set('feedbackList', list);
    xlog('main', 'feedback', `feedback submitted (${message.length} chars)`, { rating, contact: contact || null });
    let unlockedNow = false;
    if (message === '1234' && !store.get('execLogUnlocked')) {
      store.set('execLogUnlocked', true);
      unlockedNow = true;
      xlog('sys', 'access', 'HIDDEN SECTION UNLOCKED — execution log terminal enabled', { via: 'feedback:1234' });
    }
    return { ok: true, unlocked: !!store.get('execLogUnlocked'), unlockedNow };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  }
});

// v3.11: no-walk zones are drawn like a Windows Snipping Tool selection — a
// dimmed crosshair overlay on every display, drag a rectangle, Esc cancels.
//
// v3.14 CRASH FIX ("app crashed while selecting a no-walk zone with the
// drawer") — the overlay used to be ONE transparent window spanning the
// bounding-box union of every display. On real Windows that is a layered
// window the size of the whole virtual desktop; under software compositing
// (in-process-gpu) a union-sized surface can exceed GPU texture limits /
// balloon RAM, and tearing that surface down mid-paint from an IPC handler
// could take the whole browser process with it. Four structural fixes:
//   1. ONE OVERLAY PER DISPLAY, each sized to that display's work area only
//      (no surface is ever bigger than a single screen — texture-safe);
//   2. close = hide() immediately (stops compositing), destroy() deferred
//      off the IPC tick (no swap-chain teardown mid-paint);
//   3. ready-to-show fallback timer (transparent windows sometimes never
//      emit it — the overlay then stayed invisible forever);
//   4. a generation counter so re-opening the drawer during the close race
//      always creates a FRESH overlay instead of focusing a dying one.
let zoneOverlays = [];      // [{ win, gen }]
let zoneGen = 0;            // generation — stale overlays are disposable
let zoneDragActive = false; // v3.14: the user is mid-draw — never yank the window
ipcMain.on('zone-select:dragging', (_e, v) => { zoneDragActive = !!v; });   // single persistent handler

function destroyZoneOverlays(gen = null, delayMs = 0) {
  const mine = zoneOverlays.filter(o => gen === null || o.gen === gen);
  if (gen !== null) zoneOverlays = zoneOverlays.filter(o => o.gen !== gen);
  else zoneOverlays = [];
  const reap = () => {
    for (const o of mine) {
      try {
        if (o.win && !o.win.isDestroyed()) {
          o.win.close();   // graceful teardown of the transparent surface FIRST
          setTimeout(() => { try { if (o.win && !o.win.isDestroyed()) o.win.destroy(); } catch { /* gone */ } }, 450);
        }
      } catch { /* gone */ }
    }
  };
  if (delayMs > 0) setTimeout(reap, delayMs);
  else reap();
}

ipcMain.handle('zones:select', () => {
  const createAll = () => {
    try {
      const gen = ++zoneGen;
      const displays = allDisplays().map(d => d.workArea)
        .filter(wa => wa && Number.isFinite(wa.x) && Number.isFinite(wa.y) && wa.width > 10 && wa.height > 10);
      if (!displays.length) displays.push({ x: 0, y: 0, width: 1600, height: 1000 });
      const keyOf = wa => `${wa.x},${wa.y}`;
      let currentKey = null;
      // v3.14: ONE overlay that FOLLOWS the cursor across displays. Two
      // simultaneous fullscreen transparent surfaces crashed the software
      // compositor ("renderer gone, exit 5" — the user's "app crashed"), so
      // the selector arms only the display the cursor is on and MOVES the
      // same window when the cursor travels to another display.
      const armDisplay = wa => {
        currentKey = keyOf(wa);
        const existing = zoneOverlays.find(o => o.gen === gen);
        if (existing) {
          try {
            const b = existing.win.getBounds();
            if (b.x !== wa.x || b.y !== wa.y || b.width !== wa.width || b.height !== wa.height) {
              existing.win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
            }
            existing.win.webContents.send('zone-config', { origin: { x: wa.x, y: wa.y }, width: wa.width, height: wa.height, gen });
            existing.win.focus();
          } catch { /* gone */ }
          return;
        }
        const win = new BrowserWindow({
          x: wa.x, y: wa.y, width: wa.width, height: wa.height,
          transparent: true, frame: false, hasShadow: false,
          skipTaskbar: true, resizable: false, movable: false,
          minimizable: false, maximizable: false, fullscreenable: false,
          show: false, backgroundColor: '#00000000',
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true, nodeIntegration: false, spellcheck: false,
          },
        });
        win.setMenuBarVisibility(false);
        try { win.setAlwaysOnTop(true, 'screen-saver'); } catch { /* some WMs refuse */ }
        xlog('main', 'zone', `zone overlay armed on display ${wa.x},${wa.y} ${wa.width}x${wa.height}`);
        try {
          win.webContents.on('render-process-gone', (_e, details) => {
            console.error('[meowcat] zone overlay renderer gone:', details?.reason, details?.exitCode);
            logCrash('zone-select-render-gone', new Error(`${details?.reason || 'unknown'} exit=${details?.exitCode}`));
            destroyZoneOverlays(gen, 0);
          });
        } catch { /* cosmetic */ }
        win.loadFile(path.join(__dirname, 'windows', 'zone-select.html'));
        const cfg = { origin: { x: wa.x, y: wa.y }, width: wa.width, height: wa.height, gen };
        let shown = false;
        const showNow = () => {
          if (shown) return; shown = true;
          try {
            if (win.isDestroyed()) return;
            win.show();
            win.focus();
            win.webContents.send('zone-config', cfg);
          } catch { /* gone */ }
        };
        win.once('ready-to-show', showNow);
        setTimeout(showNow, 1500);   // v3.14: ready-to-show can never fire on some stacks
        win.on('closed', () => { zoneOverlays = zoneOverlays.filter(o => o.win !== win); });
        zoneOverlays.push({ win, gen });
      };
      const inWA = (p, wa) => p && p.x >= wa.x && p.x < wa.x + wa.width && p.y >= wa.y && p.y < wa.y + wa.height;
      let cur = null;
      try { cur = cursorPoint(); } catch { /* no cursor yet */ }
      const first = displays.find(wa => inWA(cur, wa)) || displays[0];
      armDisplay(first);
      const watch = setInterval(() => {
        try {
          if (zoneGen !== gen) { clearInterval(watch); return; }
          if (zoneDragActive) return;                 // never yank mid-draw
          let p = null;
          try { p = cursorPoint(); } catch { /* transient */ }
          const wa = displays.find(w => inWA(p, w));
          if (wa && keyOf(wa) !== currentKey) armDisplay(wa);
        } catch { /* never die watching */ }
      }, 280);
      return true;
    } catch (e) {
      logCrash('zone-select-open', e);
      return false;
    }
  };
  try {
    // v3.14: any live overlay from an older generation is torn down first, and
    // the fresh overlays are created a beat LATER — creating new transparent
    // surfaces in the same tick the old ones die crashed the compositor
    const hadOld = zoneOverlays.length > 0;
    destroyZoneOverlays(null, 0);
    zoneGen++;   // stop any previous gen's display watcher
    if (hadOld) setTimeout(createAll, 190);
    else createAll();
    return true;
  } catch (e) {
    logCrash('zone-select-open', e);
    return false;
  }
});

ipcMain.handle('zone-select:finish', (_e, rect) => {
  try {
    if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
        Number.isFinite(rect.w) && Number.isFinite(rect.h) && rect.w > 12 && rect.h > 12) {
      // v3.12 FIX: zones are relative to the UNION the cat roams (the same
      // base the renderer converts them back with). They used to be stored
      // relative to the PRIMARY work area, so a zone drawn anywhere but the
      // top-left monitor landed offset on multi-monitor setups.
      const rel = toRelativeZone({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }, unionWA());
      if (validZone(rel)) {
        const next = [...store.get('noWalkZoneList'), rel].slice(-24);
        store.set('noWalkZoneList', next);
        xlog('main', 'zone', `no-walk zone added at ${rel.x},${rel.y} ${rel.w}x${rel.h}`, { count: next.length });
        if (catWin && !catWin.isDestroyed()) catWin.webContents.send('settings-changed', { noWalkZoneList: next });
      }
    }
  } catch { /* ignore bad rects */ }
  // v3.14: hide FIRST (stops the compositor painting this frame), destroy a
  // beat later off the IPC tick — tearing the transparent surface down
  // mid-paint was the native crash vector
  zoneDragActive = false;
  for (const o of zoneOverlays) { try { if (!o.win.isDestroyed()) o.win.hide(); } catch { /* gone */ } }
  destroyZoneOverlays(null, 140);   // reap after the compositor has quiesced
  zoneGen++;                        // stop the display watcher
  return true;
});
ipcMain.handle('zone-select:cancel', () => {
  zoneDragActive = false;
  for (const o of zoneOverlays) { try { if (!o.win.isDestroyed()) o.win.hide(); } catch { /* gone */ } }
  destroyZoneOverlays(null, 140);
  zoneGen++;                        // stop the display watcher
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
  xlog('main', 'quick-action', `quick action: ${act}`);
  if (act === 'laser') sendToCat('laser-start');
  else if (act === 'photo') { if (store.get('photoMode')) sendToCat('photo-mode', {}); }
  else if (act === 'dance' || act === 'eat' || act === 'sleep') sendToCat('do-action', act);
  return true;
});

app.whenReady().then(() => {
  xlog('main', 'boot', `MeowCat v${app.getVersion()} alive — pid ${process.pid}, platform ${process.platform}`);
  applyAutoStart(store.get('autoStart'));
  createCatWindow();
  createTray();
  startBackgroundJobs();
  applyFeatureFlags();
  startHeartbeat();   // v3.12: renderer liveness watchdog

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
  // v3.12: the cat's window never truly "stays" closed — the closed handler
  // resurrects it within 250ms. If this ever fires, it is diagnostics-worthy:
  // when quitting, exit cleanly; otherwise log and keep living.
  if (quitting) app.quit();
  else logCrash('window-all-closed', new Error('all windows closed with no user Quit action — cat keeps living'));
});
