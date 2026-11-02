"""Static site builder for Cobus Meyer's portfolio.

Every content/<slug>.md becomes a page:
  index.md -> dist/index.html          (home)
  sage.md  -> dist/sage/index.html     (page at /sage/)
Each page is also published as raw markdown (/index.md, /sage.md) for agents,
and llms.txt + llms-full.txt are generated from the pages' front matter.

A fenced block written as ```flow:<name> stays ASCII art in the markdown and is
swapped for diagrams/<name>.html in the HTML page.

Run: pip install -r requirements.txt && python3 build.py
"""
import html
import json
import re
import shutil
from pathlib import Path

import markdown

ROOT = Path(__file__).parent
CONTENT, DIAGRAMS, STATIC, DIST = (ROOT / d for d in ("content", "diagrams", "static", "dist"))

SITE = {
    "name": "Cobus Meyer",
    "tagline": "Product engineer and technical founder in Cape Town. I build AI-native products and the things agents use.",
    "email": "meyerje94@gmail.com",
    "linkedin": "https://www.linkedin.com/in/cobusmeyer",
    "github": "https://github.com/cobus-meyer",
}


def parse(path: Path) -> dict:
    text = path.read_text()
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
        svg = (DIAGRAMS / f"{name}.html").read_text()
        out = re.sub(rf"(<p>)?<!--FLOW:{name}-->(</p>)?", lambda _: svg, out)
    return out


def page_url(slug: str) -> str:
    return "/" if slug == "index" else f"/{slug}/"


def md_url(slug: str) -> str:
    return f"/{slug}.md"


def render(page: dict, has_cv: bool) -> str:
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
    cv = '<a href="/cv.pdf">CV</a>' if has_cv else ""
    nav_home = "" if is_home else f'<a href="/" class="home">{SITE["name"]}</a>'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<link rel="alternate" type="text/markdown" href="{md_url(slug)}" title="Markdown version">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">{json.dumps(ld)}</script>
</head>
<body class="{'home' if is_home else 'article'}">
<header><nav>{nav_home}<span class="links">{cv}<a href="{SITE['github']}">GitHub</a><a href="{SITE['linkedin']}">LinkedIn</a><a href="mailto:{SITE['email']}">Email</a></span></nav></header>
<main>
{to_html(page["body"])}
</main>
<footer>
<p>{SITE['email']} · Cape Town, South Africa</p>
<p class="agents">For agents: this page as markdown at <a href="{md_url(slug)}">{md_url(slug)}</a>; site index at <a href="/llms.txt">/llms.txt</a>.</p>
</footer>
</body>
</html>
"""


def main():
    pages = [parse(p) for p in sorted(CONTENT.glob("*.md"))]
    pages.sort(key=lambda p: (p["meta"]["slug"] != "index", p["meta"].get("date", "")), reverse=False)
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    if STATIC.exists():
        shutil.copytree(STATIC, DIST, dirs_exist_ok=True)
    has_cv = (DIST / "cv.pdf").exists()

    for page in pages:
        slug = page["meta"]["slug"]
        out = DIST / ("index.html" if slug == "index" else f"{slug}/index.html")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(render(page, has_cv))
        (DIST / f"{slug}.md").write_text(page["body"])

    lines = [f"# {SITE['name']}", "", f"> {SITE['tagline']}", "",
             "Most of Cobus's code lives in private company repositories, so his work is described in write-ups rather than shared as source.", "",
             "## Pages", ""]
    for p in pages:
        m = p["meta"]
        lines.append(f"- [{m.get('title', SITE['name'])}]({md_url(m['slug'])}): {m.get('summary', '')}")
    if has_cv:
        lines.append("- [CV (PDF)](/cv.pdf)")
    lines += ["", "## Contact", "", f"- Email: {SITE['email']}", f"- [LinkedIn]({SITE['linkedin']})", f"- [GitHub]({SITE['github']})", ""]
    (DIST / "llms.txt").write_text("\n".join(lines))
    (DIST / "llms-full.txt").write_text("\n\n---\n\n".join(p["body"] for p in pages))
    print(f"built {len(pages)} pages -> {DIST}")


if __name__ == "__main__":
    main()
