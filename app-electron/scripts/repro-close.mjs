// repro-close.mjs — isolate: does close→preventDefault→hide survive window.close()?
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let w = null;

app.whenReady().then(() => {
  w = new BrowserWindow({ width: 300, height: 200, show: false });
  w.loadURL('data:text/html,<h1>hi</h1>');
  w.webContents.on('did-finish-load', () => {
    console.log('EVENT did-finish-load');
    w.show();
    setTimeout(() => {
      console.log('EVENT before-close, destroyed?', w.isDestroyed());
      w.close();
      setTimeout(() => {
        console.log('EVENT after-close, destroyed?', w.isDestroyed(), 'visible?', w.isVisible?.());
        w.show();
        setTimeout(() => {
          console.log('EVENT after-reshow, destroyed?', w.isDestroyed(), 'visible?', w.isVisible());
          app.quit();
        }, 400);
      }, 400);
    }, 300);
  });
  w.on('close', e => {
    if (!w.__allow) { console.log('EVENT close → preventDefault+hide'); e.preventDefault(); w.hide(); }
  });
  w.on('closed', () => console.log('EVENT closed (destroyed)'));
  w.on('hide', () => console.log('EVENT hide'));
  w.on('show', () => console.log('EVENT show'));
});
