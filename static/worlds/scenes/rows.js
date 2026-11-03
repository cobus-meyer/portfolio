// ARCi: rows, seen from above, with the rover working them. A tap sends it to the next row.
import { registerScene, reduce, seeded } from '../world.js';

const ANG = -.26, GAP = 74;

function arci(c, W, H, T, dt, p, s) {
  if (!s.init || s.W !== W || s.H !== H) {
    s.init = 1; s.W = W; s.H = H;
    const D = Math.ceil(Math.hypot(W, H) * 1.12); s.D = D;
    s.off = document.createElement('canvas'); s.off.width = D; s.off.height = D;
    const o = s.off.getContext('2d'), r = seeded(21);
    o.fillStyle = '#20180E'; o.fillRect(0, 0, D, D);
    for (let y = GAP / 2; y < D; y += GAP) for (let x = -10; x < D + 10; x += 13 + r() * 9) {
      const v = y + (r() - .5) * 7, rad = 12 + r() * 8;
      o.fillStyle = `hsl(${118 + r() * 24} ${32 + r() * 18}% ${15 + r() * 11}%)`; o.beginPath(); o.arc(x, v, rad, 0, 7); o.fill();
      for (let b = 0; b < 3; b++) if (r() > .3) { o.fillStyle = `hsl(${226 + r() * 22} 62% ${48 + r() * 22}%)`; o.beginPath(); o.arc(x + (r() - .5) * rad * 1.5, v + (r() - .5) * rad * 1.5, 1.8 + r() * 1.8, 0, 7); o.fill(); }
    }
    s.lane = Math.round((D / 2) / GAP); s.dir = 1; s.u = D * (reduce ? .62 : .28); s.turn = 0;
  }
  c.fillStyle = '#20180E'; c.fillRect(0, 0, W, H);
  c.save(); c.translate(W / 2, H / 2); c.rotate(ANG); c.translate(-s.D / 2, -s.D / 2);
  c.drawImage(s.off, 0, 0);
  const uMin = s.D / 2 - Math.hypot(W, H) * .42, uMax = s.D / 2 + Math.hypot(W, H) * .42, spd = reduce ? 0 : 118;
  if (s.turn > 0) {
    s.turn = Math.max(0, s.turn - dt * 2.1);
    if (s.turn === 0) { s.dir *= -1; s.lane += 1; if (s.lane * GAP > s.D / 2 + H * .36) s.lane = Math.round((s.D / 2 - H * .36) / GAP); }
  } else { s.u += s.dir * spd * dt; if ((s.dir > 0 && s.u > uMax) || (s.dir < 0 && s.u < uMin)) s.turn = 1; }
  const k = 1 - s.turn, onTurn = s.turn > 0, v = s.lane * GAP + (onTurn ? GAP * (1 - Math.cos(k * Math.PI)) / 2 : 0);
  const u = s.u + (onTurn ? s.dir * Math.sin(k * Math.PI) * GAP / 2 : 0);
  c.save(); c.translate(u, v); c.rotate(onTurn ? (s.dir > 0 ? k * Math.PI : Math.PI - k * Math.PI) : (s.dir > 0 ? 0 : Math.PI)); c.scale(1.75, 1.75);
  const g = c.createRadialGradient(18, 0, 2, 18, 0, 104); g.addColorStop(0, 'rgba(255,224,150,.5)'); g.addColorStop(1, 'rgba(255,224,150,0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(18, 0); c.arc(18, 0, 104, -.42, .42); c.closePath(); c.fill();
  c.fillStyle = '#111'; [[-14, -13], [8, -13], [-14, 9], [8, 9]].forEach(([a, b]) => c.fillRect(a, b, 11, 4.5));
  c.fillStyle = '#FFB020'; c.beginPath(); c.roundRect(-20, -11, 40, 22, 4); c.fill();
  c.fillStyle = '#5A3D12'; c.fillRect(-14, -8, 21, 16);
  c.fillStyle = '#5F73E6'; [[-10, -4], [-5, 2], [0, -3], [3, 3], [-8, 3], [-1, 1]].forEach(([a, b]) => { c.beginPath(); c.arc(a, b, 2.2, 0, 7); c.fill(); });
  c.fillStyle = '#1A1205'; c.fillRect(11, -7, 6, 14);
  c.restore(); c.restore();
}

registerScene(arci, {
  click: s => {
    if (reduce) { s.lane += 1; if (s.lane * GAP > s.D / 2 + s.H * .36) s.lane = Math.round((s.D / 2 - s.H * .36) / GAP); return; }
    if (s.init && !s.turn) s.turn = 1;
  },
});
