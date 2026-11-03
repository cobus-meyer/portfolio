"""Static site builder for Cobus Meyer's portfolio.

Every content/<slug>.md becomes a page:
  index.md -> dist/index.html          (home)
  sage.md  -> dist/sage/index.html     (page at /sage/)
Each page is also published as raw markdown (/index.md, /sage.md) for agents,
and llms.txt + llms-full.txt are generated from the pages' front matter.

A fenced block written as ```flow:<name> stays ASCII art in the markdown and is
swapped for diagrams/<name>.html in the HTML page.

A content file with a `kind` field is a place: it gets an island on the map, a
chip, and a detail page with its own world (see SCENES). Its text is checked
against its section in content/index.md, and the build fails on any mismatch.
Every page carries the same JSON blob of places (<script id="places">).

PORTFOLIO_DIST overrides the output directory (default: dist).

Run: pip install -r requirements.txt && python3 build.py
"""
import datetime
import html
import json
import os
import re
import shutil
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).parent
CONTENT, DIAGRAMS, STATIC = (ROOT / d for d in ("content", "diagrams", "static"))
DIST = Path(os.environ.get("PORTFOLIO_DIST") or ROOT / "dist").resolve()

SITE = {
    "name": "Cobus Meyer",
    "tagline": "Product engineer and technical founder in Cape Town. I build AI-native products and the things agents use.",
    "email": "meyerje94@gmail.com",
    "linkedin": "https://www.linkedin.com/in/cobusmeyer",
    "github": "https://github.com/cobus-meyer",
}

# Google Fonts families. Home loads the map and résumé families; a detail page
# loads its scene's families plus the shared UI family, and nothing else.
FONTS_BASE = "Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Inter:wght@400;500;600&family=JetBrains+Mono"
FONTS_MAP = "IBM+Plex+Sans+Condensed:wght@400;500;600&family=Spectral:ital,wght@0,400;0,600;1,400;1,500"
FONT_UI = "Archivo:wght@400;600;800"

# Illustrations from real HTML. Their words come from the role text or the article.
SAGE_REPORT = """<div class="report" id="report" aria-hidden="true">
<div class="chat-head"><i></i>AI chat</div>
<div class="ask step">a question in plain language</div>
<div class="backend step"><p class="lay">Illustration · model writes a declarative UI</p><pre class="spec"><code class="c1">root = Stack([tiles, note])</code><code class="c2">tiles = Tiles([a, b])</code></pre></div>
<div class="wire step"></div>
<div class="reply"><p class="lay step lay-r">Renders as components</p>
<div class="kpis"><div class="kpi a step">Value a<i></i></div><div class="kpi b step">Value b<i></i></div></div>
<div class="callout step"><i style="width:88%"></i><i style="width:64%"></i></div>
<div class="rank step"><div><i></i><i style="width:80%"></i></div><div><i style="width:80%"></i><i style="width:56%"></i></div><div><i style="width:90%"></i><i style="width:34%"></i></div></div>
</div>
</div>"""
TOPIC_LAYERS = '<ul class="layers" aria-hidden="true"><li>Application layer</li><li>Embedded layer</li><li>ROS data layer</li><li>FPGA hardware</li><li>STM32 firmware</li></ul>'

