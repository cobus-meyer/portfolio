// BrewPrks: a stamp card you can stamp.
import { registerScene, reduce, rand, seeded } from '../world.js';

function cup(c, r) {
  c.lineWidth = r * .09; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-r * .38, -r * .12); c.lineTo(-r * .3, r * .36); c.quadraticCurveTo(0, r * .5, r * .3, r * .36); c.lineTo(r * .38, -r * .12); c.closePath(); c.stroke();
  c.beginPath(); c.arc(r * .44, r * .08, r * .15, -1.3, 1.3); c.stroke();
  [-.16, .08].forEach(x => { c.beginPath(); c.moveTo(r * x, -r * .28); c.quadraticCurveTo(r * (x + .1), -r * .4, r * x, -r * .52); c.stroke(); });
}

function addStamp(s) {
  if (s.st.length >= 10) { s.st = []; return; }
  s.st.push({ t: s.T || 0, rot: rand(-.3, .3) });
}

function brew(c, W, H, T, dt, p, s) {
  if (!s.init) {
    s.init = 1; s.st = []; s.next = .4;
    const r = seeded(5); s.rings = Array.from({ length: 7 }, () => [r(), r(), 40 + r() * 70, r() * 6]);
  }
  c.fillStyle = '#EFDFC6'; c.fillRect(0, 0, W, H);
  s.rings.forEach(([a, b, r, o]) => {
    c.strokeStyle = 'rgba(118,68,28,.13)'; c.lineWidth = 5; c.beginPath(); c.arc(a * W, b * H, r, o, o + 5.2); c.stroke();
    c.strokeStyle = 'rgba(118,68,28,.07)'; c.lineWidth = 2; c.beginPath(); c.arc(a * W, b * H, r - 7, o + 1, o + 6); c.stroke();
  });
  // Beside the copy the card takes the room between the text and the dial; under it, the room held open by the CSS.
  const narrow = matchMedia('(max-width: 760px)').matches, left = (s.copy ? s.copy.r : W * .46) + 20, right = W - (W > 900 ? 148 : 16);
  const cw = narrow ? Math.min(W * .88, 420) : Math.min(620, W * .42, (H - 32) / .68, Math.max(160, right - left)), ch = cw * .62;
  const cx = narrow ? W / 2 : (left + right) / 2, cy = narrow ? H - ch / 2 - 18 : H * .5;
  if (!reduce) { s.next -= dt; if (s.next <= 0) { addStamp(s); s.next = s.st.length >= 10 ? 2.4 : 1.25; } } else if (!s.st.length) for (let i = 0; i < 6; i++) addStamp(s);
  c.save(); c.translate(cx, cy); c.rotate(-.05);
  c.shadowColor = 'rgba(58,29,14,.28)'; c.shadowBlur = 40; c.shadowOffsetY = 20;
  c.fillStyle = '#FFF9EE'; c.beginPath(); c.roundRect(-cw / 2, -ch / 2, cw, ch, 18); c.fill();
  c.shadowColor = 'transparent';
  c.save(); c.beginPath(); c.roundRect(-cw / 2, -ch / 2, cw, ch, 18); c.clip();
  c.fillStyle = '#3A1D0E'; c.fillRect(-cw / 2, -ch / 2, cw, ch * .22); c.restore();
  c.fillStyle = '#FFF9EE'; c.font = `800 ${ch * .11}px "Bricolage Grotesque", sans-serif`; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText('BrewPrks', -cw / 2 + cw * .05, -ch / 2 + ch * .11);
  const rad = cw * .072, gapX = cw * .178, top = -ch / 2 + ch * .42, gapY = ch * .34;
  for (let i = 0; i < 10; i++) {
    const x = -gapX * 2 + (i % 5) * gapX, y = top + Math.floor(i / 5) * gapY;
    c.strokeStyle = '#CDB897'; c.lineWidth = 1.5; c.setLineDash([3, 4]); c.beginPath(); c.arc(x, y, rad, 0, 7); c.stroke(); c.setLineDash([]);
  }
  s.st.forEach((st, i) => {
    const age = (T - st.t) * 7, k = age >= 1 || reduce ? 1 : 1.6 - .6 * age;
    const x = -gapX * 2 + (i % 5) * gapX, y = top + Math.floor(i / 5) * gapY;
    c.save(); c.translate(x, y); c.rotate(st.rot); c.scale(k, k); c.globalAlpha = reduce ? .92 : Math.min(1, .2 + age) * .92;
    c.strokeStyle = '#A5481C'; c.lineWidth = rad * .11; c.beginPath(); c.arc(0, 0, rad * .98, 0, 7); c.stroke();
    c.translate(-rad * .04, rad * .02); cup(c, rad); c.restore();
  });
  c.restore();
}

registerScene(brew, { click: s => { if (s.st) addStamp(s); } });
