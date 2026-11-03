/*
 * The Survey: the map on the home page. The MapLibre settings for dragPan, wheel and flights are
 * tuned, so change them only with evidence.
 *
 * The HTML is built by build.py (render_home) and reads fully without this file. Everything map
 * specific is hidden until the inline head script adds .map-on, and any failure below calls
 * window.surveyFallback(), which drops back to the résumé.
 *
 * Place data comes from the #places JSON blob, sorted by start. A new content file adds an island,
 * a chip and a label here with no code change.
 *
 * Contracts with static/worlds, in sessionStorage:
 *   survey-wipe    place id; the detail page starts covered in place.bg and reveals.
 *   survey-camera  { center, zoom, pitch, bearing, id, padding, flat }; read once on return.
 */
window.__surveyUp = true;

const root = document.documentElement;
const $ = s => document.querySelector(s);
const DEBUG = new URLSearchParams(location.search).has('debug');

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};

let onFail = () => {};
let failed = false;
function fail(why) {
  if (failed) return;
  failed = true;
  console.warn('Map unavailable, showing the list instead:', why);
  try { onFail(); } catch {}
  window.surveyFallback(); // Also points the toggle back at the map, for another go.
}

// List view sits over the map in place. The URL stays honest, so reload and share behave.
function urlWith(list) {
  const q = new URLSearchParams(location.search);
  if (list) q.set('list', ''); else q.delete('list');
  const s = q.toString().replace(/=(&|$)/g, '$1');
  return location.pathname + (s ? '?' + s : '') + location.hash;
}
// The map cannot undo a page zoom (survey.css stops one starting there), so leaving a zoomed List
// view resets it. A browser that ignores the viewport limit gets a fresh load of the map instead.
function resetPageZoom() {
  const v = window.visualViewport, meta = $('meta[name="viewport"]');
  if (!v || !meta || v.scale <= 1.01) return;
  const content = meta.content, t0 = performance.now();
  meta.content = content + ', maximum-scale=1';
  const check = () => {
    if (v.scale > 1.01 && performance.now() - t0 < 600) { requestAnimationFrame(check); return; }
    meta.content = content;
    if (v.scale > 1.01 && !root.classList.contains('list-open')) location.reload();
  };
  requestAnimationFrame(check);
}
function setList(open) {
  root.classList.toggle('list-open', open);
  if (!open) resetPageZoom();
  const t = $('#view-toggle');
  t.textContent = open ? 'Map view' : 'List view';
  t.setAttribute('href', open ? '/' : '/?list');
  $('#survey').inert = open;
}
function wireListToggle(selectedId) {
  $('#view-toggle').addEventListener('click', e => {
    if (!root.classList.contains('map-on') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const open = !root.classList.contains('list-open');
    history.pushState(null, '', urlWith(open));
    setList(open);
    const here = open && selectedId() && document.getElementById(selectedId());
    if (here) here.scrollIntoView({ block: 'start' }); else if (open) $('#resume').scrollTop = 0;
  });
  addEventListener('popstate', () => { if (root.classList.contains('map-on')) setList(new URLSearchParams(location.search).has('list')); });
}

if (root.classList.contains('map-on')) {
  boot().catch(e => fail(e));
}

async function boot() {
  const DATA = JSON.parse($('#places').textContent);
  const { W, H, K } = DATA.world, { from: YEAR0, to: YEAR1 } = DATA.span;
  const places = DATA.places;
  const X = t => 220 + (t - YEAR0) / (YEAR1 - YEAR0) * 2360;
  const ll = (x, y) => [(x - W / 2) * K, -(y - H / 2) * K];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowMemory = navigator.deviceMemory !== undefined && navigator.deviceMemory < 4;
  const FLAT = new URLSearchParams(location.search).has('flat') || lowMemory;

  const phone = () => innerWidth <= 760 || innerHeight <= 500; // Also phones held sideways.
  const short = () => innerHeight <= 500;
  const portraitPhone = () => phone() && !short();

  let sel = -1, ready = false;
  wireListToggle(() => (sel < 0 ? null : places[sel].id));

  if (typeof gsap === 'undefined') throw new Error('gsap did not load');

  // Give up on a map that never appears. Only count time the tab is visible, since a hidden tab
  // does not draw frames and would otherwise look stuck.
  let up = false, waited = 0;
  const watchdog = setInterval(() => { if (up) clearInterval(watchdog); else if (!document.hidden && ++waited > 30) { clearInterval(watchdog); fail('timed out'); } }, 1000);

  store.del('survey-wipe');
  const note = $('#note'), wipe = $('#wipe'), log = $('#log'), toggle = $('#view-toggle');
  const chipFor = i => log.querySelector(`button[data-id="${places[i].id}"]`);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Theme.
  const isDark = () => { const f = root.dataset.theme; return f ? f === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  const THEME = {
    light: { deep: '#AECFD6', shallow: '#D3E6E5', land: '#F4EFDF', k0: .42, k1: .56, minor: 'rgba(122,82,46,.42)', index: 'rgba(110,70,36,.72)', coast: '#3E2A18', sub: 'rgba(58,120,140,.22)', grat: 'rgba(60,40,20,.11)', route: '#CC3A1B', halo: '#F3EEDF', hsShadow: '#7A6A58', hsLight: '#FFFBF0', hsAccent: '#8A7560', hover: '#FFFFFF' },
    dark:  { deep: '#0A1519', shallow: '#112932', land: '#1A2726', k0: .34, k1: .42, minor: 'rgba(222,196,150,.34)', index: 'rgba(232,210,170,.6)', coast: '#EAD9B8', sub: 'rgba(120,186,206,.2)', grat: 'rgba(200,190,160,.14)', route: '#FF7350', halo: '#0C181D', hsShadow: '#000000', hsLight: '#C9D8C8', hsAccent: '#000000', hover: '#FFFFFF' },
  };
  const th = () => THEME[isDark() ? 'dark' : 'light'];
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

  // DOM that does not depend on the engine.
  $('#legend').open = !phone();
  const tiltBtn = $('#tilt');
  tiltBtn.setAttribute('aria-label', 'Tilt');
  tiltBtn.setAttribute('aria-keyshortcuts', 't');
  tiltBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 15l5-9h6l5 9zM7 6l-1 9M13 6l1 9M4.5 10.5h11"/></svg>Tilt <span class="state" aria-hidden="true">Flat</span>';
  const tiltState = tiltBtn.querySelector('.state');
  const about = document.createElement('button');
  about.type = 'button'; about.id = 'about'; about.textContent = 'About'; about.setAttribute('aria-expanded', 'false');
  $('#name').after(about);

  // Phone chrome. Measured here and cached, so nothing reads layout on every camera frame.
  let topEdge = 0;
  function measure() {
    root.style.setProperty('--title-bottom', $('#title').getBoundingClientRect().bottom + 'px');
    topEdge = phone() ? $('#controls').getBoundingClientRect().bottom : 0;
  }
  measure();
  new ResizeObserver(() => { measure(); if (ready && !failed) syncUi(); }).observe($('#title'));

  // First touch: the hint fades, the title shrinks to the name and the controls. The shrink waits
  // until after the gesture, so the controls do not move out from under the finger.
  let hintSeen = false;
  try { hintSeen = !!localStorage.getItem('survey-hint-seen'); } catch {}
  if (hintSeen) root.classList.add('hint-off');
  function collapseTitle() { document.body.classList.add('touched'); removeEventListener('pointerup', onFirstUp, true); measure(); }
  function onFirstDown() {
    root.classList.add('hint-off');
    try { localStorage.setItem('survey-hint-seen', '1'); } catch {}
  }
  function onFirstUp(e) { if (!e.target.closest('#title')) setTimeout(collapseTitle, 320); }
  addEventListener('pointerdown', onFirstDown, { capture: true, once: true });
  addEventListener('pointerup', onFirstUp, true);
  // Back from a detail page, or arriving on one place: start collapsed, so the title does not shrink in view.
  const returning = store.get('survey-camera');
  if (returning || places.some(p => p.id === location.hash.slice(1))) collapseTitle();
  try { if (JSON.parse(returning)?.pitch > 4) { tiltBtn.setAttribute('aria-pressed', 'true'); tiltState.textContent = '3D'; } } catch {}
  about.addEventListener('click', () => {
    const open = $('#title').classList.toggle('open');
    about.setAttribute('aria-expanded', open);
    about.textContent = open ? 'Less' : 'About';
    measure();
  });

  let maplibregl;
  try { maplibregl = await import('/vendor/maplibre-gl.mjs'); }
  catch (e) { throw new Error('MapLibre did not load: ' + e.message); }

  // World bounds: generous, so the camera is never stuck, even at the opening zoom.
  const SLACK_X = 1100, SLACK_Y = 800;
  const maxBounds = [ll(-SLACK_X, H + SLACK_Y), ll(W + SLACK_X, -SLACK_Y)];
  const LAND_BOX = [ll(90, 1640), ll(2710, 60)];

  const map = new maplibregl.Map({
    container: 'map',
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': th().deep } }] },
    center: [0, 0], zoom: 8.3,
    renderWorldCopies: false, attributionControl: false, keyboard: false,
    dragRotate: true, pitchWithRotate: true, touchPitch: true, // Right-drag and ctrl-drag; two-finger vertical drag.
    maxPitch: 65, maxBounds, fadeDuration: 0,
    pixelRatio: Math.min(devicePixelRatio || 1, 2),
    canvasContextAttributes: { antialias: true },
  });
  onFail = () => { clearInterval(watchdog); map.remove(); };
  map.on('webglcontextlost', () => fail('WebGL context lost'));
  map.on('error', e => { if (!up && /webgl/i.test(e.error?.message || '')) fail(e.error.message); });
  map.touchZoomRotate.disableRotation(); // Pinching never spins the map.
  map.scrollZoom.setWheelZoomRate(1 / 140);
  map.scrollZoom.setZoomRate(1 / 70);
  map.dragPan.enable({ linearity: .25, maxSpeed: 1800, deceleration: 1900 });
  map.getCanvas().tabIndex = -1; // Keys work from anywhere, so the canvas is not a stop of its own.

  // Opening camera.
  const recentX = places.slice(-6).map(p => p.cx);
  const RECENT = { west: Math.min(...recentX), east: Math.max(...recentX), edgeW: 50, edgeE: 42 }; // Edges: room for half a label at each side.
  const zoomFor = pxPerUnit => Math.log2(pxPerUnit * 360 / (512 * K));
  // How much taller the title is now than when collapsed. 2: its border.
  const titleExtra = () => $('#title').getBoundingClientRect().height - $('#name').getBoundingClientRect().height - 2;
  const overviewPadding = () => {
    if (short()) return { top: topEdge + 8, bottom: 62, left: 24, right: 24 };
    if (phone()) return { top: topEdge + 30, bottom: 66, left: 0, right: 0 };
    return { top: 30, bottom: 66, left: 30, right: 30 };
  };
  function overviewCamera() {
    if (portraitPhone()) { // Fit the height on a phone and open on the recent, dense part of the map, with no label cut at the edge.
      const pad = overviewPadding(), { west, east, edgeW, edgeE } = RECENT;
      // Same zoom before and after the title collapses: the height is the one under the collapsed title.
      const pxPerUnit = Math.min((innerHeight - pad.top + titleExtra() - pad.bottom) / 1580, (innerWidth - edgeW - edgeE) / (east - west));
      const half = innerWidth / 2 / pxPerUnit, gone = places.at(-7) ? places.at(-7).cx + 52 / pxPerUnit + half : -Infinity; // Puts the next label west fully off screen.
      const x = Math.max((west + east) / 2 - (edgeW - edgeE) / 2 / pxPerUnit, Math.min(gone, west - edgeW / pxPerUnit + half));
      return { center: ll(x, H / 2), zoom: zoomFor(pxPerUnit), pitch: 0, bearing: 0, padding: pad };
    }
    const c = map.cameraForBounds(LAND_BOX, { padding: overviewPadding(), absolutePadding: true });
    return { center: c.center, zoom: c.zoom, pitch: 0, bearing: 0, padding: c.padding };
  }
  function setMinZoom() { map.setMinZoom(overviewCamera().zoom - .9); }
  // A portrait phone opens on the recent part of the map, so the chip says what it does.
  function nameFullChip() { $('#full').textContent = portraitPhone() ? 'Overview' : 'Full map'; }
  nameFullChip();

  // Years pinned to the top edge.
  const yearsEl = $('#years');
  const yearEls = []; for (let y = YEAR0; y < YEAR1; y++) { const e = document.createElement('span'); e.textContent = y; yearsEl.appendChild(e); yearEls.push([y, e]); }
  function placeYears() {
    const nar = phone(), top = nar ? topEdge + 2 : 8, cy = map.getCenter().lat;
    yearsEl.style.top = top + 'px';
    const pxPerYear = map.project([(X(YEAR0 + 1) - W / 2) * K, cy]).x - map.project([(X(YEAR0) - W / 2) * K, cy]).x;
    yearEls.forEach(([y, e]) => { const px = map.project([(X(y) - W / 2) * K, cy]).x; const hide = px < 16 || px > innerWidth - 16 || (!nar && px < 364) || (pxPerYear < 40 && y % 2); e.style.visibility = hide ? 'hidden' : 'visible'; if (!hide) e.style.transform = `translate3d(${(px - 14).toFixed(1)}px,0,0)`; });
  }

  // Detail pages load quicker if the browser already has them.
  const fetched = new Set();
  function prefetch(p) {
    if (fetched.has(p.id) || navigator.connection?.saveData) return;
    fetched.add(p.id);
    const l = document.createElement('link'); l.rel = 'prefetch'; l.as = 'document'; l.href = p.url;
    document.head.appendChild(l);
  }

  // Places as real, focusable DOM markers.
  const glyph = g => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${g}"/></svg>`;
  places.forEach((p, i) => {
    const b = document.createElement('button'); b.className = 'place'; b.type = 'button';
    b.innerHTML = `<span class="nm">${glyph(p.glyph)}${esc(p.short)}</span><span class="nt">${esc(p.note)}</span><span class="yr">${esc(p.dates)}</span>`;
    // A drag that starts on a label moves the map. It should not also select the place.
    let dx = 0, dy = 0;
    b.addEventListener('pointerdown', e => { dx = e.clientX; dy = e.clientY; });
    b.addEventListener('click', e => { if (Math.hypot(e.clientX - dx, e.clientY - dy) < 10 || e.detail === 0) select(i); });
    b.addEventListener('pointerenter', () => prefetch(p));
    p.btn = b;
    p.marker = new maplibregl.Marker({ element: b, anchor: 'top', offset: [0, 9], opacityWhenCovered: '1' }).setLngLat(ll(p.cx, p.cy)).addTo(map);
  });

  // Selection and flights. All camera motion is MapLibre's own, so it is interruptible by design.
  let prefFlat = FLAT; // Selecting flies into 3D, unless the reader chose top-down.
  const TILT = { pitch: 52, bearing: -14 };
  const OVERVIEW_TILT = { pitch: 44, south: 200, east: 90, out: .06 }; // Portrait phone: more of the ground, centred between the controls and the chips.
  function flightPadding() {
    if (short()) return { top: topEdge + 8, bottom: 58, left: 16, right: Math.round(note.offsetWidth) + 28 };
    if (phone()) {
      const chips = innerHeight - log.getBoundingClientRect().top;
      return { top: topEdge + 28, bottom: Math.round(note.offsetHeight + chips + 20), left: 16, right: 16 };
    }
    // Too narrow for the title and the card to leave a side free, so land below the title.
    if (innerWidth < 1000) return { top: Math.round($('#title').getBoundingClientRect().bottom) + 12, bottom: 80, left: 16, right: Math.round(note.offsetWidth) + 28 };
    return { top: 50, bottom: 80, left: 70, right: 430 };
  }

  function landingFit(pad) {
    if (phone()) return pad;
    const free = innerWidth - pad.left - pad.right, spare = Math.max(0, free - Math.max(500, innerWidth * .4)) / 2;
    return { ...pad, left: pad.left + spare, right: pad.right + spare };
  }

  // The flight in progress. A control pressed or a page left mid-flight uses where it is going,
  // since stopping it would strand the camera. Any moveend from this flight means it is over.
  let flight = null, flightId = 0, tapUntil = 0, resume = null;
  function fly(to, feel) {
    flight = { to, feel, id: ++flightId };
    map.flyTo({ ...to, ...feel }, { flightId: flight.id });
  }
  map.on('moveend', e => {
    if (!flight || e.flightId !== flight.id) return;
    resume = performance.now() < tapUntil ? flight : null; // Any touch stops a flight. A second tap should not.
    flight = null;
  });
  function paintStops() { if (ready) map.setPaintProperty('stops', 'circle-radius', sel < 0 ? 5 : ['case', ['==', ['get', 'i'], sel], 7, 5]); }
  function setHash(id) { history.replaceState(history.state, '', location.pathname + location.search + (id ? '#' + id : '')); }
  function renderNote(p) {
    const dates = esc(p.dates) + (p.where ? ' · ' + esc(p.where) : '');
    note.innerHTML = `<button id="close" type="button">Close</button>
      <p class="k">${esc(p.kind)}</p><h2>${esc(p.org)}</h2><p class="t">${esc(p.role)}</p><p class="d">${dates}</p>
      <p class="x">${esc(p.text)}</p>
      <a class="cta" href="${esc(p.url)}">Open ${esc(p.short)} <span aria-hidden="true">→</span></a>${p.link ? `<a class="more" href="${esc(p.link.href)}">${esc(p.link.label)}</a>` : ''}`;
    $('#close').onclick = closeNote;
    note.querySelector('.cta').addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); leave(p);
    });
  }
  // how: 'fly' to fly there, 'jump' to cut straight there, 'none' to leave the camera alone.
  let tapGuard = 0;
  function select(i, how = 'fly') {
    if (leaving) return;
    if (i === sel && flight && how === 'fly') return; // A second tap on the way there.
    // The second tap of a double tap must not stop the flight the first one started.
    map.doubleClickZoom.disable();
    clearTimeout(tapGuard); tapGuard = setTimeout(() => map.doubleClickZoom.enable(), 400);
    tapUntil = performance.now() + 400; resume = null;
    collapseTitle();
    sel = i; const p = places[i];
    renderNote(p); prefetch(p); setHash(p.id);
    gsap.killTweensOf(note);
    gsap.fromTo(note, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: reduce ? 0 : .38, delay: reduce ? 0 : .25, ease: 'power3.out' });
    log.querySelectorAll('button[data-id]').forEach(b => mark(b, b.dataset.id === p.id));
    places.forEach((o, k) => { mark(o.btn, k === i); o.btn.classList.remove('clash'); });
    document.body.classList.add('focus');
    const chip = chipFor(i);
    if (chip) log.scrollTo({ left: chip.offsetLeft - (log.clientWidth - chip.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
    paintStops();
    if (how === 'none') return;
    let padding = flightPadding();
    document.body.classList.toggle('tight', innerHeight - padding.top - padding.bottom < 180);
    // Same landing size whatever the map's padding was before the flight and however wide the screen.
    // The fit is a share of the screen, so a flight draws about the same stretch of map on any screen.
    const box = [ll(p.cx - p.rx * 1.08, p.cy + p.ry * 1.25), ll(p.cx + p.rx * 1.08, p.cy - p.ry * 1.25)];
    let cam = map.cameraForBounds(box, { padding: landingFit(padding), maxZoom: 11, absolutePadding: true });
    if (!cam) { // The chrome leaves no room to fit the island. Frame it on the whole screen instead.
      padding = { top: 16, bottom: 16, left: 16, right: 16 };
      cam = map.cameraForBounds(box, { padding, maxZoom: 11, absolutePadding: true }) || { zoom: 10 };
    }
    const portrait = portraitPhone();
    const to = { center: ll(p.cx, p.cy), zoom: portrait ? Math.max(cam.zoom - .1, Math.log2(.5 * 360 / (512 * K))) : cam.zoom - .1, pitch: prefFlat ? 0 : TILT.pitch, bearing: prefFlat ? 0 : TILT.bearing, padding };
    if (how === 'jump' || reduce) map.jumpTo(to);
    else fly(to, { speed: .95, curve: 1.42, maxDuration: 3000 });
  }
  function closeNote() {
    // Focus inside the card goes back to the place's chip, not to the top of the page.
    if (sel >= 0 && note.contains(document.activeElement)) chipFor(sel)?.focus({ preventScroll: true });
    sel = -1;
    gsap.killTweensOf(note); gsap.to(note, { autoAlpha: 0, y: 10, duration: reduce ? 0 : .2 });
    log.querySelectorAll('button[data-id]').forEach(b => mark(b, false));
    places.forEach(o => { mark(o.btn, false); o.btn.classList.remove('clash'); });
    document.body.classList.remove('focus');
    paintStops(); setHash(null);
  }
  function mark(el, on) {
    el.classList.toggle('sel', on);
    if (on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
  }
  function fullMap() {
    if (leaving) return;
    closeNote();
    const c = overviewCamera();
    if (reduce) map.jumpTo(c); else fly(c, { speed: 1.2, curve: 1.3, maxDuration: 2200 });
  }

  // The Tilt control always shows the camera's real state, however it got there.
  let tiltGoal = null;
  // At the overview on a portrait phone, tilting also moves in, so land fills the space under the controls.
  // Tilt shortens the land, so only the width limits the zoom, and it fits the title once collapsed.
  function overviewLook(tilted) {
    const c = overviewCamera();
    if (!tilted) return c;
    if (!portraitPhone() || innerWidth > 520) return { ...c, ...TILT }; // The tuned view below only suits phone widths.
    const { west, east, edgeW, edgeE } = RECENT, zoom = zoomFor((innerWidth - edgeW - edgeE) / (east - west)) - OVERVIEW_TILT.out;
    const nudge = Math.max(0, 390 - innerWidth) / 2; // Keeps the next label west off a small screen.
    const center = [(west + east) / 2 - (edgeW - edgeE) / 2 * (east - west) / (innerWidth - edgeW - edgeE) + OVERVIEW_TILT.east + nudge, H / 2 + OVERVIEW_TILT.south];
    return { ...c, zoom, bearing: TILT.bearing, pitch: OVERVIEW_TILT.pitch, center: ll(...center), padding: { ...c.padding, top: c.padding.top - titleExtra() } };
  }
  function atOverview(tilted) {
    const c = overviewLook(tilted), at = map.getCenter();
    return Math.hypot(at.lng - c.center[0], at.lat - c.center[1]) / K < 40 && Math.abs(map.getZoom() - c.zoom) < .1;
  }
  function toggleTilt() {
    if (leaving) return;
    const on = !(tiltGoal ?? (flight ? flight.to.pitch > 4 : map.getPitch() > 4));
    prefFlat = !on;
    const look = { pitch: on ? TILT.pitch : 0, bearing: on ? TILT.bearing : 0 };
    if (flight) { fly(sel < 0 ? overviewLook(on) : { ...flight.to, ...look }, flight.feel); return; }
    tiltGoal = on;
    const frame = sel < 0 && portraitPhone() && atOverview(!on) ? overviewLook(on) : look;
    map.easeTo({ ...frame, duration: reduce ? 0 : 700, easing: t => t * (2 - t) });
    // After easeTo: cancelling the previous ease fires its moveend, which must not end this one.
    if (reduce) tiltGoal = null; else map.once('moveend', () => { if (tiltGoal === on) tiltGoal = null; });
  }
  function zoomBy(d) {
    if (leaving) return;
    if (flight) fly({ ...flight.to, zoom: Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), flight.to.zoom + d)) }, flight.feel);
    else if (d > 0) map.zoomIn(); else map.zoomOut();
  }
  map.on('pitchend', e => { if (e.originalEvent) prefFlat = map.getPitch() <= 4; });
  map.on('dragstart', () => { resume = null; }); // A drag after a tap is not a second tap.

  log.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'full') fullMap(); else select(places.findIndex(p => p.id === b.dataset.id)); });
  log.addEventListener('pointerover', e => { const b = e.target.closest('button[data-id]'); if (b) prefetch(places.find(p => p.id === b.dataset.id)); });
  tiltBtn.addEventListener('click', toggleTilt);
  $('#zoom-in').addEventListener('click', () => zoomBy(1));
  $('#zoom-out').addEventListener('click', () => zoomBy(-1));

  addEventListener('keydown', e => {
    if (failed || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (root.classList.contains('list-open')) {
      if (e.key === 'Escape') { history.pushState(null, '', urlWith(false)); setList(false); }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const n = places.length, d = e.key === 'ArrowRight' ? 1 : -1;
      select(sel < 0 ? (d > 0 ? 0 : n - 1) : (sel + d + n) % n);
    }
    if (e.key === 'Enter' && sel >= 0 && !e.repeat) {
      // A focused control keeps its own Enter. Otherwise Enter opens the selected place.
      const a = document.activeElement, idle = !a || a === document.body || a === map.getCanvas() || a === places[sel].btn || a === chipFor(sel);
      if (idle) { e.preventDefault(); leave(places[sel]); }
    }
    if (e.key === 'Escape') fullMap();
    if (e.key === '+' || e.key === '=') zoomBy(1);
    if (e.key === '-') zoomBy(-1);
    if (e.key === 't' || e.key === 'T') toggleTilt();
  });
  addEventListener('hashchange', () => { if (failed) return; const i = places.findIndex(p => p.id === location.hash.slice(1)); if (i >= 0 && i !== sel) select(i); });

  // Saving, leaving, coming back.
  let leaving = false, wipeClear = 0;
  function saveCamera() {
    // Mid-flight, where the camera is headed is the only view worth coming back to.
    const t = flight ? flight.to : { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), padding: map.getPadding() };
    const c = maplibregl.LngLat.convert(t.center);
    store.set('survey-camera', JSON.stringify({ center: [c.lng, c.lat], zoom: t.zoom, pitch: t.pitch, bearing: t.bearing, id: sel < 0 ? null : places[sel].id, padding: t.padding, flat: prefFlat }));
  }
  function takeCamera() {
    const raw = store.get('survey-camera');
    store.del('survey-camera');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function resetWipe() {
    clearTimeout(wipeClear);
    gsap.killTweensOf(wipe);
    gsap.set(wipe, { autoAlpha: 0, clearProps: 'clipPath' });
    leaving = false;
  }
  function restoreCamera() {
    const c = takeCamera();
    if (c) map.jumpTo({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, padding: c.padding });
  }
  // If the navigation does not leave this page, for example when it is stopped, uncover the map.
  function stayed() {
    store.del('survey-wipe');
    resetWipe();
    map.stop();
    restoreCamera();
    syncUi();
  }
  function leave(p) {
    if (leaving) return;
    saveCamera(); leaving = true;
    if (reduce) { location.href = p.url; wipeClear = setTimeout(stayed, 5000); return; }
    store.set('survey-wipe', p.id);
    let gone = false;
    const go = () => { if (gone) return; gone = true; clearTimeout(wipeClear); location.href = p.url; wipeClear = setTimeout(stayed, 5000); };
    map.easeTo({ zoom: Math.min(map.getZoom() + .8, map.getMaxZoom()), duration: 620, easing: t => t * t });
    wipe.style.background = p.bg;
    gsap.killTweensOf(wipe);
    gsap.fromTo(wipe, { autoAlpha: 1, clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: .42, delay: .2, ease: 'power3.inOut', onComplete: go });
    wipeClear = setTimeout(go, 900);
  }
  addEventListener('pagehide', () => { if (ready && !leaving && !failed) saveCamera(); });
  // bfcache: this page comes back exactly as it left, mid push-in and wiped over. Undo that.
  addEventListener('pageshow', e => {
    if (e.persisted && !failed) stayed();
  });

  // State the page reacts to on every camera change.
  let tiltShown = null;
  function syncUi() {
    const pitch = map.getPitch(), turned = pitch > 2 || Math.abs(map.getBearing()) > 2;
    document.body.classList.toggle('tilted', turned);
    if (!turned) placeYears(); // The year scale is only true top-down.
    const pxPerUnit = 512 * 2 ** map.getZoom() / 360 * K;
    document.body.classList.toggle('far', pxPerUnit < (phone() ? .55 : .3));
    const pressed = pitch > 4;
    if (pressed !== tiltShown) { tiltShown = pressed; tiltBtn.setAttribute('aria-pressed', pressed); tiltState.textContent = pressed ? '3D' : 'Flat'; }
  }
  map.on('move', syncUi);

  // Checks that read layout, so they run when the camera settles and never on a camera frame.
  function settle() {
    const inView = q => q.x >= 0 && q.x <= innerWidth && q.y >= 0 && q.y <= innerHeight;
    // Off-screen labels are not Tab stops. The chips list every place in order.
    places.forEach(p => { p.btn.tabIndex = inView(map.project(ll(p.cx, p.cy))) ? 0 : -1; });
    document.body.classList.toggle('west-on', sel < 0 && map.project(ll(places[0].cx, places[0].cy)).x < 0);
    if (!phone() || sel < 0) return;
    // On a small screen the selected label wins over any name it would run into.
    const rects = [...places[sel].btn.children].map(c => c.getBoundingClientRect()).filter(r => r.width);
    places.forEach((p, k) => {
      if (k === sel) return;
      const r = p.btn.querySelector('.nm').getBoundingClientRect();
      p.btn.classList.toggle('clash', rects.some(s => r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top));
    });
  }
  map.on('moveend', settle);

  // Paint the colour wash (hypsometric tints and water depth) into one texture.
  let T = null; // Terrain data from the worker.
  async function washUrl() {
    const t = th(), { nx, ny, hf, who, SEA } = T, cv = new OffscreenCanvas(nx, ny), x = cv.getContext('2d'), im = x.createImageData(nx, ny);
    const deep = hex(t.deep), shallow = hex(t.shallow), land = hex(t.land), tints = places.map(p => hex(p.tint));
    for (let i = 0; i < nx * ny; i++) {
      const h = hf[i]; let c;
      if (h < SEA) c = mix(deep, shallow, Math.pow(h / SEA, 1.6));
      else c = mix(land, tints[who[i]], t.k0 + Math.min(1, (h - SEA) / .6) * t.k1);
      im.data[i * 4] = c[0]; im.data[i * 4 + 1] = c[1]; im.data[i * 4 + 2] = c[2]; im.data[i * 4 + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return URL.createObjectURL(await cv.convertToBlob({ type: 'image/png' }));
  }

  // Elevation tiles come ready-made from the worker and are served through MapLibre's protocol API.
  const ELEV = 8200;
  let blankTile = null;
  maplibregl.addProtocol('survey', async params => {
    const key = params.url.replace('survey://', '');
    const buf = T.tiles[key];
    if (buf) return { data: buf.slice(0) };
    if (!blankTile) { const cv = new OffscreenCanvas(1, 1), c = cv.getContext('2d'); c.fillStyle = 'rgb(128,0,0)'; c.fillRect(0, 0, 1, 1); blankTile = await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer(); }
    return { data: blankTile.slice(0) };
  });

  function paintTheme() {
    const t = th();
    map.setPaintProperty('bg', 'background-color', t.deep);
    map.setPaintProperty('l-sub', 'line-color', t.sub); map.setPaintProperty('l-minor', 'line-color', t.minor);
    map.setPaintProperty('l-index', 'line-color', t.index); map.setPaintProperty('l-coast', 'line-color', t.coast);
    map.setPaintProperty('l-grat', 'line-color', t.grat); map.setPaintProperty('route', 'line-color', t.route);
    map.setPaintProperty('stops', 'circle-stroke-color', t.route); map.setPaintProperty('stops', 'circle-color', t.halo);
    if (map.getLayer('hs')) { map.setPaintProperty('hs', 'hillshade-shadow-color', t.hsShadow); map.setPaintProperty('hs', 'hillshade-highlight-color', t.hsLight); map.setPaintProperty('hs', 'hillshade-accent-color', t.hsAccent); }
  }

  function buildLayers(urlWash) {
    const t = th(), wZ = (a, b) => ['interpolate', ['exponential', 1.6], ['zoom'], 8, a, 11, b];
    const corners = [ll(0, 0), ll(W, 0), ll(W, H), ll(0, H)];
    map.addSource('wash', { type: 'image', url: urlWash, coordinates: corners });
    map.addLayer({ id: 'wash', type: 'raster', source: 'wash', paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 } });

    const tiles = ['survey://{z}/{x}/{y}'], bounds = [ll(0, H)[0], ll(0, H)[1], ll(W, 0)[0], ll(W, 0)[1]];
    if (!FLAT) {
      map.addSource('dem', { type: 'raster-dem', encoding: 'terrarium', tiles, tileSize: 256, minzoom: 5, maxzoom: 9, bounds });
      map.addSource('dem-hs', { type: 'raster-dem', encoding: 'terrarium', tiles, tileSize: 256, minzoom: 5, maxzoom: 9, bounds });
      map.addLayer({ id: 'hs', type: 'hillshade', source: 'dem-hs', paint: { 'hillshade-exaggeration': .16, 'hillshade-shadow-color': t.hsShadow, 'hillshade-highlight-color': t.hsLight, 'hillshade-accent-color': t.hsAccent, 'hillshade-illumination-direction': 315 } });
    }

    const graticule = [];
    for (let y = YEAR0; y <= YEAR1; y++) graticule.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [ll(X(y), -SLACK_Y), ll(X(y), H + SLACK_Y)] } });
    for (let k = 0; k <= 6; k++) graticule.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [ll(-SLACK_X, H * k / 6), ll(W + SLACK_X, H * k / 6)] } });
    map.addSource('grat', { type: 'geojson', data: { type: 'FeatureCollection', features: graticule } });
    map.addLayer({ id: 'l-grat', type: 'line', source: 'grat', paint: { 'line-color': t.grat, 'line-width': 1 } });

    const proj = f => ({ ...f, geometry: { ...f.geometry, coordinates: f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map(p => p.map(r => r.map(c => ll(c[0], c[1])))) : f.geometry.coordinates.map(r => r.map(c => ll(c[0], c[1]))) } });
    map.addSource('contours', { type: 'geojson', data: { type: 'FeatureCollection', features: T.lines.map(proj) }, tolerance: .25, buffer: 8 });
    const line = (id, kind, color, a, b) => map.addLayer({ id, type: 'line', source: 'contours', filter: ['==', ['get', 'kind'], kind], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': wZ(a, b) } });
    line('l-sub', 'sub', t.sub, .8, 1.4); line('l-minor', 'minor', t.minor, .6, 1.3); line('l-index', 'index', t.index, 1, 2); line('l-coast', 'coast', t.coast, 1.4, 3);

    map.addSource('islands', { type: 'geojson', data: { type: 'FeatureCollection', features: T.hits.map(proj) } });
    map.addLayer({ id: 'hit', type: 'fill', source: 'islands', paint: { 'fill-color': t.hover, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], .14, 0] } }, 'l-sub');

    // Route: places in the order they started.
    const pts = places.map(p => [p.cx, p.cy]), curve = [];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 24; k++) { const u = k / 24, u2 = u * u, u3 = u2 * u; curve.push(ll(.5 * (2 * b[0] + (c[0] - a[0]) * u + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * u2 + (3 * b[0] - a[0] - 3 * c[0] + d[0]) * u3), .5 * (2 * b[1] + (c[1] - a[1]) * u + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * u2 + (3 * b[1] - a[1] - 3 * c[1] + d[1]) * u3))); } }
    curve.push(ll(...pts[pts.length - 1]));
    map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: curve } } });
    map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': t.route, 'line-width': 2.2, 'line-dasharray': [4, 2.6], 'line-opacity': 0 } });
    map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: places.map((p, i) => ({ type: 'Feature', properties: { i }, geometry: { type: 'Point', coordinates: ll(p.cx, p.cy) } })) } });
    map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': 5, 'circle-color': t.halo, 'circle-stroke-color': t.route, 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map', 'circle-opacity': 0, 'circle-stroke-opacity': 0 } });

    if (!FLAT) map.setTerrain({ source: 'dem', exaggeration: 1 });

    // Hover and click on the ground itself.
    let hover = null;
    const setHover = id => { if (id === hover) return; if (hover != null) { map.setFeatureState({ source: 'islands', id: hover }, { hover: false }); places[hover].btn.classList.remove('hot'); } hover = id; if (id != null) { map.setFeatureState({ source: 'islands', id }, { hover: true }); places[id].btn.classList.add('hot'); prefetch(places[id]); } document.body.classList.toggle('over-land', id != null); };
    map.on('mousemove', 'hit', e => setHover(e.features[0].id));
    map.on('mouseleave', 'hit', () => setHover(null));
    // A resume waits only for the second tap of a double tap. Any later tap on land is a new selection.
    map.on('click', 'hit', e => { if (!resume || performance.now() >= tapUntil + 300) select(e.features[0].id); });
    map.on('click', () => { if (resume) { const r = resume; resume = null; if (performance.now() < tapUntil + 300) fly(r.to, r.feel); } });
  }

  // Device guard: if real navigation frames are slow, give up relief, keep smoothness.
  let terrainOn = !FLAT, last = 0, slow = 0, seen = 0;
  map.on('render', () => { const now = performance.now(), dt = now - last; last = now; if (!terrainOn || !map.isMoving() || dt > 200) return; seen++; if (dt > 34) slow++; if (seen >= 70) { if (slow / seen > .4) { terrainOn = false; map.setTerrain(null); window.__surveyTerrainDropped = true; } seen = slow = 0; } });

  // Start.
  const worker = new Worker('/survey/terrain-worker.js');
  worker.postMessage({ W, H, K, ELEV, isles: places.map(({ cx, cy, rx, ry }) => ({ cx, cy, rx, ry })), relief: !FLAT });
  const terrain = new Promise((res, rej) => {
    worker.onmessage = e => { res(e.data); worker.terminate(); };
    worker.onerror = e => { rej(new Error('terrain worker: ' + e.message)); worker.terminate(); };
    worker.onmessageerror = () => { rej(new Error('terrain worker: bad message')); worker.terminate(); };
  });
  const mapLoaded = new Promise(res => map.once('load', res));
  const fontsReady = Promise.race([document.fonts ? document.fonts.ready : 0, new Promise(r => setTimeout(r, 1500))]);

  if (DEBUG) window.__survey = {
    ready: false,
    camera() { const c = map.getCenter(); return { x: c.lng / K + W / 2, y: -c.lat / K + H / 2, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }; },
    select(id) { select(places.findIndex(p => p.id === id)); },
    selectedId() { return sel < 0 ? null : places[sel].id; },
    screenOf(id) { const p = places.find(o => o.id === id), q = map.project(ll(p.cx, p.cy)); return { x: q.x, y: q.y }; },
    moving() { return map.isMoving(); },
    flat: FLAT,
    map,
  };

  const [data] = await Promise.all([terrain, mapLoaded, fontsReady]);
  T = data;
  // The noise moves each coast away from its nominal centre, so pins use the land itself: the area
  // centroid of each place's largest landmass. Done here so a cached older worker cannot break it.
  places.forEach((p, i) => {
    const hit = T.hits.find(f => f.id === i);
    let bestArea = 0;
    for (const poly of hit ? hit.geometry.coordinates : []) {
      const r = poly[0];
      let a = 0, x = 0, y = 0;
      for (let q = 0; q < r.length - 1; q++) { const c = r[q][0] * r[q + 1][1] - r[q + 1][0] * r[q][1]; a += c; x += (r[q][0] + r[q + 1][0]) * c; y += (r[q][1] + r[q + 1][1]) * c; }
      if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); p.cx = x / (3 * a); p.cy = y / (3 * a); }
    }
    p.marker.setLngLat(ll(p.cx, p.cy));
  });
  measure();
  setMinZoom();

  // Back from a detail page: same camera as we left it. A link to one place: open on that place.
  const hash = location.hash.slice(1), hashAt = places.findIndex(p => p.id === hash), saved = takeCamera();
  let openAt = -1, openHow = 'fly';
  if (saved && (hashAt < 0 || saved.id === hash)) {
    prefFlat = !!saved.flat;
    map.jumpTo({ center: saved.center, zoom: saved.zoom, pitch: saved.pitch, bearing: saved.bearing, padding: saved.padding });
    openAt = places.findIndex(p => p.id === saved.id); openHow = 'none';
  } else {
    map.jumpTo(overviewCamera());
    if (hashAt >= 0) { openAt = hashAt; openHow = 'jump'; }
  }
  if (saved || openAt >= 0) collapseTitle();
  if (openAt >= 0) select(openAt, openHow);

  buildLayers(await washUrl());
  ready = true;
  paintStops();
  syncUi();
  settle();
  map.once('idle', () => {
    up = true;
    root.classList.add('map-ready');
    if (DEBUG) window.__survey.ready = true;
    gsap.to('#map', { opacity: 1, duration: reduce ? 0 : .5, ease: 'power1.out' });
    const prog = { v: 0 };
    gsap.to(prog, { v: 1, duration: reduce ? 0 : 1.1, delay: reduce ? 0 : .25, ease: 'power2.out', onUpdate() { map.setPaintProperty('route', 'line-opacity', prog.v); map.setPaintProperty('stops', 'circle-opacity', prog.v); map.setPaintProperty('stops', 'circle-stroke-opacity', prog.v); } });
  });

  let wasPortrait = innerHeight > innerWidth;
  addEventListener('resize', () => {
    if (failed) return;
    map.resize(); measure(); setMinZoom(); syncUi(); nameFullChip();
    const portrait = innerHeight > innerWidth;
    if (phone() && portrait !== wasPortrait) { if (sel >= 0) select(sel, 'jump'); else map.jumpTo(overviewCamera()); } // Turned the phone: keep the place in view.
    wasPortrait = portrait;
  });
  const reTheme = async () => { paintTheme(); map.getSource('wash').updateImage({ url: await washUrl(), coordinates: [ll(0, 0), ll(W, 0), ll(W, H), ll(0, H)] }); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', reTheme);
  new MutationObserver(reTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
