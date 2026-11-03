// SAGE: the soil layers are real elements in the page, so the scene only adds grain to them, finer near the
// surface and coarser with depth, and runs the report. Grain stays off the labels and out of the text column, and
// is only redrawn when the layout changes. The report's steps run on the scene's clock and play once, then it holds
// the written state until a mouse moves onto it or it comes back into view. It only hides anything once this file has
// added .live, so without the script the report stays written.
import { registerScene, reduce, seeded } from '../world.js';

const STEPS = [.1, .6, 1.1, 1.4, 1.7, 2.2, 2.6];
const CLEAR = 10; // Px of grain-free space kept around text.
const report = document.getElementById('report');
const layers = [...document.querySelectorAll('.built li')];
let again = false;

if (report && !reduce) {
  report.classList.add('live');
  let left = false;
  new IntersectionObserver(es => {
    if (!es[es.length - 1].isIntersecting) left = true;
    else if (left) { left = false; again = true; }
  }).observe(report);
  report.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') again = true; });
}

function runReport(s, dt) {
  if (!report) return;
  if (reduce) { if (!s.written) { s.written = 1; STEPS.forEach((_, i) => report.classList.add('s' + (i + 1))); } return; }
  s.rt = s.rt || 0; s.step = s.step || 0;
  if (again) { again = false; if (s.step === STEPS.length) { s.rt = 0; s.step = 0; report.className = 'report live'; } }
  if (s.step === STEPS.length) return;
  s.rt += dt;
  while (s.step < STEPS.length && s.rt >= STEPS[s.step]) report.classList.add('s' + (++s.step));
}

// A deep link lands before the fonts settle the hero's height, so land it again as that changes, until the reader moves.
if (location.hash === '#article' && performance.getEntriesByType('navigation')[0]?.type === 'navigate') {
  const land = new ResizeObserver(() => document.getElementById('article').scrollIntoView({ behavior: 'instant' }));
  const stop = () => land.disconnect();
  land.observe(document.getElementById('world'));
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(t => addEventListener(t, stop, { once: true, passive: true }));
  setTimeout(stop, 4000);
}

// One layer's rect and the areas its grain must stay out of, in canvas coordinates.
function geometry(li, o) {
  const b = li.getBoundingClientRect(), label = li.querySelector('strong').getBoundingClientRect(), text = li.querySelector('span').getBoundingClientRect();
  return { y: b.top - o.top, h: b.height, tl: text.left - o.left - CLEAR, tr: text.right - o.left + CLEAR, ll: label.left - o.left - CLEAR, lr: label.right - o.left + CLEAR, lt: label.top - o.top - CLEAR, lb: label.bottom - o.top + CLEAR };
}

function sage(c, W, H, T, dt, p, s) {
  runReport(s, dt);
  // Resizing the canvas clears it, so its size is in the key.
  const o = c.canvas.getBoundingClientRect();
  const rows = layers.map(l => geometry(l, o));
  const key = JSON.stringify([c.canvas.width, c.canvas.height, rows]);
  if (key === s.key) return;
  s.key = key;
  c.clearRect(0, 0, W, H);
  const r = seeded(11);
  c.fillStyle = 'rgba(232,226,200,.09)';
  rows.forEach((row, i) => {
    const size = .7 + i * .42, count = Math.round(W / (18 + i * 6));
    for (let n = 0; n < count; n++) {
      const rx = size * (.5 + r() * 1.4), x = r() * W, y = row.y + r() * row.h, tilt = r() * 6, pad = rx * 1.4;
      if (x + pad > row.tl && x - pad < row.tr) continue;
      if (x + pad > row.ll && x - pad < row.lr && y + pad > row.lt && y - pad < row.lb) continue;
      if (y - pad < row.y || y + pad > row.y + row.h) continue;
      c.beginPath(); c.ellipse(x, y, rx * 1.4, rx, tilt, 0, 7); c.fill();
    }
  });
}

registerScene(sage);
