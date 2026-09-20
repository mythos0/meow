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

// ------------------------------------------------------------------ v3.2 memory diet
// User-visible goal: fewest possible processes & lowest RAM in Task Manager.
//  1. no GPU process — the cat is a tiny 2D canvas, Skia software rendering is
//     plenty and a full GPU process (~50-120MB) is pure waste
//  2. network service in the browser process (no separate utility process)
//  3. audio service in the host process (no separate utility process)
//  4. single helper window: Reminders lives INSIDE Settings (one warm hidden
//     renderer instead of two)
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');            // no GPU process
app.commandLine.appendSwitch('network-service-in-process'); // no network utility
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=160');

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
  catWin = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
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
function applyAutoStart(on) {
  try { app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath }); } catch {}
}

// ---------------------------------------------------------------- IPC
ipcMain.handle('settings:get', () => ({ ...store.all, workArea: screen.getPrimaryDisplay().workArea }));
ipcMain.handle('settings:set', (_e, kv) => {
  const applied = {};
  for (const [k, v] of Object.entries(kv || {})) {
    if (store.set(k, v)) applied[k] = v;
    if (k === 'autoStart') applyAutoStart(v);
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
  if (process.platform === 'win32') {
    scanner = createWindowScanner({
      spawnFn: spawn,
      intervalMs: 3200,
      onResult: plats => {
        if (catWin && !catWin.isDestroyed()) catWin.webContents.send('platforms', plats);
      },
    });
    scanner.start();
  }

  // v3.2: pre-warm the single helper window so double-click opens instantly
  setTimeout(() => { fastWins.warm('settings'); }, 600);

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
