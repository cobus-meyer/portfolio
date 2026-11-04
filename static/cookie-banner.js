// The cookie banner. build.py only loads this when the build has analytics on.
// Head script in build.py reads the saved choice and sets up PostHog before this runs.
(function () {
  var KEY = 'cookie_consent';
  var AVATAR = '<svg class="ck-avatar" viewBox="0 0 100 100" role="img" aria-label="A smiling cookie in a tie, in a round profile picture with a green Open to work ring">' +
    '<defs><clipPath id="ck-clip"><circle cx="50" cy="50" r="46"/></clipPath></defs>' +
    '<circle cx="50" cy="50" r="47" fill="#DCE6E4"/>' +
    '<g clip-path="url(#ck-clip)">' +
    '<path d="M24 100c0-22 11-34 26-34s26 12 26 34z" fill="#33424A"/>' +
    '<path d="m50 64-4 3 2.5 18h3L54 67z" fill="#CC3A1B" stroke="#2B2118" stroke-width=".7"/>' +
    '<circle cx="50" cy="39" r="25" fill="#D9A968" stroke="#2B2118" stroke-width="1.5"/>' +
    '<circle cx="34" cy="30" r="3" fill="#4A2C17"/><circle cx="66" cy="28" r="3" fill="#4A2C17"/><circle cx="63" cy="50" r="2.8" fill="#4A2C17"/><circle cx="36" cy="50" r="2.6" fill="#4A2C17"/><circle cx="50" cy="22" r="2.2" fill="#4A2C17"/>' +
    '<circle cx="44" cy="37" r="2.1" fill="#2B2118"/><circle cx="56" cy="37" r="2.1" fill="#2B2118"/>' +
    '<path d="M43 44c4 4.5 10 4.5 14 0" fill="none" stroke="#2B2118" stroke-width="1.7" stroke-linecap="round"/>' +
    '</g>' +
    '<path d="M11.5 36A41 41 0 0 0 88.5 64" fill="none" stroke="#0A7A3E" stroke-width="13"/>' +
    '<path id="ck-arc" d="M8.6 35A44 44 0 0 0 91.3 65" fill="none"/>' +
    '<text font-family="IBM Plex Sans Condensed, Inter, sans-serif" font-size="8.8" font-weight="600" letter-spacing=".5" fill="#fff"><textPath href="#ck-arc" startOffset="50%" text-anchor="middle">#OPENTOWORK</textPath></text>' +
    '</svg>';
  var HTML =
    '<button type="button" class="ck-close" data-ck="close">Close <span aria-hidden="true">✕</span></button>' +
    '<p class="ck-kicker">Application received</p>' +
    '<h2 class="ck-title">Cookie, open to work</h2>' +
    '<dl class="ck-cv">' +
    '<dt>Role</dt><dd>Analytics cookie, your browser</dd>' +
    '<dt>Duties</dt><dd>Counting visits and clicks</dd>' +
    '<dt>Reports to</dt><dd><button type="button" class="ck-who" data-ck="who">A hedgehog<span class="ck-tip" role="tooltip">It\'s PostHog.</span></button>, EU servers</dd>' +
    '<dt>Won\'t do</dt><dd>Record your session</dd>' +
    '</dl>' +
    '<div class="ck-row"><p class="ck-aside">(I know how it feels.)</p>' + AVATAR + '</div>' +
    '<div class="ck-actions"><button type="button" class="ck-btn ck-yes" data-ck="yes">Hire it</button><button type="button" class="ck-btn" data-ck="no">Not a good fit</button></div>' +
    '<a class="ck-note" href="/privacy/">Privacy note</a>';

  var banner = null;

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(value) { try { localStorage.setItem(KEY, value); } catch (e) { /* The choice lasts for this page. */ } }
  function hide() { if (banner) { banner.remove(); banner = null; } }

  function choose(value) {
    var ph = window.posthog;
    save(value);
    hide();
    if (value === 'yes') {
      // After an earlier "no" the SDK was never loaded, so it needs a fresh page.
      if (!ph || !ph.__loaded) { location.reload(); return; }
      ph.set_config({ persistence: 'localStorage+cookie' });
      if (ph.has_opted_out_capturing()) ph.opt_in_capturing();
    } else {
      if (ph && ph.__loaded) { ph.set_config({ persistence: 'memory' }); ph.opt_out_capturing(); }
      window.__clearAnalytics();
    }
  }

  function show() {
    if (banner) return;
    banner = document.createElement('section');
    banner.className = 'ck-banner';
    banner.setAttribute('aria-label', 'Cookie choice');
    banner.innerHTML = HTML;
    banner.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ck]');
      if (!b) return;
      var what = b.getAttribute('data-ck');
      if (what === 'who') b.classList.toggle('open');
      // Closing keeps an earlier choice. With none, it counts as no choice and stores nothing else.
      else if (what === 'close') { if (!saved()) save('closed'); hide(); }
      else choose(what);
    });
    document.body.appendChild(banner);
  }

  // The privacy note links here so a choice can be changed.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#cookie-choice"]');
    if (a) { e.preventDefault(); show(); }
  });

  if (!saved()) show();
})();
