# Portfolio Analyzer

Paste a portfolio URL, get a scored report on what a hiring reviewer would see: missing
sections, how deep the projects read, dead links, design and accessibility problems,
performance, and a ranked list of what to fix. Exports the whole thing as a PDF.

Built for job applicants checking their own portfolio before they send it.

```bash
npm install
npm run dev        # http://localhost:3000
```

## What it does

| Feature | Where |
| --- | --- |
| Home page + URL analyzer | [src/app/page.tsx](src/app/page.tsx), [src/components/UrlForm.tsx](src/components/UrlForm.tsx) |
| Portfolio score (weighted, 0–100) | [src/lib/analyzer/score.ts](src/lib/analyzer/score.ts) |
| Sections checker | [src/lib/analyzer/sections.ts](src/lib/analyzer/sections.ts) |
| Project analyzer | [src/lib/analyzer/projects.ts](src/lib/analyzer/projects.ts) |
| Skills detector | [src/lib/analyzer/skills.ts](src/lib/analyzer/skills.ts) |
| Link checker | [src/lib/analyzer/links.ts](src/lib/analyzer/links.ts) |
| Design review | [src/lib/analyzer/design.ts](src/lib/analyzer/design.ts) |
| Performance report | [src/lib/analyzer/performance.ts](src/lib/analyzer/performance.ts) |
| Suggestions generator | [src/lib/analyzer/suggestions.ts](src/lib/analyzer/suggestions.ts) |
| PDF report export | [src/lib/pdf.ts](src/lib/pdf.ts) |
| Analysis history | [src/lib/history.ts](src/lib/history.ts), [src/app/history/page.tsx](src/app/history/page.tsx) |

User authentication is not implemented — history is local and unauthenticated.

## How the analysis works

1. **Fetch** ([src/lib/fetcher.ts](src/lib/fetcher.ts)) — requests the page's HTML with a
   15 s budget, a 3 MB body cap, and redirects followed one hop at a time so every
   intermediate host is re-validated.
2. **Parse** ([src/lib/analyzer/context.ts](src/lib/analyzer/context.ts)) — one Cheerio
   pass builds the shared views (text, headings, metadata, inline CSS/JS sizes).
3. **Sample subresources** ([src/lib/analyzer/assets.ts](src/lib/analyzer/assets.ts)) —
   downloads up to 4 stylesheets (their text feeds the palette, typeface, and contrast
   checks) and HEADs up to 12 assets for transfer sizes.
4. **Analyze** — the six modules run against that context; link probing overlaps with the
   CPU-bound modules.
5. **Score and rank** — each module returns its own 0–100 score plus the evidence behind
   it; [score.ts](src/lib/analyzer/score.ts) weights them and
   [suggestions.ts](src/lib/analyzer/suggestions.ts) turns every failing check into one
   actionable fix with an estimated point value.

Category weights: projects 28%, sections 18%, design 16%, skills 14%, links 14%,
performance 10%.

### Known limits

- **No browser.** The analyzer reads the HTML your server sends. A portfolio that renders
  its projects client-side will score 0 on projects — the report says so, and notes that
  crawlers and link previews have the same blind spot.
- **One page at a time.** If the homepage links to `/projects`, the report tells you to
  analyze that URL directly rather than guessing.
- **No paint metrics.** Performance is measured from response timing, transfer sizes, and
  headers. It never claims a Lighthouse score. "Measured page weight" is a floor: it covers
  the document plus the assets that were sampled.
- **Heuristics.** Project detection looks for repeated sibling structures, since utility
  CSS means class names usually say nothing. It is checked against real portfolios, but it
  will misjudge unusual markup.

## API

```
POST   /api/analyze       { url, checkLinks?: boolean, save?: boolean } -> { result, trend }
GET    /api/history       -> { entries }
DELETE /api/history       -> clears all
GET    /api/history/:id   -> { result, trend }
DELETE /api/history/:id   -> deletes one
GET    /api/report/:id    -> application/pdf
```

Analysis fetches user-supplied URLs, so `fetchPage` refuses non-HTTP schemes, resolves each
hostname and rejects private, loopback, link-local, and carrier-NAT addresses (including
across redirects), and caps the response body.

## Storage

Analyses are written to `data/history.json` (gitignored), most recent first, capped at 50.
Writes are serialised in-process and land via temp-file rename. Delete the file to reset.

## Tests

```bash
npm test          # vitest run
npm run typecheck
```

The suite runs against HTML fixtures with no network, so it is fast and deterministic.
It exists because the checks fail in a specific way: each one recognises a couple of
idioms and quietly reports "not found" for every other way of doing the same thing. Each
test names a real mechanism found on a live portfolio, so a regression shows up as a
failing test rather than as advice the user has to disbelieve. Cases currently pinned:

- **Dark mode** — media query, `.dark` class (incl. minified and Tailwind's escaped
  variants), `data-theme`, `data-color-mode`, a visible toggle, and a `matchMedia` theme
  script. Plus negative cases: `.darkred` and `.dark-blue` are not themes.
- **Email contact** — `mailto:`, Gmail and Outlook compose URLs, an address in plain text
  (partial credit), and none at all.
- **Skills** — ambiguous words in prose ("express myself", "spring semester", "swift
  turnaround", "in jest", "rust-red") must not register as frameworks, while `Express.js`,
  `Spring Boot` and `SwiftUI` must, anywhere on the page.
- **Projects** — `<ul>/<li>`, `<article>` and `<div>` grids all detected; blog indexes,
  experience timelines and nav/footer lists rejected; stack names outside the taxonomy
  still counted.
- **Text extraction** — word boundaries survive server-rendered markup that carries no
  whitespace between elements.

## Testing against local fixtures

The SSRF guard blocks loopback addresses, so fixture testing needs an explicit opt-in that
only works outside production:

```bash
npx serve fixtures                       # or any static file server
ANALYZER_ALLOW_PRIVATE_HOSTS=1 npm run dev
```

[fixtures/strong-portfolio.html](fixtures/strong-portfolio.html) scores 97 (A+) and
[fixtures/thin-homepage.html](fixtures/thin-homepage.html) scores 19 (F) — a quick way to
check both ends of the scale after changing anything in the scoring.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · Cheerio · pdf-lib.
No database, no auth, no external API keys.
