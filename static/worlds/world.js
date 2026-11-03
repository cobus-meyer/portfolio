/*
 * Detail pages: runs the scene, moves between places, and lifts the incoming wipe.
 * The HTML comes from build.py (render_place). Everything readable is already in it, so this file
 * only adds motion. /worlds/worlds.css scopes anything hidden before animation under .js, and a CSS
 * failsafe shows it anyway if this module never runs.
 *
 * A scene module calls registerScene(draw, { click }).
 *   draw(c, W, H, T, dt, p, s)   c 2D context in CSS pixels, W and H the hero's size, T seconds,
 *                                dt seconds since the last frame, p { x, y, active } the pointer,
 *                                s the scene's own state. World.js also keeps s.T (the latest T) and
 *                                s.copy { x, y, w, h, r, b } (the copy block, in canvas coordinates)
 *                                so a scene can draw around the text.
 *   click(s, x, y)               A click or tap on the hero, outside any link.
 * Under reduced motion draw is called once per change, not every frame.
 *
 * Moving to another place: sessionStorage['survey-wipe'] = target id, wipe in the target's colour,
 * navigate. The head script in the next page sees the id and sets .arriving, so #wipe covers it.
 * Going back to the map: /#<id>. The map owns sessionStorage['survey-camera'].
 */
export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const rand = (a = 1, b) => (b == null ? Math.random() * a : a + Math.random() * (b - a));
export const seeded = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

const WIPE_KEY = 'survey-wipe';
const root = document.documentElement;
const $ = s => document.querySelector(s);
const data = JSON.parse($('#places').textContent);
const places = data.places;
const here = document.body.dataset.id;
const place = id => places.find(p => p.id === id);
const store = (fn, fallback = null) => { try { return fn(sessionStorage); } catch (e) { return fallback; } };

const section = $('#world');
const copy = section.querySelector('.copy');
const canvas = $('#world-canvas');
const ctx = canvas.getContext('2d');
const wipe = $('#wipe');
const gsap = window.gsap;

/* ---------- Scene loop ---------- */
const state = {};
const ptr = { x: 0, y: 0, active: false };
let scene = null, W = 0, H = 0, dpr = 1, running = false, onScreen = true, frames = 0;

// gsap.ticker is the shared loop. If the library failed to load the scene still runs on rAF.
const ticker = gsap ? gsap.ticker : (() => {
  let fn = null, last = 0;
  const step = now => { if (!fn) return; fn(now / 1000, Math.min(now - last, 100)); last = now; requestAnimationFrame(step); };
  return { add(f) { fn = f; last = performance.now(); requestAnimationFrame(step); }, remove() { fn = null; } };
})();

function paint(T, dt) {
  if (!scene || !W || !H) return;
  state.T = T;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.draw(ctx, W, H, T, dt, ptr, state);
  frames++;
}
const paintStill = () => paint(performance.now() / 1000, 0);

function tick(time, deltaMs) { paint(time, Math.min(.05, deltaMs / 1000)); }

function syncLoop() {
  const want = !!scene && !reduce && onScreen && document.visibilityState !== 'hidden';
  if (want === running) return;
  running = want;
  if (want) ticker.add(tick); else ticker.remove(tick);
}

function measure() {
  const b = section.getBoundingClientRect();
  const w = Math.round(b.width), h = Math.round(b.height), d = Math.min(devicePixelRatio || 1, 2);
  // offset* ignores the reveal's transform, so scenes get the block's resting place.
  state.copy = { x: copy.offsetLeft, y: copy.offsetTop, w: copy.offsetWidth, h: copy.offsetHeight, r: copy.offsetLeft + copy.offsetWidth, b: copy.offsetTop + copy.offsetHeight };
  if (w === W && h === H && d === dpr) { if (reduce) paintStill(); return; }
  W = w; H = h; dpr = d;
  canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
  if (gsap && running) paint(gsap.ticker.time, 0); else paintStill();
}

export function registerScene(draw, opts = {}) {
  scene = { draw, click: opts.click };
  measure();
  if (reduce) paintStill();
  syncLoop();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
}

new ResizeObserver(measure).observe(section);
new ResizeObserver(measure).observe(copy);
new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; syncLoop(); }).observe(section);
document.addEventListener('visibilitychange', syncLoop);

