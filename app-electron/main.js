// main.js — MeowCat Electron main process (ESM)
'use strict';
import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createSettings } from './src/settings-store.js';
import { ReminderScheduler } from './src/reminder-scheduler.js';
import { createTopmostEnforcer } from './src/topmost.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let tray = null;
let catWin = null;
let settingsWin = null;
let remindersWin = null;
let enforcer = null;
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
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 560, height: 660, resizable: false, minimizable: true,
    title: 'MeowCat Settings', backgroundColor: '#15161c', autoHideMenuBar: true,
    icon: ICON_PATH,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  });
  settingsWin.loadFile(path.join(__dirname, 'windows', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function openReminders() {
  if (remindersWin && !remindersWin.isDestroyed()) { remindersWin.focus(); return; }
  remindersWin = new BrowserWindow({
    width: 520, height: 620, resizable: false,
    title: 'MeowCat Reminders', backgroundColor: '#15161c', autoHideMenuBar: true,
    icon: ICON_PATH,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  });
  remindersWin.loadFile(path.join(__dirname, 'windows', 'reminders.html'));
  remindersWin.on('closed', () => { remindersWin = null; });
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
  if (name === 'settings') openSettings();
  if (name === 'reminders') openReminders();
});

app.whenReady().then(() => {
  applyAutoStart(store.get('autoStart'));
  createCatWindow();
  createTray();
  startBackgroundJobs();
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
  if (schedTimer) clearInterval(schedTimer);
  if (coinTimer) clearInterval(coinTimer);
});
