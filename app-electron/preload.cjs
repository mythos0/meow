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
  zoneDragging: v => ipcRenderer.send('zone-select:dragging', v),   // v3.14: guard display-follow while drawing
  // v3.12 main-driven drag: main polls the real global cursor so the cat can
  // be dragged across monitor boundaries even where renderer mousemove dies
  dragStart: grab => ipcRenderer.invoke('drag:start', grab),
  dragEnd: () => ipcRenderer.invoke('drag:end'),
  devMoveCursor: p => ipcRenderer.invoke('dev:move-cursor', p),   // v3.12 e2e-only seam
  devForceQuit: () => ipcRenderer.invoke('dev:force-quit'),       // v3.12 e2e-only: must be BLOCKED by the quit gate
  heartbeatPong: info => ipcRenderer.invoke('heartbeat:pong', info),   // v3.12 liveness
  importSkin: jsonText => ipcRenderer.invoke('skins:import', jsonText),
  injectKeys: null,   // v3.17: typing meter removed
  quickAction: act => ipcRenderer.invoke('quick-action', act),
  // v3.14 the hidden execution log (unlocked via feedback "1234")
  submitFeedback: payload => ipcRenderer.invoke('feedback:submit', payload),
  execLogGet: () => ipcRenderer.invoke('exec-log:get'),
  execLogPush: entry => ipcRenderer.send('exec-log:push', entry),
  // v3.18: the voice bridge API is gone with the voice feature. The
  // music-state test seam stays for the meow-gate e2e checks.
  voiceTestMusic: on => ipcRenderer.invoke('voice:test-music', on),    // MEOWCAT_TEST only: force the music-playing state
  on: (channel, fn) => {
    const allowed = [
      'do-action', 'reminder-fired', 'settings-changed', 'workarea-changed',
      'platforms', 'focus-reminders', 'laser-start',
      // v3.6 living-machine channels
      // v3.17: system-event / music / typing / cursor-idle / cursor-busy /
      // new-window / app-focus / duck / time-bias were REMOVED with the
      // Reactions features
      'pomodoro', 'achievement',
      'no-walk-zones', 'photo-mode', 'dance-party', 'boot-greet',
      'cat-visible',   // v3.7: pause the render loop while the cat is hidden
      'platform-rect', // v3.9: live rect of the tracked platform window
      'zone-config',   // v3.11: union bounds for the zone-selection overlay
      'drag-pos',      // v3.12: main-driven drag cursor stream
      'heartbeat',     // v3.12: liveness ping from main
      'exec-log:entry',// v3.14: real-time execution-log stream
      // v3.18: the spoken-command feedback channels are gone with voice
      'music-state',   // v3.16: system-wide "music is playing" flag (meow gate)
    ];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