/* ---------- Pointer and tap ---------- */
const local = e => { const b = section.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
let release = 0;
section.addEventListener('pointermove', e => { [ptr.x, ptr.y] = local(e); ptr.active = true; });
section.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') ptr.active = false; });
section.addEventListener('pointerdown', e => { [ptr.x, ptr.y] = local(e); ptr.active = true; clearTimeout(release); });
const letGo = e => { if (e.pointerType !== 'mouse') { clearTimeout(release); release = setTimeout(() => { ptr.active = false; }, 1200); } };
section.addEventListener('pointerup', letGo);
section.addEventListener('pointercancel', letGo);
section.addEventListener('click', e => {
  if (!scene || !scene.click || e.target.closest('a')) return;
  if (String(window.getSelection && getSelection())) return; // Selecting text is not a tap.
  const [x, y] = local(e);
  scene.click(state, x, y);
  if (reduce) paintStill();
});

/* ---------- Wipes ---------- */
let leaving = false, wipeTween = null, leaveGuard = 0;

function clearWipe() {
  if (wipeTween) wipeTween.kill();
  wipeTween = null; leaving = false;
  clearTimeout(leaveGuard);
  wipe.removeAttribute('style');
  root.classList.remove('arriving');
}

function arrive() {
  const stored = store(s => s.getItem(WIPE_KEY));
  store(s => s.removeItem(WIPE_KEY));
  // The contract is the target's id, which the head script has already acted on. A colour is also
  // accepted, so a page that stores one still gets its cover, just a little later.
  const colour = stored && /^(#|rgb|hsl)/.test(stored) ? stored : null;
  if (!root.classList.contains('arriving') && !colour) return;
  if (reduce || !gsap) { clearWipe(); return; }
  root.classList.add('arriving');
  wipe.style.background = colour || place(here).bg;
  wipeTween = gsap.fromTo(wipe, { clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)', duration: .32, delay: .05, ease: 'power2.inOut', onComplete: clearWipe });
}

function go(id, url) {
  if (leaving) return;
  const target = place(id);
  if (reduce || !gsap || !target) { location.href = url; return; }
  leaving = true;
  store(s => s.setItem(WIPE_KEY, id));
  Object.assign(wipe.style, { position: 'fixed', inset: '0', zIndex: '100', background: target.bg, clipPath: 'inset(100% 0 0 0)' });
  wipeTween = gsap.to(wipe, { clipPath: 'inset(0 0 0 0)', duration: .26, ease: 'power2.inOut', onComplete: () => { location.href = url; } });
  // If the navigation never happens the page must not stay covered.
  leaveGuard = setTimeout(() => { store(s => s.removeItem(WIPE_KEY)); clearWipe(); }, 5000);
}

/* ---------- Navigation ---------- */
const plainClick = e => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
const others = places.filter(p => p.id !== here);
const randomOther = () => others[Math.floor(Math.random() * others.length)];

document.addEventListener('click', e => {
  const a = e.target.closest('#world-nav a[data-id], #dial a[data-id]');
  if (!a || !plainClick(e)) return;
  if (a.id === 'nav-map') return; // A plain link. The map restores its own camera.
  if (a.getAttribute('aria-current') === 'page') { e.preventDefault(); return; }
  e.preventDefault();
  if (a.id === 'nav-jump') { const t = randomOther(); go(t.id, t.url); }
  else go(a.dataset.id, a.getAttribute('href'));
});

// Keys for moving on, when focus is not on something that wants them.
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  if (e.target.closest && e.target.closest('a, input, textarea, select, button, [contenteditable]') && e.code !== 'Escape') return;
  if (e.code === 'ArrowLeft') $('#nav-prev').click();
  else if (e.code === 'ArrowRight') $('#nav-next').click();
  else if (e.code === 'Escape') $('#nav-map').click();
  // Where the page scrolls, Space keeps its normal job.
  else if (e.code === 'Space' && root.scrollHeight <= innerHeight) { e.preventDefault(); $('#nav-jump').click(); }
});

// Prefetch a place when someone shows interest in it.
const fetched = new Set([location.pathname]);
function prefetch(a) {
  const url = a.getAttribute('href');
  if (!url || fetched.has(url) || url.includes('#')) return;
  fetched.add(url);
  const link = document.createElement('link');
  link.rel = 'prefetch'; link.href = url;
  document.head.appendChild(link);
}
['pointerover', 'focusin', 'touchstart'].forEach(type => document.addEventListener(type, e => {
  const a = e.target.closest && e.target.closest('#world-nav a, #dial a');
  if (a) prefetch(a);
}, { passive: true }));

/* ---------- Lifecycle ---------- */
window.addEventListener('pagehide', () => { running = false; ticker.remove(tick); });
window.addEventListener('pageshow', e => {
  // Back from another page via bfcache: nothing may still be covering this one.
  if (e.persisted) { store(s => s.removeItem(WIPE_KEY)); clearWipe(); }
  syncLoop();
});

arrive();
section.classList.add('on');

if (new URLSearchParams(location.search).has('debug')) {
  window.__world = { get frames() { return frames; }, get running() { return running; }, state };
}
