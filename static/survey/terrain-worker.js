// Generates the map's height field and contours off the main thread.
// Seeded noise, so coastlines never change between visits.
// relief: false skips the elevation tiles, for devices that run the map flat.
importScripts('/vendor/d3-array.min.js', '/vendor/d3-contour.min.js');

const G = 5, SEA = .3;
const LAND = [.38, .46, .54, .62, .7, .78, .86, .94];
const SUB = [.12, .18, .24];

const perm = (() => { let s = 1234; const a = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a.concat(a); })();
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = fade(x - xi), v = fade(y - yi), g = (a, b) => perm[(perm[a & 255] + b) & 255] / 255;
  const l1 = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * u, l2 = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * u; return l1 + (l2 - l1) * v; };
const fbm = (x, y) => { let a = .5, f = 1, s = 0, n = 0; for (let i = 0; i < 4; i++) { s += a * vn(x * f, y * f); n += a; a *= .5; f *= 2.03; } return s / n; };

self.onmessage = async ({ data: { W, H, K, ELEV, isles, relief } }) => {
  const nx = Math.ceil(W / G) + 1, ny = Math.ceil(H / G) + 1;
  const hf = new Float32Array(nx * ny), who = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i * G, y = j * G;
    const wx = (fbm(x * .0042 + 11, y * .0042) - .5) * 190, wy = (fbm(x * .0042, y * .0042 + 37) - .5) * 150;
    let best = 0, bi = 0;
    for (let k = 0; k < isles.length; k++) { const s = isles[k], dx = (x + wx - s.cx) / s.rx, dy = (y + wy - s.cy) / s.ry, e = Math.exp(-(dx * dx + dy * dy) * 1.2); if (e > best) { best = e; bi = k; } }
    const detail = .84 + .34 * fbm(x * .011 + 5, y * .011 + 9);
    const edge = Math.min(1, Math.min(x, W - x, y, H - y) / 170);
    const floor = (.05 + .16 * fbm(x * .0033 + 3, y * .0033 + 2)) * edge * edge * (3 - 2 * edge);
    hf[j * nx + i] = Math.max(best * detail, floor); who[j * nx + i] = bi;
  }

  const lines = [], hits = [];
  const ring = (r, ox, oy) => r.map(([a, b]) => [(a - .5 + ox) * G, (b - .5 + oy) * G]);

  // Land: contour each place on its own cropped grid, so every polygon knows which place it is.
  isles.forEach((s, k) => {
    const m = 40, x0 = Math.max(0, Math.floor((s.cx - s.rx * 1.7 - 120) / G) - m), x1 = Math.min(nx - 1, Math.ceil((s.cx + s.rx * 1.7 + 120) / G) + m);
    const y0 = Math.max(0, Math.floor((s.cy - s.ry * 1.7 - 120) / G) - m), y1 = Math.min(ny - 1, Math.ceil((s.cy + s.ry * 1.7 + 120) / G) + m);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, grid = new Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const q = (j + y0) * nx + i + x0; grid[j * w + i] = who[q] === k ? hf[q] : 0; }
    d3.contours().size([w, h]).smooth(true).thresholds([SEA, ...LAND])(grid).forEach(c => {
      const polys = c.coordinates.map(p => p.map(r => ring(r, x0, y0)));
      if (!polys.length) return;
      const kind = c.value === SEA ? 'coast' : (LAND.indexOf(c.value) % 3 === 2 ? 'index' : 'minor');
      lines.push({ type: 'Feature', properties: { kind, level: c.value }, geometry: { type: 'MultiLineString', coordinates: polys.flat() } });
      if (c.value === SEA) hits.push({ type: 'Feature', id: k, properties: { i: k }, geometry: { type: 'MultiPolygon', coordinates: polys } });
    });
  });
  // Sea floor.
  d3.contours().size([nx, ny]).smooth(true).thresholds(SUB)(Array.from(hf)).forEach(c => {
    const coords = c.coordinates.flatMap(p => p.map(r => ring(r, 0, 0)));
    if (coords.length) lines.push({ type: 'Feature', properties: { kind: 'sub', level: c.value }, geometry: { type: 'MultiLineString', coordinates: coords } });
  });

  const tiles = {}, transfer = [];
  if (relief !== false) {
    // Elevation tiles, all generated here up front so flights never stall on tile work.
    const heightAt = (wx, wy) => {
      const fx = wx / G, fy = wy / G, i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return 0;
      const u = fx - i, v = fy - j, a = hf[j * nx + i], b = hf[j * nx + i + 1], c = hf[(j + 1) * nx + i], d = hf[(j + 1) * nx + i + 1];
      const h = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      return h <= SEA ? 0 : (h - SEA) * ELEV;
    };
    const S = 256;
    const tileX = (lng, n) => Math.floor((lng + 180) / 360 * n), tileY = (lat, n) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
    const west = -W / 2 * K, east = W / 2 * K, north = H / 2 * K, south = -H / 2 * K;
    for (let z = 5; z <= 9; z++) {
      const n = 2 ** z;
      for (let x = tileX(west, n); x <= tileX(east, n); x++) for (let y = tileY(north, n); y <= tileY(south, n); y++) {
        const cv = new OffscreenCanvas(S, S), c = cv.getContext('2d'), im = c.createImageData(S, S);
        for (let j = 0; j < S; j++) {
          const my = (y + (j + .5) / S) / n, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI, wy = -lat / K + H / 2;
          for (let i = 0; i < S; i++) {
            const lng = (x + (i + .5) / S) / n * 360 - 180, wx = lng / K + W / 2, v = heightAt(wx, wy) + 32768, q = (j * S + i) * 4;
            im.data[q] = Math.floor(v / 256); im.data[q + 1] = Math.floor(v % 256); im.data[q + 2] = Math.floor((v % 1) * 256); im.data[q + 3] = 255;
          }
        }
        c.putImageData(im, 0, 0);
        const buf = await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer();
        tiles[`${z}/${x}/${y}`] = buf; transfer.push(buf);
      }
    }
  }
  self.postMessage({ nx, ny, G, SEA, hf, who, lines, hits, tiles }, [hf.buffer, who.buffer, ...transfer]);
};