# One entry per world. A role's `scene` names an entry here and a module at
# static/worlds/scenes/<scene>.js; its CSS class is w-<scene> in worlds.css.
SCENES = {
    "sage": {"bg": "#10190F", "ink": "#EFEAD6", "accent": "#BBD77F", "font": "Newsreader, serif", "fw": 600,
             "families": ["Newsreader:opsz,wght@6..72,400;6..72,600", "JetBrains+Mono:wght@400"], "extra": SAGE_REPORT,
             "ramp": ["#26361C", "#2E2B19", "#3B2E1B", "#4A361E", "#352616", "#1E150D"]},
    "brew": {"bg": "#EFDFC6", "ink": "#2E170B", "accent": "#A5481C", "font": '"Bricolage Grotesque", sans-serif', "fw": 800,
             "families": ["Bricolage+Grotesque:opsz,wght@12..96,400;12..96,800"]},
    "spray": {"bg": "#FFD400", "ink": "#08245C", "accent": "#08245C", "font": '"Young Serif", serif', "fw": 400,
              "families": ["Young+Serif"]},
    "topic": {"bg": "#040906", "ink": "#7CFFBC", "accent": "#FFC44D", "font": '"IBM Plex Mono", monospace', "fw": 600,
              "families": ["IBM+Plex+Mono:wght@400;600"], "extra": TOPIC_LAYERS},
    "print": {"bg": "#12337A", "ink": "#EAF1FF", "accent": "#FFD666", "font": '"Barlow Condensed", sans-serif', "fw": 700,
              "families": ["Barlow+Condensed:wght@400;500;700"]},
    "rows": {"bg": "#0B1C12", "ink": "#F2F5E6", "accent": "#FFB020", "font": '"Chakra Petch", sans-serif', "fw": 700,
             "families": ["Chakra+Petch:wght@400;600;700"]},
    "tags": {"bg": "#FFFFFF", "ink": "#0A0A0A", "accent": "#E6001F", "font": "Anton, sans-serif", "fw": 400,
             "families": ["Anton"]},
    "edu": {"bg": "#5E1020", "ink": "#F8E8D8", "accent": "#F2B84B", "font": '"Libre Caslon Text", serif', "fw": 400,
            "families": ["Libre+Caslon+Text:ital@0;1"], "contact": True},
}

PLACE_FIELDS = ("title", "slug", "date", "kind", "org", "short", "role", "dates",
                "start", "end", "lat", "ry", "note", "tint", "glyph", "scene")  # `where` may be empty
WORLD = {"W": 2800, "H": 1700, "K": .001}  # map world units; static/survey/survey.js reads them from the blob


class BuildError(Exception):
    pass


def month_t(year: int, month: int) -> float:
    """Mid-month anchor, so handoffs in the same month do not count as overlap."""
    return year + (month - 1) / 12 + 1 / 24


TODAY = datetime.date.today()
NOW = month_t(TODAY.year, TODAY.month)


def when(value: str) -> float:
    """YYYY (placed at January), YYYY-MM, or present."""
    if value == "present":
        return NOW
    m = re.fullmatch(r"(\d{4})(?:-(\d{2}))?", value)
    if not m:
        raise ValueError(value)
    return month_t(int(m.group(1)), int(m.group(2) or 1))


