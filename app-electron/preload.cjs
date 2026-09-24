// preload.cjs — typed bridge between sandboxed renderer and main
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meow', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: kv => ipcRenderer.invoke('settings:set', kv),
  addCoins: n => ipcRenderer.invoke('coins:add', n),
  getCoins: () => ipcRenderer.invoke('coins:get'),
  buyBreed: b => ipcRenderer.invoke('store:buy', b),
  listReminders: () => ipcRenderer.invoke('reminders:list'),
  addReminder: spec => ipcRenderer.invoke('reminders:add', spec),
  removeReminder: id => ipcRenderer.invoke('reminders:remove', id),
  hitTest: overCat => ipcRenderer.invoke('hit-test', overCat),
  openWindow: name => ipcRenderer.invoke('open-window', name),
  contextMenu: pos => ipcRenderer.invoke('context-menu', pos),
  closeWindow: name => ipcRenderer.invoke('close-window', name),
  appInfo: () => ipcRenderer.invoke('app-info'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  moveRegion: rect => ipcRenderer.invoke('region:move', rect),
  trackPlatform: id => ipcRenderer.invoke('platform-track', id),   // v3.9
  // v3.6
  savePhoto: dataUrl => ipcRenderer.invoke('photo:save', dataUrl),
  petAffection: () => ipcRenderer.invoke('affection:pet'),
  bumpStat: (key, n) => ipcRenderer.invoke('stat:inc', key, n),
  startPomodoro: kind => ipcRenderer.invoke('pomodoro:start', kind),
  stopPomodoro: () => ipcRenderer.invoke('pomodoro:stop'),
  pomodoroState: () => ipcRenderer.invoke('pomodoro:state'),
  listZones: () => ipcRenderer.invoke('zones:list'),
  selectZone: () => ipcRenderer.invoke('zones:select'),          // v3.11 screenshot-style picker
  finishZone: rect => ipcRenderer.invoke('zone-select:finish', rect),
  cancelZone: () => ipcRenderer.invoke('zone-select:cancel'),
  importSkin: jsonText => ipcRenderer.invoke('skins:import', jsonText),
  injectKeys: n => ipcRenderer.invoke('keys:inject', n),
  quickAction: act => ipcRenderer.invoke('quick-action', act),
  browseStatusFile: () => ipcRenderer.invoke('status:browse'),
  on: (channel, fn) => {
    const allowed = [
      'do-action', 'reminder-fired', 'settings-changed', 'workarea-changed',
      'platforms', 'focus-reminders', 'laser-start',
      // v3.6 living-machine channels
      'system-event', 'music', 'typing', 'cursor-idle', 'cursor-busy',
      'new-window', 'app-focus', 'duck', 'pomodoro', 'achievement',
      'no-walk-zones', 'photo-mode', 'dance-party', 'time-bias', 'boot-greet',
      'cat-visible',   // v3.7: pause the render loop while the cat is hidden
      'platform-rect', // v3.9: live rect of the tracked platform window
      'zone-config',   // v3.11: union bounds for the zone-selection overlay
    ];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
