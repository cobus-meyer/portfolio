// Site Pulse: a made-up plant, drawn as a floor plan. Machines cycle through permit states on their own.
// Pointer highlights a machine; click or tap locks it out or clears it.
// Deliberately calm: states ease between small marks, so nothing can flash.
import { registerScene, reduce, seeded } from '../world.js';

const WALL = '#AAA698', LINE = '#D8D5CA', INK = '#171916', MUTED = '#62695F';
const STATES = {
  clear: { fill: '#FFFFFF', edge: '#AAA698' },
  pending: { fill: '#FFFFFF', edge: '#B7791F' },
  locked: { fill: '#F3DEDB', edge: '#B23A32' },
  active: { fill: '#2F7D4A', edge: '#2F7D4A' },
};
const NEXT = { clear: 'pending', pending: 'locked', locked: 'active', active: 'clear' };
const HOLD = { clear: [5, 13], pending: [2, 4], locked: [2, 4], active: [5, 10] };
const LEGEND = [['pending', 'Pending'], ['locked', 'Locked out'], ['active', 'Work active'], ['clear', 'Clear']];

function build(W, H) {
  const r = seeded(41), narrow = W < 760;
  const cols = narrow ? 2 : W < 1200 ? 3 : 4, rows = narrow ? 3 : 2;
  const mx = narrow ? 14 : 36, my = narrow ? 14 : 32, gap = 0;
  const cw = (W - mx * 2) / cols, ch = (H - my * 2) / rows;
  const rooms = [], machines = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = mx + i * cw, y = my + j * ch;
    rooms.push({ x, y, w: cw - gap, h: ch - gap, door: r() });
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const slot = (cw - 44) / n, w = Math.min((narrow ? 24 : 34) + r() * 26, slot - 16), h = (narrow ? 18 : 24) + r() * 16;
      machines.push({ x: x + 22 + k * slot + r() * (slot - w - 8), y: y + 26 + r() * Math.max(1, ch - h - 52), w, h, state: 'clear', mix: 0, wait: r() * 12, held: false });
    }
  }
  const pick = ['pending', 'locked', 'active', 'clear', 'active', 'clear', 'clear'];
  machines.forEach((m, i) => { m.state = pick[i % pick.length]; });
  return { rooms, machines, r };
}

function lock(c, x, y, colour) {
  c.strokeStyle = colour; c.fillStyle = colour; c.lineWidth = 1.5;
  c.beginPath(); c.arc(x, y - 2.5, 3, Math.PI, 0); c.stroke();
  c.fillRect(x - 4.5, y - 2.5, 9, 7);
}

function plant(c, W, H, T, dt, p, s) {
  if (!s.g || s.W !== W || s.H !== H) {
    s.W = W; s.H = H; s.g = build(W, H);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    s.off = document.createElement('canvas'); s.off.width = W * dpr; s.off.height = H * dpr;
    const o = s.off.getContext('2d'); o.scale(dpr, dpr);
    o.fillStyle = '#F6F5EF'; o.fillRect(0, 0, W, H);
    o.strokeStyle = LINE; o.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { o.beginPath(); o.moveTo(x + .5, 0); o.lineTo(x + .5, H); o.stroke(); }
    for (let y = 0; y < H; y += 40) { o.beginPath(); o.moveTo(0, y + .5); o.lineTo(W, y + .5); o.stroke(); }
    o.strokeStyle = WALL; o.lineWidth = 3;
    for (const q of s.g.rooms) {
      // Each wall stops short for a door.
      const d = 34, at = q.x + 20 + q.door * Math.max(1, q.w - 40 - d);
      o.beginPath(); o.moveTo(at, q.y); o.lineTo(q.x, q.y); o.lineTo(q.x, q.y + q.h); o.lineTo(q.x + q.w, q.y + q.h); o.lineTo(q.x + q.w, q.y); o.lineTo(at + d, q.y); o.stroke();
    }
  }
  c.drawImage(s.off, 0, 0, W, H);

  let near = null;
  if (p.active) for (const m of s.g.machines) if (p.x > m.x - 8 && p.x < m.x + m.w + 8 && p.y > m.y - 8 && p.y < m.y + m.h + 8) near = m;

  for (const m of s.g.machines) {
    if (!reduce && !m.held) {
      m.wait -= dt;
      if (m.wait <= 0) { m.state = NEXT[m.state]; m.mix = 0; const [a, b] = HOLD[m.state]; m.wait = a + s.g.r() * (b - a); }
    }
    m.mix = reduce ? 1 : Math.min(1, m.mix + dt * 2.5);
    const st = STATES[m.state];
    c.globalAlpha = 1; c.fillStyle = '#FFFFFF'; c.fillRect(m.x, m.y, m.w, m.h);
    c.globalAlpha = m.mix; c.fillStyle = st.fill; c.fillRect(m.x, m.y, m.w, m.h);
    c.globalAlpha = 1; c.strokeStyle = m === near ? INK : st.edge; c.lineWidth = m === near ? 2 : 1.5;
    c.strokeRect(m.x + .5, m.y + .5, m.w - 1, m.h - 1);
    if (m.state === 'locked') { c.globalAlpha = m.mix; lock(c, m.x + m.w / 2, m.y + m.h / 2, st.edge); c.globalAlpha = 1; }
    if (m.state === 'active') {
      // One person working: a small dot walks around the machine.
      const k = (T * .22 + m.x * .01) % 1, per = 2 * (m.w + m.h), d = k * per, off = 7;
      const [dx, dy] = d < m.w ? [d, -off] : d < m.w + m.h ? [m.w + off, d - m.w] : d < 2 * m.w + m.h ? [2 * m.w + m.h - d, m.h + off] : [-off, per - d];
      c.fillStyle = INK; c.beginPath(); c.arc(m.x + dx, m.y + dy, 2.5, 0, 7); c.fill();
    }
  }

  // Legend, top right, so the words are on the plan and not only in colour.
  c.font = '11px "JetBrains Mono", monospace'; c.textBaseline = 'middle';
  const narrow = W < 760, x = W - (narrow ? 118 : 138), y = narrow ? 24 : 44;
  c.fillStyle = '#F6F5EF'; c.fillRect(x - 10, y - 12, narrow ? 118 : 124, LEGEND.length * 18 + 8);
  LEGEND.forEach(([k, label], i) => {
    const st = STATES[k], ly = y + i * 18;
    c.fillStyle = st.fill; c.strokeStyle = st.edge; c.lineWidth = 1.5;
    c.fillRect(x, ly - 5, 10, 10); c.strokeRect(x + .5, ly - 4.5, 9, 9);
    c.fillStyle = MUTED; c.fillText(label, x + 17, ly + 1);
  });
}

registerScene(plant, {
  click: (s, x, y) => {
    if (!s.g) return;
    let hit = null, best = 60;
    for (const m of s.g.machines) { const d = Math.hypot(m.x + m.w / 2 - x, m.y + m.h / 2 - y); if (d < best) { best = d; hit = m; } }
    if (!hit) return;
    hit.held = hit.state !== 'locked';
    hit.state = hit.held ? 'locked' : 'clear';
    hit.mix = 0; hit.wait = 6;
  },
});
