// TOPIC: an instrument reading. Move the pointer to read across the traces.
import { registerScene, reduce, seeded } from '../world.js';

function topic(c, W, H, T, dt, p, s) {
  if (!s.init) { s.init = 1; const r = seeded(3); s.tr = Array.from({ length: 7 }, () => ({ m: .36 + r() * .4, k: .03 + r() * .018, a: .55 + r() * .4, g: r() })); }
  c.fillStyle = '#040906'; c.fillRect(0, 0, W, H);
  const narrow = W < 760, bh = H * .08;
  // On a phone the traces and the pulse share the room above the copy.
  const room = narrow && s.copy ? s.copy.y - 8 : H;
  const gx = narrow ? 0 : W * .34, gw = W - gx, gy = narrow ? 0 : H * .06;
  const gh = narrow ? Math.max(48, Math.min(H * .5, room - Math.min(bh, room * .22) - 14)) : H * .68;
  c.strokeStyle = 'rgba(80,220,150,.11)'; c.lineWidth = 1;
  for (let i = 0; i <= 12; i++) { const x = gx + gw * i / 12; c.beginPath(); c.moveTo(x, gy); c.lineTo(x, gy + gh); c.stroke(); }
  for (let i = 0; i <= 8; i++) { const y = gy + gh * i / 8; c.beginPath(); c.moveTo(gx, y); c.lineTo(W, y); c.stroke(); }
  const loop = reduce ? 1 : Math.min(1, (T % 11) / 8.5);
  c.lineWidth = 2; c.shadowBlur = 12;
  s.tr.forEach(tr => {
    const col = `hsl(${146 + tr.g * 34} 100% ${58 + tr.g * 14}%)`;
    c.strokeStyle = col; c.shadowColor = col; c.beginPath();
    for (let i = 0; i <= 220 * loop; i++) { const u = i / 220, y = gy + gh * .94 - gh * .86 * tr.a / (1 + Math.exp(-(u - tr.m) / tr.k)) - Math.sin(u * 120 + tr.g * 9) * .7; const x = gx + gw * u; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  });
  c.shadowBlur = 8; c.shadowColor = '#FFC44D'; c.strokeStyle = '#FFC44D'; c.lineWidth = 1.5;
  const pulse = narrow ? Math.min(bh, room * .22) : bh, by = narrow ? gy + gh + 8 : H * .8, per = 150, off = (T * 34) % per;
  c.beginPath();
  for (let x = gx - off; x < W + per; x += per) { c.moveTo(x, by + pulse); c.lineTo(x + 34, by + pulse); c.lineTo(x + 34, by); c.lineTo(x + 72, by); c.lineTo(x + 72, by + pulse * .55); c.lineTo(x + 112, by + pulse * .55); c.lineTo(x + 112, by + pulse); c.lineTo(x + per, by + pulse); }
  c.stroke(); c.shadowBlur = 0;
  if (p.active && p.x > gx) { c.strokeStyle = 'rgba(180,255,220,.6)'; c.lineWidth = 1; c.setLineDash([4, 5]); c.beginPath(); c.moveTo(p.x, gy); c.lineTo(p.x, gy + gh); c.stroke(); c.setLineDash([]); }
}

registerScene(topic);
