// Takealot: distributed, asynchronous pipelines. Work moves through stages at its own pace,
// queues fill and drain, and nothing waits for anything else. Pointer highlights a service; click or tap sends it a burst.
// Deliberately calm: only small marks move. No large area ever changes brightness, so nothing can flash.
import { registerScene, reduce, seeded } from '../world.js';

const INK = '#0A0A0A', RED = '#E6001F', LINE = '#DCDCD7';
const NODE_W = 30, NODE_H = 13;

function build(W, H) {
  const r = seeded(19), narrow = W < 760;
  const stages = narrow ? 4 : Math.max(5, Math.min(10, Math.round(W / 210)));
  const mx = narrow ? 26 : 56, my = narrow ? 26 : 40, slots = Math.max(4, Math.floor((H - my * 2) / (narrow ? 62 : 74)));
  const nodes = [], columns = [];
  for (let i = 0; i < stages; i++) {
    const x = mx + (W - mx * 2) * i / (stages - 1), col = [];
    for (let k = 0; k < slots; k++) if (r() < .62) {
      const n = { x: x + (r() - .5) * 14, y: my + (H - my * 2) * (k + .5) / slots, stage: i, in: [], out: [], q: 0, shown: 0, busy: r(), service: .08 + r() * .42, period: .35 + r() * 1.5, wait: r() * 2, isSource: i === 0 };
      col.push(n); nodes.push(n);
    }
    if (!col.length) { const n = { x, y: H / 2, stage: i, in: [], out: [], q: 0, shown: 0, busy: 0, service: .2, period: .8, wait: 0, isSource: i === 0 }; col.push(n); nodes.push(n); }
    columns.push(col);
  }
  const edges = [];
  const link = (a, b) => {
    if (a.out.some(e => e.b === b)) return;
    const elbow = a.x + NODE_W / 2 + (b.x - a.x - NODE_W) * (.3 + r() * .4);
    const pts = [[a.x + NODE_W / 2, a.y], [elbow, a.y], [elbow, b.y], [b.x - NODE_W / 2, b.y]];
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    const e = { a, b, pts, lens, len: lens.reduce((x, y) => x + y, 0), speed: 46 + r() * 74 };
    edges.push(e); a.out.push(e); b.in.push(e);
  };
  for (let i = 0; i < stages - 1; i++) {
    const cur = columns[i], next = columns[i + 1];
    for (const n of cur) {
      const near = [...next].sort((p, q) => Math.abs(p.y - n.y) - Math.abs(q.y - n.y));
      link(n, near[0]);
      if (near[1] && r() < .6) link(n, near[1]);   // fan-out
      if (near[2] && r() < .16) link(n, near[2]);
    }
    for (const m of next) if (!m.in.length) link(cur[Math.floor(r() * cur.length)], m); // every stage is fed
  }
  return { nodes, edges, r };
}

function step(s, dt) {
  const { nodes, r } = s.g;
  for (const n of nodes) {
    if (n.isSource) { n.wait -= dt; if (n.wait <= 0) { n.wait = n.period * (.6 + r() * .9); n.q++; } }
    n.busy -= dt;
    if (n.q > 0 && n.busy <= 0) {
      n.busy = n.service * (.6 + r() * .9);
      n.q--;
      // Sometimes one event goes to every subscriber, so traffic builds downstream as it does in pub/sub.
      const targets = r() < .4 ? n.out : n.out.length ? [n.out[Math.floor(r() * n.out.length)]] : [];
      const red = r() < .1;
      for (const e of targets) if (s.packets.length < 700) s.packets.push({ e, d: 0, red });
    }
    n.shown += (Math.min(1, n.q / 6) - n.shown) * Math.min(1, dt * 5);
  }
  for (let i = s.packets.length - 1; i >= 0; i--) {
    const p = s.packets[i];
    p.d += p.e.speed * dt;
    if (p.d >= p.e.len) { p.e.b.q++; s.packets[i] = s.packets[s.packets.length - 1]; s.packets.pop(); }
  }
}

function at(e, d) {
  let left = d;
  for (let i = 0; i < e.lens.length; i++) {
    if (left <= e.lens[i] || i === e.lens.length - 1) {
      const k = e.lens[i] ? left / e.lens[i] : 0, a = e.pts[i], b = e.pts[i + 1];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, b[0] !== a[0]];
    }
    left -= e.lens[i];
  }
  return [0, 0, true];
}

function route(c, e) { c.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length - 1; i++) c.arcTo(e.pts[i][0], e.pts[i][1], e.pts[i + 1][0], e.pts[i + 1][1], 7); c.lineTo(e.pts[3][0], e.pts[3][1]); }

function tags(c, W, H, T, dt, p, s) {
  if (!s.g || s.W !== W || s.H !== H) {
    s.W = W; s.H = H; s.g = build(W, H); s.packets = []; s.hl = 0; s.hot = null;
    for (let i = 0; i < 480; i++) step(s, .05); // Start with the system already running.
    const dpr = Math.min(devicePixelRatio || 1, 2);
    s.off = document.createElement('canvas'); s.off.width = W * dpr; s.off.height = H * dpr;
    const o = s.off.getContext('2d'); o.scale(dpr, dpr);
    o.fillStyle = '#fff'; o.fillRect(0, 0, W, H);
    o.strokeStyle = LINE; o.lineWidth = 1.5; o.lineJoin = 'round';
    o.beginPath(); s.g.edges.forEach(e => route(o, e)); o.stroke();
  }
  if (!reduce) step(s, Math.min(dt, .05));
  c.drawImage(s.off, 0, 0, W, H);

  // Highlight the service under the pointer and what it talks to.
  let near = null, best = 80;
  if (p.active) for (const n of s.g.nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < best) { best = d; near = n; } }
  if (near) s.hot = near;
  s.hl += ((near ? 1 : 0) - s.hl) * Math.min(1, dt * 7);
  if (s.hot && s.hl > .01) {
    c.globalAlpha = s.hl; c.strokeStyle = '#7A7A75'; c.lineWidth = 1.5; c.lineJoin = 'round';
    c.beginPath(); [...s.hot.in, ...s.hot.out].forEach(e => route(c, e)); c.stroke(); c.globalAlpha = 1;
  }

  // Work in flight.
  for (const q of s.packets) {
    const [x, y, flat] = at(q.e, q.d);
    c.fillStyle = q.red ? RED : INK;
    if (flat) c.fillRect(x - 4, y - 1.5, 8, 3); else c.fillRect(x - 1.5, y - 4, 3, 8);
  }

  // Services, with a bar showing how much is queued.
  c.lineWidth = 1.5;
  for (const n of s.g.nodes) {
    const x = n.x - NODE_W / 2, y = n.y - NODE_H / 2;
    c.fillStyle = '#fff'; c.strokeStyle = n === s.hot && s.hl > .5 ? RED : INK;
    c.beginPath(); c.roundRect(x, y, NODE_W, NODE_H, 3); c.fill(); c.stroke();
    if (n.shown > .02) { c.fillStyle = INK; c.fillRect(x + 3, y + 3, (NODE_W - 6) * n.shown, NODE_H - 6); }
  }
}

registerScene(tags, {
  click: (s, x, y) => {
    if (!s.g) return;
    let near = s.g.nodes[0], best = Infinity;
    for (const n of s.g.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < best) { best = d; near = n; } }
    near.q += 14;
  },
});
