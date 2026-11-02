# cobus-meyer portfolio

Personal site and work write-ups. Built for people and for agents: every page is also published as markdown, with an `llms.txt` index.

## Add or edit a page

1. Write `content/<slug>.md` with front matter (`title`, `slug`, `summary`, `date`). It appears at `/<slug>/` and `/<slug>.md`, and is listed in `llms.txt` automatically.
2. Link it from the matching role in `content/index.md`.
3. Optional diagram: write ASCII art in a ```` ```flow:<name> ```` block and put the SVG version in `diagrams/<name>.html`. Agents read the ASCII; people see the SVG.
4. Optional CV: drop `static/cv.pdf` and a CV link appears in the header and `llms.txt`.

## Build locally

```bash
pip install markdown
python3 build.py        # writes dist/
python3 -m http.server -d dist 8000
```

## Deploy (Cloudflare Pages, free)

Connect this repo in Cloudflare → Workers & Pages → Create → Pages → Connect to Git, then set:

- Build command: `pip install markdown && python3 build.py`
- Output directory: `dist`

Every push to `main` redeploys.
