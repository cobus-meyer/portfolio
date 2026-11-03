# cobus-meyer portfolio

Personal site and work write-ups. Built for people and for agents: every page is also published as markdown, with an `llms.txt` index.

The home page is a map of the work, with the full résumé as its list view. Each role has its own detail page. Everything reads without JavaScript.

## Add or edit a page

1. Write `content/<slug>.md` with front matter (`title`, `slug`, `summary`, `date`). It appears at `/<slug>/` and `/<slug>.md`, and is listed in `llms.txt` automatically. The build fails if a page has no `summary`.
2. Link it from the matching role in `content/index.md`.
3. Optional diagram: write ASCII art in a ```` ```flow:<name> ```` block and put the SVG version in `diagrams/<name>.html`. Agents read the ASCII; people see the SVG.
4. Optional CV: drop `static/cv.pdf` and a CV link appears in the header and `llms.txt`.

## Add a role

A role is one section in `content/index.md` and one file in `content/`. Together they give it an island, a chip, a list entry and a detail page.

1. In `content/index.md`, add the section with its link line:

   ```markdown
   ### Org · Role
   *Jan 2020 – Mar 2021 · City*

   The paragraph.

   [Open Short →](/<slug>/)
   ```

2. Write `content/<slug>.md`. The body is the heading, the byline and the same paragraph, word for word:

   ```markdown
   ---
   title: "Org · Role"
   slug: <slug>
   summary: One factual sentence built from the paragraph.
   date: 2026-11-02
   kind: Experience
   org: Org
   short: Short
   role: Role
   dates: Jan 2020 – Mar 2021
   where: City
   start: 2020-01
   end: 2021-03
   lat: .40
   ry: 100
   note: "two · short notes"
   tint: "#7490CC"
   glyph: "M3 3h14v14H3z"
   scene: tags
   ---

   # Org

   *Role · Jan 2020 – Mar 2021 · City*

   The paragraph.
   ```

| Field | Meaning |
| --- | --- |
| `kind` | `Experience`, `Venture` or `Education`. A file with a `kind` is a place. |
| `org`, `role`, `dates`, `where` | Must match the index.md heading and date line. `where` may be empty. |
| `short` | Name on the island, the chip and the detail page. |
| `start`, `end` | `YYYY` (placed at January) or `YYYY-MM`. `end` may be `present`. Months sit at mid-month, so a handoff in one month does not count as overlap. |
| `lat`, `ry` | Island position south to north (0 top, 1 bottom) and its height. |
| `note`, `tint`, `glyph` | Label note, colour on the map, and an SVG path for a 20 by 20 box. |
| `scene` | A key of `SCENES` in `build.py`. It sets the colours and fonts of the world. |
| `link_href`, `link_label` | Optional outside link. |
| `card` | Optional shorter card text. Must be a verbatim part of the paragraph. |
| `article` | `true` if the body is a full article shown under the hero. The verbatim check then does not apply to the body. |
| `highlights` | Optional heading of a section of `- **Label.** text` bullets. They appear on the hero as earth bands instead of in the article, one per bullet, and stay in the markdown. Band colours are spaced along the scene's `ramp` in `build.py`, so any number of bullets works. |

The build fails with a clear message if the paragraph, heading or byline differ from `content/index.md`, if the dates differ, if the link line is missing, or if the scene is unknown.

## How the map works

`build.py` writes the data for every place into each page as `<script type="application/json" id="places">`, sorted by start date. `static/survey/` reads it on the home page:

- `survey.js` builds the map with MapLibre. West to east is time, south to north is hardware to software.
- `terrain-worker.js` generates the height field and contours off the main thread. The noise is seeded, so coastlines never change.
- An inline script in `<head>` adds the class `map-on` only if WebGL2 exists and `?list` is absent. Otherwise, and whenever the map fails to start, the résumé is the page. `/?list` always shows the résumé.

## How the scenes work

Each detail page has real HTML copy on a solid world colour, then one canvas scene on top. A world is an entry in `SCENES` in `build.py` (colours, fonts, any extra illustration HTML), a module at `static/worlds/scenes/<scene>.js`, and a `w-<scene>` block in `static/worlds/worlds.css`. `static/worlds/world.js` runs the shared loop and the navigation. A page loads only its own scene module and its own Google Font family.

`static/vendor/` holds the self-hosted libraries with their licences in `static/vendor/licenses/`. Nothing loads from a CDN at runtime except the Google Fonts stylesheet.

## Build locally

```bash
pip install -r requirements.txt
python3 build.py        # writes dist/
python3 -m http.server -d dist 8000
```

Set `PORTFOLIO_DIST` to build somewhere other than `dist/`.

## Deploy (Cloudflare Pages, free)

Connect this repo in Cloudflare → Workers & Pages → Create → Pages → Connect to Git, then set:

- Framework preset: None
- Build command: `pip install -r requirements.txt && python3 build.py`
- Output directory: `dist`

Cloudflare reads the Python version from `.python-version`. Every push to `main` redeploys.
