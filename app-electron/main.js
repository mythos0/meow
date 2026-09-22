// main.js — MeowCat Electron main process (ESM)
'use strict';
import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, Notification, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createSettings } from './src/settings-store.js';
import { ReminderScheduler } from './src/reminder-scheduler.js';
import { createTopmostEnforcer } from './src/topmost.js';
import { createWindowScanner } from './src/window-scan.js';
import { createFastWindows } from './src/fast-windows.js';
import { computeRegionSize, initialOrigin } from './src/region.js';

// ------------------------------------------------------------------ v3.2/v3.4 memory & process diet
// User-visible goal: fewest possible processes & lowest RAM in Task Manager.
//  1. no GPU process — the cat is a tiny 2D canvas, Skia software rendering is
//     plenty and a full GPU process (~50-120MB) is pure waste
//  2. single helper window: Reminders lives INSIDE Settings (one warm hidden
//     renderer instead of two), self-destroying after 5 idle minutes (v3.4)
app.disableHardwareAcceleration();                         // no GPU process (API)
app.commandLine.appendSwitch('in-process-gpu');            // belt & braces
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=160'); // applies to renderers
process.title = 'MeowCat';                     // honest name in ps/top (works: comm=MeowCat)
// v3.5 identity: Windows groups taskbar buttons, names toast notifications and
// shows the "app" in Task Manager's App section via the AppUserModelID —
// without this, Windows can fall back to the generic "Electron" identity.
// (Electron 33 has the setter but no getter — the constant below is also what
// app-info reports so the e2e can assert it.)
const MEOW_AUMID = 'com.mythos0.meowcat';
app.setAppUserModelId(MEOW_AUMID);

// v3.4 process diet — the honest floor for stock Electron, verified empirically:
//  * TRUE single-process (--single-process) SIGTRAP-crashes a BLANK Electron 33
//    app at boot (framework bug in Chromium 130) → unusable, don't ship it.
//  * Switches appended here never reach the EARLY helper processes (zygotes,
//    network utility spawn before our JS runs) — verified inert, so the only
//    way to pass them would be a self-relaunch hack, not worth the fragility.
//  * Windows has no zygotes and crashpad only starts with crashReporter.start()
//    (we never start it) → at rest Windows Task Manager shows:
//        MeowCat.exe  (main)  +  MeowCat.exe (renderer)  +  network helper
//    = 3 MeowCat entries, all named MeowCat (was 7 "electron" rows pre-v3.2).
//  * The warm settings renderer now self-destroys after 5 idle minutes
//    (fast-windows.js), so the at-rest count is what the user measures.

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

// v3.4: window-top platform scanner, created on demand (settings toggle)
function ensureScanner() {
  if (process.platform !== 'win32') return;
  if (!scanner) {
    scanner = createWindowScanner({
      spawnFn: spawn,
      intervalMs: 3200,
      onResult: plats => {
        if (catWin && !catWin.isDestroyed()) catWin.webContents.send('platforms', plats);
      },
    });
  }
  scanner.start();
}

// ---------------------------------------------------------------- single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (catWin) catWin.show(); });
}

// ---------------------------------------------------------------- cat overlay window
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

function createCatWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  // v3.3 RAM diet: the overlay is a small region that follows the cat
  // (fullscreen transparent surface used to dominate renderer RAM).
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
      v8CacheOptions: 'none',   // don't hold code-cache blobs we never reuse
    },
  });
  catWin.setMenuBarVisibility(false);
  catWin.loadFile(path.join(__dirname, 'windows', 'cat.html'));
  catWin.once('ready-to-show', () => catWin.show());

  enforcer = createTopmostEnforcer(catWin, { level: 'screen-saver', intervalMs: 2000 });
  enforcer.start();

  try { catWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
  try { catWin.setIgnoreMouseEvents(true, { forward: true }); } catch {}

  catWin.on('closed', () => { catWin = null; });
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
  const menu = Menu.buildFromTemplate([
    { label: 'MeowCat ' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: 'Dance!', click: () => catWin?.webContents.send('do-action', 'dance') },
    { label: 'Feed', click: () => catWin?.webContents.send('do-action', 'eat') },
    { label: 'Sleep now', click: () => catWin?.webContents.send('do-action', 'sleep') },
    { label: 'Laser pointer!', click: () => catWin?.webContents.send('laser-start') },
    { type: 'separator' },
    { label: 'Reminders…', click: () => openReminders() },
    { label: 'Settings…', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setToolTip('MeowCat — your desktop cat');
  tray.setContextMenu(menu);
  tray.on('click', () => openSettings());
}

// ---------------------------------------------------------------- helper windows
// v3.2: ONE warm helper window — Reminders is a section inside Settings now,
// so there is a single hidden renderer instead of two (RAM diet).
const WIN_SPECS = {
  settings: { width: 640, height: 940, title: 'MeowCat Settings' },
};

function makeWindow(name) {
  const spec = WIN_SPECS[name];
  const w = new BrowserWindow({
    width: spec.width, height: spec.height, show: false,
    resizable: false, minimizable: true, autoHideMenuBar: true,
    title: spec.title, backgroundColor: '#15161c', icon: ICON_PATH,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
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

// 'reminders' opens the same Settings window (the UI scrolls to the section)
function openReminders() {
  const w = openSettings();
  try { w?.webContents?.send('focus-reminders'); } catch {}
}

// ---------------------------------------------------------------- scheduler + coins
function startBackgroundJobs() {
  schedTimer = setInterval(() => {
    const due = sched.dueReminders();
    for (const item of due) {
      if (catWin && !catWin.isDestroyed()) catWin.webContents.send('reminder-fired', item);
      try {
        if (Notification.isSupported()) {
          const n = new Notification({
            title: '🐱 ' + item.label,
            body: 'Your cat has a message for you!',
            silent: !item.sound,
          });
          if (item.sound) n.on('click', () => catWin?.webContents.send('do-action', 'dance'));
          n.show();
        }
      } catch {}
    }
    if (due.length) persistReminders();
  }, 1000);
  schedTimer.unref?.();

  // passive coin income: +1 / 30s
  coinTimer = setInterval(() => { store.addCoins(1); }, 30000);
  coinTimer.unref?.();
}

// ---------------------------------------------------------------- auto-start
// v3.4: for the PORTABLE build process.execPath points into the throwaway
// %TEMP% extraction dir (gone after reboot) — register the original .exe the
// user actually launched instead, so auto-start survives temp cleanups.
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

// ---------------------------------------------------------------- IPC
ipcMain.handle('settings:get', () => ({ ...store.all, workArea: screen.getPrimaryDisplay().workArea }));
ipcMain.handle('settings:set', (_e, kv) => {
  const applied = {};
  for (const [k, v] of Object.entries(kv || {})) {
    if (store.set(k, v)) applied[k] = v;
    if (k === 'autoStart') applyAutoStart(v);
    if (k === 'windowHopping') { if (v) ensureScanner(); else scanner?.stop(); }
  }
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

// v3.3: the cat window follows the cat — the renderer asks for origin moves
// (and, when the size slider / workArea changes, resizes). Pure moves are
// cheap native repositions; the surface is only reallocated on real resizes.
ipcMain.handle('region:move', (_e, rect) => {
  if (!catWin || catWin.isDestroyed()) return null;
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.max(320, Math.min(rect?.w ?? region.w, wa.width));
  const h = Math.max(280, Math.min(rect?.h ?? region.h, wa.height));
  const x = Math.max(wa.x, Math.min(wa.x + wa.width - w, rect?.x ?? regionOrigin.x));
  const y = Math.max(wa.y, Math.min(wa.y + wa.height - h, rect?.y ?? regionOrigin.y));
  region = { w, h };
  regionOrigin = { x: Math.round(x), y: Math.round(y) };
  try { catWin.setBounds({ x: regionOrigin.x, y: regionOrigin.y, width: w, height: h }); } catch {}
  return { ...regionOrigin, ...region };
});

ipcMain.handle('hit-test', (_e, overCat) => {
  if (catWin && !catWin.isDestroyed()) {
    try { catWin.setIgnoreMouseEvents(!overCat, { forward: true }); } catch {}
  }
  return overCat;
});

ipcMain.handle('open-window', (_e, name) => {
  if (name === 'reminders') openReminders();
  else openSettings();
});

// in-page Close buttons must hide via IPC: renderer-initiated window.close()
// destroys the window outright and would bypass the warm-pool close handler
ipcMain.handle('close-window', (_e, name) => {
  try { fastWins.hide('settings'); } catch { /* ignore */ }
});

// About page info + whitelisted external links (developer GitHub)
ipcMain.handle('app-info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  platform: process.platform,
  aumid: MEOW_AUMID,   // v3.5: e2e asserts this is MeowCat's
}));
ipcMain.handle('open-external', (_e, url) => {
  try {
    if (typeof url === 'string' && /^https:\/\/github\.com\/[\w.-]+(\/[\w.-]+)?(\/[\w.-]+)?\/?$/.test(url)) {
      shell.openExternal(url);
    }
  } catch { /* ignore */ }
});

// right-click context menu on the cat, positioned at the cursor
ipcMain.handle('context-menu', (_e, pos) => {
  const menu = Menu.buildFromTemplate([
    { label: '⚙ Settings…', click: () => openSettings() },
    { label: '⏰ Reminders…', click: () => openReminders() },
    { type: 'separator' },
    { label: '💃 Dance!', click: () => catWin?.webContents.send('do-action', 'dance') },
    { label: '🍖 Feed', click: () => catWin?.webContents.send('do-action', 'eat') },
    { label: '💤 Sleep now', click: () => catWin?.webContents.send('do-action', 'sleep') },
    { label: '🔴 Laser pointer!', click: () => catWin?.webContents.send('laser-start') },
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

app.whenReady().then(() => {
  applyAutoStart(store.get('autoStart'));
  createCatWindow();
  createTray();
  startBackgroundJobs();

  // v3.1: window-top platform scanner (cat hops onto nearby window borders).
  // v3.2: 3.2s cadence — each scan briefly spawns PowerShell; a slightly
  // longer beat halves the CPU churn and RAM spikes with no perceptible lag.
  // v3.4: user-controllable (Behaviour → "Jump on window tops"); each scan is
  // a transient PowerShell process, so the toggle doubles as a process diet.
  if (store.get('windowHopping') !== false) ensureScanner();

  // v3.3 RAM diet: no eager warm pool — the hidden settings renderer used to
  // sit resident (~57MB PSS) while the user measures at-rest RAM in Task
  // Manager. First open creates it (~150ms, local file), afterwards the pool
  // keeps it warm exactly as before.

  screen.on('display-metrics-changed', () => {
    if (catWin && !catWin.isDestroyed()) catWin.webContents.send('workarea-changed');
  });
  app.on('activate', () => { if (!catWin) createCatWindow(); });
});

app.on('window-all-closed', () => {
  // keep running in tray; quit only via menu
  if (quitting) app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  enforcer?.stop();
  scanner?.stop();
  fastWins.closeAll();
  if (schedTimer) clearInterval(schedTimer);
  if (coinTimer) clearInterval(coinTimer);
});
