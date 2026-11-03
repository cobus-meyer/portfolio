// Stellenbosch: where the traces start. A tap starts one where it lands.
import { registerScene, reduce, rand } from '../world.js';

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function stepTrace(s) {
  if (s.walk.length < 14 && Math.random() > .8) s.walk.push({ x: Math.round(rand(s.W) / 20) * 20, y: Math.round(rand(s.H) / 20) * 20, a: Math.floor(rand(8)), n: 0 });
  const o = s.o; o.strokeStyle = 'rgba(242,184,75,.2)'; o.fillStyle = 'rgba(242,184,75,.42)'; o.lineWidth = 2;
  s.walk = s.walk.filter(w => {
    const d = DIRS[w.a], nx = w.x + d[0] * 20, ny = w.y + d[1] * 20;
    o.beginPath(); o.moveTo(w.x, w.y); o.lineTo(nx, ny); o.stroke(); w.x = nx; w.y = ny; w.n++;
    if (Math.random() > .8) w.a = (w.a + (Math.random() > .5 ? 1 : 7)) % 8;
    if (w.n > 34 || nx < -20 || ny < -20 || nx > s.W + 20 || ny > s.H + 20) { o.beginPath(); o.arc(nx, ny, 4.5, 0, 7); o.fill(); return false; }
    return true;
  });
}

function edu(c, W, H, T, dt, p, s) {
  if (!s.init || s.W !== W || s.H !== H) {
    s.init = 1; s.W = W; s.H = H; s.off = document.createElement('canvas'); s.off.width = W; s.off.height = H; s.o = s.off.getContext('2d');
    s.o.fillStyle = '#5E1020'; s.o.fillRect(0, 0, W, H); s.walk = []; s.age = 0;
    if (reduce) for (let i = 0; i < 300; i++) stepTrace(s);
  }
  if (!reduce) {
    s.age += dt; s.tick = (s.tick || 0) + dt;
    if (s.age < 16 && s.tick > .05) { s.tick = 0; stepTrace(s); }
    if (s.age > 28) { s.o.fillStyle = 'rgba(94,16,32,.05)'; s.o.fillRect(0, 0, W, H); }
    if (s.age > 36) s.age = 0;
  }
  c.drawImage(s.off, 0, 0, W, H);
}

registerScene(edu, {
  click: (s, x, y) => {
    if (!s.o) return;
    s.walk.push({ x: Math.round(x / 20) * 20, y: Math.round(y / 20) * 20, a: Math.floor(rand(8)), n: 0 });
    // Traces only step early in the cycle, so a tap restarts it.
    if (s.age >= 16) s.age = 0;
    if (reduce) for (let i = 0; i < 36; i++) stepTrace(s);
  },
});
