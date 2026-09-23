const { app, BrowserWindow } = require('electron');
const { treeTicks } = require('./probe-ticks.cjs');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
const SCEN = process.env.PROBE_SCEN || 'E';
const W = 480, H = 434;
const PAGE = `<!DOCTYPE html><body style="background:transparent;margin:0"><script>
const cv = document.createElement('canvas');
cv.width = ${W}; cv.height = ${H};
cv.style.position = 'fixed'; cv.style.inset = '0';
document.body.appendChild(cv);
const ctx = cv.getContext('2d', { alpha: true });
const DIRTY = ${SCEN === 'G'};
let prev = null, frames = 0;
function draw(x, y, t) {
  ctx.save(); ctx.translate(x, y);
  const bob = Math.sin(t * 7) * 3;
  const g1 = ctx.createLinearGradient(0, -160 + bob, 0, 0);
  g1.addColorStop(0, '#d8b56a'); g1.addColorStop(1, '#b28c47');
  ctx.fillStyle = g1;
  ctx.beginPath(); ctx.ellipse(0, -70 + bob, 48, 62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -150 + bob, 34, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5b4a2b'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(40, -60 + bob);
  ctx.quadraticCurveTo(90, -80 + Math.sin(t * 5) * 12, 80, -130 + bob); ctx.stroke();
  ctx.restore();
}
function frame(t) {
  const px = ${W / 2} + Math.sin(t / 900) * 120;
  if (DIRTY) {
    const bx = Math.max(0, Math.round(px) - 120), by = Math.max(0, ${H} - 260);
    const x0 = prev ? Math.min(prev.x, bx) : bx, y0 = prev ? Math.min(prev.y, by) : by;
    const x1 = prev ? Math.max(prev.x + prev.w, bx + 260) : bx + 260;
    const y1 = prev ? Math.max(prev.y + prev.h, by + 270) : by + 270;
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    draw(px, ${H} - 30, t / 1000); ctx.restore();
    prev = { x: bx, y: by, w: 260, h: 270 };
  } else { ctx.clearRect(0, 0, ${W}, ${H}); draw(px, ${H} - 30, t / 1000); }
  frames++;
}
let last = 0;
function loop(t) { if (t - last >= 14) { last = t; frame(t); } requestAnimationFrame(loop); }
requestAnimationFrame(loop);
window.__frames = () => frames;
</script></body>`;
const MOVE = SCEN === 'E' ? 16 : SCEN === 'F' ? 33 : 0;
app.whenReady().then(() => {
  const win = new BrowserWindow({ x: 0, y: 0, width: W, height: H, transparent: true, frame: false, hasShadow: false, skipTaskbar: true, resizable: false, movable: false, show: true, webPreferences: { backgroundThrottling: false } });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
  setTimeout(() => {
    const s0 = treeTicks(); const t0 = Date.now();
    const mover = MOVE > 0 ? setInterval(() => {
      const b = win.getBounds();
      win.setPosition(b.x >= 200 ? 0 : b.x + 2, b.y >= 200 ? 0 : b.y + 2, false);
    }, MOVE) : null;
    setTimeout(() => {
      const s1 = treeTicks(); const wall = (Date.now() - t0) / 1000;
      if (mover) clearInterval(mover);
      const pct = ((s1 - s0) / 100 / wall) * 100;
      console.log(`PROBE SCEN=${SCEN} cpu=${pct.toFixed(1)}%_of_one_core ticks=${s1 - s0}`);
      app.exit(0);
    }, 12000);
  }, 3000);
});
