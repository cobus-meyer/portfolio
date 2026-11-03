// Octoco: a drawing that gets finished. A scope-to-delivery line, then a field plan of centre pivots.
import { registerScene, reduce } from '../world.js';

function octoco(c, W, H, T, dt, p, s) {
  c.fillStyle = '#12337A'; c.fillRect(0, 0, W, H);
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 24) { c.strokeStyle = x % 120 ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.13)'; c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, H); c.stroke(); }
  for (let y = 0; y < H; y += 24) { c.strokeStyle = y % 120 ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.13)'; c.beginPath(); c.moveTo(0, y + .5); c.lineTo(W, y + .5); c.stroke(); }
  if (s.t0 == null) s.t0 = T;
  const pr = reduce ? 1 : Math.min(1, ((T - s.t0) % 20) / 5.5), part = (a, b) => Math.min(1, Math.max(0, (pr - a) / (b - a)));
  const narrow = W < 1000, ink = '#EAF1FF', copyB = s.copy ? s.copy.b : 0;
  c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = ink; c.fillStyle = ink;
  const outline = (x, y, w, h, k) => { const L = 2 * (w + h); let left = k * L; const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]; c.beginPath(); c.moveTo(x, y); for (let i = 0; i < 4 && left > 0; i++) { const [a, b] = pts[i], [e, f] = pts[i + 1], len = Math.hypot(e - a, f - b), q = Math.min(1, left / len); c.lineTo(a + (e - a) * q, b + (f - b) * q); left -= len; } c.stroke(); };

  // Everything is drawn in the room the copy leaves, so the two never collide.
  const n = narrow ? 3 : 4, m = W * .05, floor = narrow ? 14 : 24;
  const bw = narrow ? Math.min(W * .34, 240) : Math.min(240, W * .17), bh = bw * .5, gap = narrow ? Math.min(W * .14, 100) : Math.min(150, W * .1), bx = narrow ? (W - 2 * bw - gap) / 2 : W * .05;
  const by = narrow ? Math.max(H * .44, copyB + 16) : H * .15;
  const under = by + bh + 34, rMax = Math.min((W - m * 2) / (n * 2.16), H * (narrow ? .13 : .21)), rMin = 34;
  // Stacked: the circles sit under the boxes, and the boxes give way if there is no room for both.
  const boxes = !narrow || H - floor - under >= rMin * 2.1;
  const ceiling = narrow ? (boxes ? under : copyB + 12) : Math.max(under, copyB + 16);
  const r = Math.max(rMin, Math.min(rMax, (H - floor - ceiling) / 2.1)), cy = H - r * 1.05 - floor;

  if (boxes) {
    c.lineWidth = 2;
    outline(bx, by, bw, bh, part(0, .2));
    const ax = bx + bw, ay = by + bh / 2, ak = part(.2, .3);
    if (ak > 0) { c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + gap * ak, ay); c.stroke(); }
    if (ak >= 1) { c.beginPath(); c.moveTo(ax + gap - 9, ay - 6); c.lineTo(ax + gap, ay); c.lineTo(ax + gap - 9, ay + 6); c.stroke(); }
    outline(ax + gap, by, bw, bh, part(.3, .5));
    c.font = `700 ${Math.max(15, bw * .1)}px "Barlow Condensed", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (pr > .12) c.fillText('SCOPING', bx + bw / 2, ay);
    if (pr > .42) c.fillText('DELIVERY', ax + gap + bw / 2, ay);
    // Dimension line under both, the way a drawing marks a span. No numbers: none are claimed.
    const dk = part(.45, .58), dy = by + bh + 22;
    if (dk > 0) { c.lineWidth = 1; c.beginPath(); c.moveTo(bx, dy); c.lineTo(bx + (2 * bw + gap) * dk, dy); [bx, bx + (2 * bw + gap) * dk].forEach(x => { c.moveTo(x, dy - 7); c.lineTo(x, dy + 7); }); c.stroke(); }
  }

  // Field plan: centre-pivot circles, the agritech in "agritech clients".
  for (let i = 0; i < n; i++) {
    const cx = m + (W - m * 2) * (i + .5) / n, k = part(.5 + i * .08, .8 + i * .05), a = T * (.32 + i * .05) + i * 1.9;
    if (k <= 0) continue;
    c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r, -1.57, -1.57 + k * 6.283); c.stroke();
    if (k < 1) continue;
    c.lineWidth = 1; c.setLineDash([3, 6]); [.72, .44].forEach(q => { c.beginPath(); c.arc(cx, cy, r * q, 0, 7); c.stroke(); }); c.setLineDash([]);
    c.fillStyle = 'rgba(255,214,102,.16)'; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a - .55, a); c.closePath(); c.fill();
    c.strokeStyle = '#FFD666'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
    c.fillStyle = '#FFD666'; c.beginPath(); c.arc(cx, cy, 4, 0, 7); c.fill();
    c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([u, v]) => { const px = cx + u * r * 1.02, py = cy + v * r * 1.02; c.beginPath(); c.moveTo(px - 6, py); c.lineTo(px + 6, py); c.moveTo(px, py - 6); c.lineTo(px, py + 6); c.stroke(); });
  }
  if (p.active) { c.strokeStyle = 'rgba(255,214,102,.75)'; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, 0); c.lineTo(p.x, H); c.moveTo(0, p.y); c.lineTo(W, p.y); c.stroke(); c.beginPath(); c.arc(p.x, p.y, 13, 0, 7); c.stroke(); }
}

registerScene(octoco);