def parse(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    meta, body = {}, text
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip('"')
        body = text[m.end():]
    meta.setdefault("slug", path.stem)
    return {"meta": meta, "body": body.strip() + "\n"}


def to_html(body: str) -> str:
    def swap(m):
        f = DIAGRAMS / f"{m.group(1)}.html"
        return f"\n<!--FLOW:{m.group(1)}-->\n" if f.exists() else m.group(0)

    body = re.sub(r"```flow:([\w-]+)\n.*?```", swap, body, flags=re.S)
    out = markdown.markdown(body, extensions=["fenced_code"])
    for name in re.findall(r"<!--FLOW:([\w-]+)-->", out):
        svg = (DIAGRAMS / f"{name}.html").read_text(encoding="utf-8")
        out = re.sub(rf"(<p>)?<!--FLOW:{name}-->(</p>)?", lambda _: svg, out)
    return out


def page_url(slug: str) -> str:
    return "/" if slug == "index" else f"/{slug}/"


def md_url(slug: str) -> str:
    return f"/{slug}.md"


def index_sections(body: str) -> dict:
    """Split index.md by heading: title -> {byline, paragraphs}. Link-only lines are not paragraphs."""
    sections, current = {}, None
    for line in body.splitlines():
        m = re.match(r"(#{2,3}) (.+)", line)
        if m:
            current = sections.setdefault(m.group(2).strip(), {"byline": "", "paragraphs": [], "links": []})
        elif current is not None and line.strip():
            text = line.strip()
            if re.fullmatch(r"\*[^*]+\*", text) and not current["byline"]:
                current["byline"] = text[1:-1]
            elif re.fullmatch(r"\[[^\]]*\]\([^)]*\)", text):
                current["links"].append(text)
            else:
                current["paragraphs"].append(text)
    return sections


def role_paragraph(meta: dict, sections: dict, errors: list) -> str:
    """The role's paragraph in index.md, with the heading, dates and link line checked."""
    slug, org, role, dates, where = (meta.get(k, "") for k in ("slug", "org", "role", "dates", "where"))
    heading = f"{org} · {role}"
    link = f"](/{slug}/)"
    sec = sections.get(heading)
    if sec:
        byline = " · ".join(x for x in (dates, where) if x)
        if sec["byline"] != byline:
            errors.append(f"{slug}.md: dates and where give '{byline}', index.md section '### {heading}' has '{sec['byline']}'")
        para = sec["paragraphs"][0] if sec["paragraphs"] else ""
        if not para:
            errors.append(f"{slug}.md: index.md section '### {heading}' has no paragraph")
    else:  # A role written as a paragraph under `## <kind>`, like Education.
        sec = sections.get(meta.get("kind", ""))
        hits = [p for p in sec["paragraphs"] if org in p and role in p and dates in p] if sec else []
        if not hits:
            errors.append(f"{slug}.md: no section '### {heading}' in index.md, and no paragraph under '## {meta.get('kind', '')}' naming org, role and dates")
            return ""
        para = hits[0]
    if not any(link in line for line in sec["links"]):
        errors.append(f"{slug}.md: index.md must link to the detail page, in this role's section: [Open {meta.get('short', slug)} →](/{slug}/)")
    return para


def build_places(pages: list, index_body: str, errors: list) -> dict:
    """Validate every place against index.md and return the JSON blob's data."""
    sections, rows = index_sections(index_body), []
    for page in pages:
        meta, body, slug = page["meta"], page["body"], page["meta"]["slug"]
        if "kind" not in meta:
            continue
        missing = [k for k in PLACE_FIELDS if not meta.get(k)]
        if missing:
            errors.append(f"{slug}.md: missing front matter: {', '.join(missing)}")
            continue
        scene = SCENES.get(meta["scene"])
        if not scene:
            errors.append(f"{slug}.md: unknown scene '{meta['scene']}'. Known: {', '.join(SCENES)}")
            continue
        if not (STATIC / "worlds" / "scenes" / f"{meta['scene']}.js").exists():
            errors.append(f"{slug}.md: no scene module at static/worlds/scenes/{meta['scene']}.js")
        try:
            start, end = when(meta["start"]), when(meta["end"])
            lat, ry = float(meta["lat"]), float(meta["ry"])
        except ValueError as e:
            errors.append(f"{slug}.md: bad start, end, lat or ry: {e}")
            continue
        para = role_paragraph(meta, sections, errors)
        if not para:
            continue
        if meta.get("article") != "true":
            blocks = [b.strip() for b in re.split(r"\n\s*\n", body.strip())]
            byline = " · ".join(x for x in (meta["role"], meta["dates"], meta.get("where", "")) if x)
            want = [f"# {meta['org']}", f"*{byline}*", para]
            if blocks != want:
                for label, got, exp in zip(("heading", "byline", "paragraph"), blocks + [""] * 3, want):
                    if got != exp:
                        errors.append(f"{slug}.md: {label} does not match index.md verbatim.\n    expected: {exp}\n    found:    {got}")
                if len(blocks) > 3:
                    errors.append(f"{slug}.md: body must be heading, byline and paragraph only; found {len(blocks)} blocks")
                continue
        text = meta.get("card") or re.sub(r"\s*\[[^\]]*\]\([^)]*\)", "", para).strip()
        if text not in para:
            errors.append(f"{slug}.md: card text is not a verbatim part of its index.md paragraph: {text}")
            continue
        rows.append((meta, scene, start, end, lat, ry, text))

    rows.sort(key=lambda r: r[2])
    span_from = int(min((r[2] for r in rows), default=NOW))
    span_to = int(NOW) + 1
    X = lambda t: 220 + (t - span_from) / (span_to - span_from) * 2360
    places = []
    for meta, scene, start, end, lat, ry, text in rows:
        x0, x1, slug = X(start), X(end), meta["slug"]
        places.append({
            "id": slug, "url": page_url(slug), "md": md_url(slug), "article": meta.get("article") == "true",
            "short": meta["short"], "org": meta["org"], "kind": meta["kind"], "role": meta["role"],
            "dates": meta["dates"], "where": meta.get("where", ""), "text": text,
            "link": {"href": meta["link_href"], "label": meta.get("link_label") or meta["link_href"]} if meta.get("link_href") else None,
            "year": int(meta["start"][:4]), "start": round(start, 4), "end": round(end, 4), "ongoing": meta["end"] == "present",
            "lat": lat, "ry": ry, "cx": round((x0 + x1) / 2, 2), "cy": round(200 + lat * 1300, 2), "rx": round((x1 - x0) / 2 * .98, 2),
            "note": meta["note"], "tint": meta["tint"], "glyph": meta["glyph"],
            "scene": meta["scene"], "bg": scene["bg"], "ink": scene["ink"], "accent": scene["accent"], "font": scene["font"], "fw": scene["fw"],
        })
    return {
        "site": {"name": SITE["name"], "tagline": SITE["tagline"], "email": SITE["email"], "github": SITE["github"], "linkedin": SITE["linkedin"]},
        "world": WORLD, "span": {"from": span_from, "to": span_to}, "now": round(NOW, 4), "places": places,
    }


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def attr(text: str) -> str:
    return html.escape(text, quote=True)


def places_blob(data: dict) -> str:
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'<script type="application/json" id="places">{blob}</script>'


def contact_links(has_cv: bool) -> str:
    cv = '<a href="/cv.pdf">CV</a>' if has_cv else ""
    return f'{cv}<a href="{SITE["github"]}">GitHub</a><a href="{SITE["linkedin"]}">LinkedIn</a><a href="mailto:{SITE["email"]}">Email</a>'


def head_html(page: dict, fonts: str, extra: str = "", html_attrs: str = "") -> str:
    meta, slug = page["meta"], page["meta"]["slug"]
    is_home = slug == "index"
    title = SITE["name"] if is_home else f'{meta["title"]} · {SITE["name"]}'
    desc = SITE["tagline"] if is_home else meta.get("summary", "")
    ld = {
        "@context": "https://schema.org",
        "@type": "ProfilePage" if is_home else "Article",
        ("mainEntity" if is_home else "author"): {
            "@type": "Person", "name": SITE["name"], "email": SITE["email"],
            "sameAs": [SITE["linkedin"], SITE["github"]],
        },
    }
    if not is_home:
        ld.update({"headline": meta["title"], "datePublished": meta.get("date", ""), "description": desc})
    return f"""<!doctype html>
<html lang="en"{html_attrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<link rel="alternate" type="text/markdown" href="{md_url(slug)}" title="Markdown version">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family={fonts}&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
{extra}
<script type="application/ld+json">{json.dumps(ld)}</script>
</head>
"""


def header_html(is_home: bool, has_cv: bool) -> str:
    nav_home = "" if is_home else f'<a href="/" class="home">{SITE["name"]}</a>'
    return f'<header><nav>{nav_home}<span class="links">{contact_links(has_cv)}</span></nav></header>'


def footer_html(slug: str) -> str:
    return f"""<footer>
<p>{SITE['email']} · Cape Town, South Africa</p>
<p class="agents">For agents: this page as markdown at <a href="{md_url(slug)}">{md_url(slug)}</a>; site index at <a href="/llms.txt">/llms.txt</a>.</p>
</footer>"""


def render_plain(page: dict, has_cv: bool, blob: str) -> str:
    """An article or other page that is not a place."""
    slug = page["meta"]["slug"]
    return f"""{head_html(page, FONTS_BASE, blob)}<body class="article">
{header_html(False, has_cv)}
<main>
{to_html(page["body"])}
</main>
{footer_html(slug)}
</body>
</html>
"""


# Runs before first paint. Static, so it lives here rather than per page.
HOME_HEAD_SCRIPT = """<style>
#survey { display: none; }
.map-on #survey { display: block; }
.map-on #resume { display: none; }
.map-on.list-open #resume { display: block; }
</style>
<script>
(function () {
  var d = document.documentElement, list = new URLSearchParams(location.search).has('list'), gl = false;
  try {
    var x = window.WebGL2RenderingContext && document.createElement('canvas').getContext('webgl2');
    gl = !!x;
    if (x && x.getExtension('WEBGL_lose_context')) x.getExtension('WEBGL_lose_context').loseContext();
  } catch (e) {}
  window.__mapCapable = gl;
  window.surveyFallback = function () {
    d.classList.remove('map-on', 'list-open'); d.classList.add('map-failed');
    var t = document.getElementById('view-toggle');
    if (t) { t.href = '/'; t.textContent = 'Map view'; } // The résumé is showing, so this offers another go.
  };
  if (gl && !list) {
    d.classList.add('map-on');
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/vendor/maplibre-gl.css';
    document.head.appendChild(css);
    setTimeout(function () { if (!window.__surveyUp) window.surveyFallback(); }, 15000);
  }
})();
</script>"""


TOGGLE_SCRIPT = """<script>(function () { var t = document.getElementById('view-toggle'); if (window.__mapCapable && new URLSearchParams(location.search).has('list')) { t.href = '/'; t.textContent = 'Map view'; } })();</script>"""


def add_resume_anchors(body_html: str, data: dict) -> str:
    """Give each role's heading in the résumé an id, so /#<slug> lands there in list view."""
    for p in data["places"]:
        h3 = f"<h3>{esc(p['org'])} · {esc(p['role'])}</h3>"
        if h3 in body_html:
            body_html = body_html.replace(h3, h3.replace("<h3>", f'<h3 id="{p["id"]}">'), 1)
        else:
            body_html = body_html.replace(f"<h2>{esc(p['kind'])}</h2>", f'<h2 id="{p["id"]}">{esc(p["kind"])}</h2>', 1)
    return body_html


def render_home(page: dict, has_cv: bool, data: dict, blob: str) -> str:
    extra = f"""<link rel="stylesheet" href="/survey/survey.css">
{HOME_HEAD_SCRIPT}
{blob}
<script src="/vendor/gsap.min.js" defer></script>
<script type="module" src="/survey/survey.js" onerror="window.surveyFallback()"></script>"""
    span = data["span"]
    chips = "".join(f'<button type="button" data-id="{p["id"]}"><span>{p["year"]}</span> {esc(p["short"])}</button>' for p in data["places"])
    body = add_resume_anchors(to_html(page["body"]), data)
    return f"""{head_html(page, f"{FONTS_MAP}&family={FONTS_BASE}", extra)}<body class="home">
<a id="view-toggle" class="view-toggle" href="/?list">List view</a>
{TOGGLE_SCRIPT}
<div id="survey">
<div id="map" role="application" aria-label="Map of Cobus Meyer's work. West to east is time. South to north is hardware to software."></div>
<div id="years" aria-hidden="true"></div>
<div class="axis" id="axN" aria-hidden="true">↑ SOFTWARE</div>
<div class="axis" id="axS" aria-hidden="true">↓ HARDWARE</div>
<div id="frame"></div>
<section id="title" aria-label="About this map">
<p id="name" role="heading" aria-level="1">{SITE['name']}</p>
<p class="sub">Survey of work, {span['from']} to {int(data['now'])}</p>
<p id="tag">{esc(SITE['tagline'])}</p>
<div class="ctl"><nav id="links" aria-label="Contact">{contact_links(has_cv)}</nav>
<details id="legend">
<summary>How to read this map</summary>
<ul>
<li><b>West to east:</b> time, left to right.</li>
<li><b>South to north:</b> hardware up to software.</li>
<li><b>Width of the ground:</b> how long it lasted.</li>
<li><b>Red line:</b> the order I started things in.</li>
<li class="keys"><b>Keys:</b> arrows move between places, Enter opens one, T tilts, Esc shows the full map.</li>
</ul>
</details></div>
</section>
<p id="hint">Drag to move. Tap a place to read about it.</p>
<p id="west" aria-hidden="true">← Earlier work</p>
<div id="controls" role="group" aria-label="Map controls">
<button type="button" id="tilt" aria-pressed="false">Tilt</button>
<button type="button" id="zoom-in" aria-label="Zoom in"><span aria-hidden="true">+</span> Zoom in</button>
<button type="button" id="zoom-out" aria-label="Zoom out"><span aria-hidden="true">−</span> Zoom out</button>
</div>
<nav id="log" aria-label="Places in date order"><button type="button" id="full">Full map</button>{chips}</nav>
<article id="note" aria-live="polite"></article>
<div id="wipe" aria-hidden="true"></div>
</div>
<div id="resume">
{header_html(True, has_cv)}
<main>
{body}
</main>
{footer_html("index")}
</div>
</body>
</html>
"""


def world_head_script(slug: str) -> str:
    return f"""<script>
(function () {{
  var d = document.documentElement;
  d.classList.add('js');
  try {{
    if (sessionStorage.getItem('survey-wipe') === {json.dumps(slug)}) {{
      d.classList.add('arriving');
      setTimeout(function () {{ d.classList.remove('arriving'); }}, 2500);
    }}
  }} catch (e) {{}}
}})();
</script>"""


def split_highlights(meta: dict, body: str) -> tuple:
    """Lift the section named by `highlights` out of a body, as (body without it, title, [(label, text)]).

    The section stays in the page's markdown. Only the HTML moves it, from the article to the hero.
    """
    title = meta.get("highlights")
    if not title:
        return body, None, []
    source = f"{meta['slug']}.md"
    m = re.search(rf"^## {re.escape(title)}\n+(.*?)(?=^## |\Z)", body, re.S | re.M)
    lines = [line for line in m.group(1).splitlines() if line.strip()] if m else []
    if not lines:
        raise BuildError(f"{source}: highlights says '{title}', but no section with '- **Label.** text' bullets has that heading")
    items = []
    for line in lines:
        hit = re.fullmatch(r"- \*\*(.+?)\.\*\* (.+)", line)
        if not hit:
            raise BuildError(f"{source}: under '{title}', every line must be a '- **Label.** text' bullet, but this is not: {line[:70]}")
        if re.search(r"[*`\[\]]", "".join(hit.groups())):
            raise BuildError(f"{source}: bullets under '{title}' are set as plain text, so inline markdown would show literally: {line[:70]}")
        items.append(hit.groups())
    return body[:m.start()] + body[m.end():], title, items


def color_ramp(stops: list, n: int) -> list:
    """n colours spaced evenly along a list of hex stops, first stop to last, so any number of items has a colour."""
    rgb = [[int(c[k:k + 2], 16) for k in (1, 3, 5)] for c in stops]
    out = []
    for i in range(n):
        pos = i / (n - 1) * (len(rgb) - 1) if n > 1 else 0
        k = min(int(pos), len(rgb) - 2) if len(rgb) > 1 else 0
        f = pos - k
        a, b = rgb[k], rgb[min(k + 1, len(rgb) - 1)]
        out.append("#" + "".join(f"{round(x + (y - x) * f):02X}" for x, y in zip(a, b)))
    return out


def render_place(page: dict, has_cv: bool, data: dict, blob: str) -> str:
    meta, slug, body = page["meta"], page["meta"]["slug"], page["body"]
    body, built_title, built_items = split_highlights(meta, body)
    places = data["places"]
    i = next(k for k, p in enumerate(places) if p["id"] == slug)
    p, n = places[i], len(places)
    prev, nxt, jump = places[(i - 1) % n], places[(i + 1) % n], places[(i + n // 2) % n]
    scene = SCENES[p["scene"]]
    is_article = p["article"]

    families = list(scene["families"])
    if is_article:
        families = [FONTS_BASE] + [f for f in families if not f.startswith("JetBrains")]
    fonts = "&family=".join(families + [FONT_UI])
    extra = f"""<link rel="stylesheet" href="/worlds/worlds.css">
<style>.arriving #wipe {{ position: fixed; inset: 0; z-index: 100; background: {p['bg']}; }}</style>
<meta name="theme-color" content="{p['bg']}">
{world_head_script(slug)}
{blob}
<script src="/vendor/gsap.min.js" defer></script>
<script type="module" src="/worlds/world.js"></script>
<script type="module" src="/worlds/scenes/{p['scene']}.js"></script>"""

    kicker = " · ".join(x for x in (p["kind"], p["org"] if p["org"] != p["short"] else "", p["dates"], p["where"]) if x)
    # On the case study the article's own h1 comes first, so the hero's name is not a heading.
    heading = "p" if is_article else "h1"
    cta = f'<a class="cta" href="{attr(p["link"]["href"])}">{esc(p["link"]["label"])}</a>' if p["link"] else ""
    cue = '<a class="cta scroll-cue" href="#article">What I worked on and learned ↓</a>' if is_article else ""
    contact = f'<div class="contact">{contact_links(has_cv)}<span>{SITE["email"]}</span></div>' if scene.get("contact") else ""
    current = ' class="cur" aria-current="page"'
    dial = "".join(
        f'<a href="{o["url"]}" data-id="{o["id"]}"{current if o["id"] == slug else ""}>{esc(o["short"])} <span>{o["year"]}</span></a>'
        for o in places)
    article = f"""{header_html(False, has_cv)}
<main id="article">
{to_html(body)}
</main>
""" if is_article else ""
    def copy(after_text: str) -> str:
        return f"""<div class="copy">
<p class="kicker">{esc(kicker)}</p>
<{heading} class="world-name">{esc(p['short'])}</{heading}>
<p class="role">{esc(p['role'])}</p>
<p class="text">{esc(p['text'])}</p>
{after_text}
</div>"""
    if built_items:
        # A page with highlights is a core sample: one earth band per highlight, with the scene's illustration
        # and the way into the article together in a rail beside them.
        colours = color_ramp(scene.get("ramp", [p["bg"]]), len(built_items))
        bands = "".join(f'<li style="--band:{colour};--i:{k}"><strong>{esc(label)}</strong> <span>{esc(text)}</span></li>'
                        for k, (colour, (label, text)) in enumerate(zip(colours, built_items)))
        built = f'<section class="built" aria-labelledby="built-title"><p class="built-title" id="built-title">{esc(built_title)}</p><ul>{bands}</ul></section>'
        rail = f'<div class="rail">{scene.get("extra", "")}{cue}</div>' if scene.get("extra") or cue else ""
        hero = f"""<div class="core">
<div class="surface"><a class="who" href="/">{SITE['name']}</a></div>
{copy(cta + contact)}
{built}
{rail}
</div>"""
    else:
        hero = f"""{scene.get('extra', '')}
{copy(cta + cue + contact)}
"""
    html_attrs = f' style="--w-bg:{p["bg"]};--w-ink:{p["ink"]};--w-accent:{p["accent"]};background:{p["bg"]}"'
    return f"""{head_html(page, fonts, extra, html_attrs)}<body class="world-page{' article' if is_article else ''}{' strata' if built_items else ''}" data-id="{slug}" data-scene="{p['scene']}">
<div id="wipe" aria-hidden="true"></div>
<section id="world" class="world w-{p['scene']}"{'' if is_article else ' role="main"'} style="--bg:{p['bg']};--ink:{p['ink']};--accent:{p['accent']};background:{p['bg']};color:{p['ink']}">
<canvas id="world-canvas" aria-hidden="true"></canvas>
{hero}
</section>
<nav id="world-nav" aria-label="Move between places">
<a id="nav-map" href="/#{slug}" data-id="{slug}"><span aria-hidden="true">←</span> Map</a>
<a id="nav-prev" rel="prev" href="{prev['url']}" data-id="{prev['id']}"><span aria-hidden="true">←</span> Previous<span class="nav-to">: {esc(prev['short'])}</span></a>
<a id="nav-next" rel="next" href="{nxt['url']}" data-id="{nxt['id']}">Next<span class="nav-to">: {esc(nxt['short'])}</span> <span aria-hidden="true">→</span></a>
<a id="nav-jump" href="{jump['url']}" data-id="{jump['id']}">Jump somewhere</a>
</nav>
<nav id="dial" aria-label="All places">{dial}</nav>
{article}{footer_html(slug)}
</body>
</html>
"""


def validate(pages: list) -> dict:
    """Every failure is reported at once, before dist is touched."""
    errors = []
    slugs = [p["meta"]["slug"] for p in pages]
    errors += [f"duplicate slug: {s}" for s in sorted({s for s in slugs if slugs.count(s) > 1})]
    for p in pages:
        if not p["meta"].get("summary"):
            errors.append(f"{p['meta']['slug']}.md: missing summary in front matter")
        try:
            split_highlights(p["meta"], p["body"])
        except BuildError as e:
            errors.append(str(e))
    home = next((p for p in pages if p["meta"]["slug"] == "index"), None)
    if not home:
        errors.append("content/index.md is missing")
    data = build_places(pages, home["body"] if home else "", errors)
    if errors:
        raise BuildError("\n".join(f"  - {e}" for e in errors))
    return data


def clean_dist():
    """Empty the output directory, refusing one that does not look like a build."""
    if DIST.exists():
        if any(DIST.iterdir()) and not (DIST / "llms.txt").exists():
            raise BuildError(f"  - {DIST} is not empty and has no llms.txt, so it does not look like a build. Refusing to delete it.")
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)


def main():
    pages = [parse(p) for p in sorted(CONTENT.glob("*.md"))]
    pages.sort(key=lambda p: (p["meta"]["slug"] != "index", p["meta"].get("date", "")), reverse=False)
    try:
        data = validate(pages)
        clean_dist()
    except BuildError as e:
        sys.exit(f"build failed:\n{e}")
    if STATIC.exists():
        shutil.copytree(STATIC, DIST, dirs_exist_ok=True)
    has_cv = (DIST / "cv.pdf").exists()
    blob = places_blob(data)
    place_ids = {p["id"] for p in data["places"]}

    for page in pages:
        slug = page["meta"]["slug"]
        out = DIST / ("index.html" if slug == "index" else f"{slug}/index.html")
        out.parent.mkdir(parents=True, exist_ok=True)
        if slug == "index":
            text = render_home(page, has_cv, data, blob)
        elif slug in place_ids:
            text = render_place(page, has_cv, data, blob)
        else:
            text = render_plain(page, has_cv, blob)
        out.write_text(text, encoding="utf-8")
        (DIST / f"{slug}.md").write_text(page["body"], encoding="utf-8")

    lines = [f"# {SITE['name']}", "", f"> {SITE['tagline']}", "",
             "Most of Cobus's code lives in private company repositories, so his work is described in write-ups rather than shared as source.", "",
             "## Pages", ""]
    for p in pages:
        m = p["meta"]
        lines.append(f"- [{m.get('title', SITE['name'])}]({md_url(m['slug'])}): {m.get('summary', '')}")
    if has_cv:
        lines.append("- [CV (PDF)](/cv.pdf)")
    lines += ["", "## Contact", "", f"- Email: {SITE['email']}", f"- [LinkedIn]({SITE['linkedin']})", f"- [GitHub]({SITE['github']})", ""]
    (DIST / "llms.txt").write_text("\n".join(lines), encoding="utf-8")
    (DIST / "llms-full.txt").write_text("\n\n---\n\n".join(p["body"] for p in pages), encoding="utf-8")
    print(f"built {len(pages)} pages, {len(data['places'])} places -> {DIST}")


if __name__ == "__main__":
    main()
