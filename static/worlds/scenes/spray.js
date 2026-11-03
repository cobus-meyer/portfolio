// DropSight: the page is the spray card. Pointer sprays where it goes; a tap lands a burst.
import { registerScene, reduce, rand } from '../world.js';

function drop(s, x, y) {
  const big = Math.random() > .972, r = big ? rand(3.5, 10) : rand(.5, 2.7), o = s.o;
  o.fillStyle = `rgba(13,${rand(38, 72) | 0},${rand(150, 196) | 0},${rand(.86, 1)})`;
  o.beginPath();
  if (big) {
    const n = 26, ph = rand(6);
    for (let i = 0; i <= n; i++) { const a = i / n * 6.283, q = r * (1 + .06 * Math.sin(a * 3 + ph) + .03 * Math.sin(a * 7 + ph)); i ? o.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q) : o.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    o.closePath();
  } else o.arc(x, y, r, 0, 7);
  o.fill(); s.n++;
  if (big && Math.random() > .72) s.marks.push({ x, y, r });
}

function spray(c, W, H, T, dt, p, s) {
  if (!s.init || s.W !== W || s.H !== H) {
    s.init = 1; s.W = W; s.H = H; s.n = 0; s.marks = []; s.wipe = 0;
    s.off = document.createElement('canvas'); s.off.width = W; s.off.height = H; s.o = s.off.getContext('2d');
    s.o.fillStyle = '#FFD400'; s.o.fillRect(0, 0, W, H);
    if (reduce) for (let i = 0; i < 1100; i++) drop(s, rand(W), rand(H));
  }
  if (!reduce) {
    if (s.wipe > 0) {
      s.o.fillStyle = 'rgba(255,212,0,.16)'; s.o.fillRect(0, 0, W, H); s.wipe -= dt;
      if (s.wipe <= 0) { s.o.fillStyle = '#FFD400'; s.o.fillRect(0, 0, W, H); s.n = 0; }
    } else {
      const nx = p.active ? p.x : W * (.56 + .36 * Math.sin(T * .47)), ny = p.active ? p.y : H * (.42 + .34 * Math.sin(T * .71 + 1));
      for (let i = 0; i < (p.active ? 8 : 4); i++) { const a = rand(6.28), r = Math.pow(Math.random(), .7) * (p.active ? 130 : 210); drop(s, nx + Math.cos(a) * r, ny + Math.sin(a) * r); }
      if (s.n > 4200) s.wipe = .9;
    }
  }
  c.drawImage(s.off, 0, 0, W, H);
  s.marks = s.marks.filter(m => T - (m.t ?? (m.t = T)) < 1.6);
  s.marks.forEach(m => {
    const age = (T - m.t) / 1.6, R = m.r + 8 + age * 7;
    c.globalAlpha = 1 - age; c.strokeStyle = '#E6001F'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(m.x, m.y, R, 0, 7); c.stroke();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { c.beginPath(); c.moveTo(m.x + a * R, m.y + b * R); c.lineTo(m.x + a * (R + 8), m.y + b * (R + 8)); c.stroke(); });
  });
  c.globalAlpha = 1;
}

registerScene(spray, {
  click: (s, x, y) => {
    if (!s.o) return;
    for (let i = 0; i < 120; i++) { const a = rand(6.28), q = Math.pow(Math.random(), .6) * 170; drop(s, x + Math.cos(a) * q, y + Math.sin(a) * q); }
  },
});
