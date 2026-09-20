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
  on: (channel, fn) => {
    const allowed = ['do-action', 'reminder-fired', 'settings-changed', 'workarea-changed', 'platforms', 'focus-reminders'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
