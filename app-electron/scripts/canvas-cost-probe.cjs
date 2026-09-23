// canvas-cost-probe.js — measure the renderer raster cost of overlay
// architectures under software rendering (app.disableHardwareAcceleration):
//   A) 480x434 window, full-canvas clear+draw @60fps      (v3.8 region)
//   B) 1920x1030 window, dirty-rect clear+clip @60fps     (full-window plan)
//   C) 1920x1030 window, dirty-rect clear+clip @~15fps    (idle throttle)
// Usage: DISPLAY=:98 PROBE_SCEN=A|B|C electron scripts/canvas-cost-probe.js
'use strict';
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');

const SCEN = process.env.PROBE_SCEN || 'A';
const W = SCEN === 'A' ? 480 : 1920;
const H = SCEN === 'A' ? 434 : 1030;
const STEP = SCEN === 'C' ? 66 : 16;
const MEASURE_MS = 8000;

const PAGE = `<!DOCTYPE html><body style="background:transparent;margin:0"><script>
const cv = document.createElement('canvas');
cv.width = ${W}; cv.height = ${H};
cv.style.position = 'fixed'; cv.style.inset = '0';
document.body.appendChild(cv);
const ctx = cv.getContext('2d', { alpha: true });
const DIRTY = ${SCEN !== 'A'};
let prev = null, frames = 0;

function drawCatLike(x, y, t) {
  ctx.save();
  ctx.translate(x, y);
  const bob = Math.sin(t * 7) * 3;
  const g1 = ctx.createLinearGradient(0, -160 + bob, 0, 0);
  g1.addColorStop(0, '#d8b56a'); g1.addColorStop(1, '#b28c47');
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.ellipse(0, -70 + bob, 48, 62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -150 + bob, 34, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-30, -172 + bob); ctx.lineTo(-40, -205 + bob); ctx.lineTo(-12, -184 + bob); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(30, -172 + bob); ctx.lineTo(40, -205 + bob); ctx.lineTo(12, -184 + bob); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5b4a2b'; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(40, -60 + bob);
  ctx.quadraticCurveTo(90, -80 + Math.sin(t * 5) * 12, 80, -130 + bob);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-38 + i * 14, -110 + bob);
    ctx.quadraticCurveTo(-30 + i * 14, -80 + bob, -38 + i * 14, -50 + bob);
    ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath(); ctx.arc(-12, -155 + bob, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(12, -155 + bob, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function frame(t) {
  const px = ${W / 2} + Math.sin(t / 900) * 200;
  const bx = Math.max(0, Math.round(px) - 120), by = Math.max(0, Math.round(${H} - 260));
  const bw = 260, bh = 270;
  if (DIRTY) {
    const x0 = prev ? Math.min(prev.x, bx) : bx, y0 = prev ? Math.min(prev.y, by) : by;
    const x1 = prev ? Math.max(prev.x + prev.w, bx + bw) : bx + bw;
    const y1 = prev ? Math.max(prev.y + prev.h, by + bh) : by + bh;
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    drawCatLike(px, ${H} - 30, t / 1000);
    ctx.restore();
    prev = { x: bx, y: by, w: bw, h: bh };
  } else {
    ctx.clearRect(0, 0, ${W}, ${H});
    drawCatLike(px, ${H} - 30, t / 1000);
  }
  frames++;
}
let last = 0;
function loop(t) { if (t - last >= ${STEP} - 2) { last = t; frame(t); } requestAnimationFrame(loop); }
requestAnimationFrame(loop);
window.__frames = () => frames;
</script></body>`;

app.whenReady().then(() => {
  const win = new BrowserWindow({
    x: 0, y: 0, width: W, height: H,
    transparent: true, frame: false, hasShadow: false, skipTaskbar: true,
    resizable: false, movable: false, show: true,
    webPreferences: { backgroundThrottling: false },
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
  setTimeout(() => {
    const { execSync } = require('child_process');
    const ticks = () => {
      const out = execSync('ps -eo comm,time --no-headers', { encoding: 'utf8' });
      let sec = 0;
      for (const line of out.split('\n')) {
        if (!/electron/i.test(line)) continue;
        const m = line.trim().match(/(\d+):(\d+)$/);
        if (m) sec += (+m[1]) * 60 + (+m[2]);
      }
      return sec;
    };
    const s0 = ticks(); const t0 = Date.now();
    setTimeout(() => {
      const s1 = ticks(); const wall = (Date.now() - t0) / 1000;
      win.webContents.executeJavaScript('window.__frames()').then(fr => {
        console.log(`PROBE SCEN=${SCEN} ${W}x${H} step=${STEP}ms frames=${fr} cpu=${(((s1 - s0) / wall) * 100).toFixed(1)}%_of_one_core`);
        app.exit(0);
      }).catch(() => { console.log(`PROBE SCEN=${SCEN} cpu=${(((s1 - s0) / wall) * 100).toFixed(1)}%_of_one_core (no frame count)`); app.exit(0); });
    }, MEASURE_MS);
  }, 3000);
});
