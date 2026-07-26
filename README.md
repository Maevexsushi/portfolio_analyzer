# Portfolio Analyzer

Paste a URL or upload a file, and get a scored report on what a hiring reviewer would
see: what is missing, how deep the work reads, dead links, and a ranked list of what to
fix. Exports the whole thing as a PDF.

Built for job applicants checking their own material before they send it.

Three things can be analyzed, and they are three separate tabs — not one upload box that
guesses. Each is scored against its own set of checks:

| Tab | What it is | What it is judged on |
| --- | --- | --- |
| **Website** | a portfolio site | sections, projects, skills, links, design, performance |
| **Resume** | your CV — PDF, DOCX, or an image | machine readability, experience & impact, structure, contact, skills, writing |
| **Portfolio file** | the deck you actually send | the work, presentation, deliverability, contact, skills |

And it is not a developer tool. The analyzer detects the applicant's field — design,
writing, healthcare, trades, marketing, education, and others — and judges the work
against that field's expectations. See [Fields](#fields).

```bash
npm install
cp .env.example .env.local   # optional: add a Groq key for the AI review
npm run dev                  # http://localhost:3000
```

## What it does

| Feature | Where |
| --- | --- |
| Home page + intake | [src/app/page.tsx](src/app/page.tsx), [src/components/IntakeTabs.tsx](src/components/IntakeTabs.tsx) |
| URL analyzer | [src/components/UrlForm.tsx](src/components/UrlForm.tsx) |
| File upload | [src/components/UploadForm.tsx](src/components/UploadForm.tsx), [src/app/api/analyze/file/route.ts](src/app/api/analyze/file/route.ts) |
| Document intake (PDF / DOCX / OCR) | [src/lib/intake/](src/lib/intake/) |
| Field detection & profiles | [src/lib/discipline/](src/lib/discipline/) |
| Resume analyzer | [src/lib/document/](src/lib/document/) |
| Portfolio score (weighted, 0–100) | [src/lib/analyzer/score.ts](src/lib/analyzer/score.ts) |
| Sections checker | [src/lib/analyzer/sections.ts](src/lib/analyzer/sections.ts) |
| Project analyzer | [src/lib/analyzer/projects.ts](src/lib/analyzer/projects.ts) |
| Skills detector | [src/lib/analyzer/skills.ts](src/lib/analyzer/skills.ts) |
| Link checker | [src/lib/analyzer/links.ts](src/lib/analyzer/links.ts) |
| Design review | [src/lib/analyzer/design.ts](src/lib/analyzer/design.ts) |
| Performance report | [src/lib/analyzer/performance.ts](src/lib/analyzer/performance.ts) |
| Suggestions generator | [src/lib/analyzer/suggestions.ts](src/lib/analyzer/suggestions.ts) |
| AI review ("Your edge") | [src/lib/ai/review.ts](src/lib/ai/review.ts), [src/lib/ai/groq.ts](src/lib/ai/groq.ts) |
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

6. **Read** ([src/lib/ai/review.ts](src/lib/ai/review.ts)) — optional, and the only step
   that leaves the machine. See below.

Category weights: projects 28%, sections 18%, design 16%, skills 14%, links 14%,
performance 10%. The AI review carries no weight and changes no score.

## The report

One feature per tab. A full report is seven to nine panels of dense findings; stacked
on a single page that is a very long scroll where the panel you want is always below
the fold and nothing tells you where you are.

Each tab carries a badge counting the checks inside it that are not passing, so the
problems are visible before anything is opened — which is the one thing a tab strip
otherwise costs you against a single scroll.

Three properties it has to keep to be better than what it replaced:

- **Deep links still work.** The tab id is the URL hash, so `/r/<id>#ats` opens on
  Machine readability. Switching tabs rewrites the hash via `replaceState`, so the URL
  stays copyable without one history entry per click.
- **Printing shows everything.** A tab is a screen affordance; on paper, printing one
  section and dropping the other eight would turn a navigation choice into data loss.
  `@media print` reveals every panel, drops the strip, and gives each panel its own
  heading. Verified: the printed report is 10 pages, not 2.
- **The keyboard works.** Arrow keys move within the strip, Home/End jump to the ends,
  and only the active tab is in the page tab order — the ARIA tabs pattern, not a row
  of buttons wearing tab roles.

One subtlety worth knowing if you touch the print styles. The rule that un-hides the
panels lives inside `@layer base`, not at the bottom of the file with the rest of the
print block, because for `!important` declarations **cascade layer order is inverted**:
a layered `!important` beats an unlayered one regardless of specificity. Tailwind's
preflight `[hidden] { display: none !important }` is in that layer, so the same
override written outside it loses silently and prints a one-tab report.

## Fields

This started as a developer tool, and every judgement in it quietly assumed one. A
portfolio without a GitHub link lost points. "Projects" meant repositories. The skills
taxonomy was a list of frameworks. Applied to an illustrator or a nurse that is not a
strict review — it is a wrong one, and it tells people to fix things that were never
broken.

A **discipline profile** ([src/lib/discipline/profiles.ts](src/lib/discipline/profiles.ts))
is the set of expectations one field actually has: what its practitioners call their
work, where they publish proof of it, which skills read as credible, and what a reviewer
in that field looks for first.

| Field | Proof of work it expects | A unit of work is a… |
| --- | --- | --- |
| Software & engineering | a code host | project |
| Design & UX | Behance, Dribbble, a portfolio site | case study |
| Data & analytics | notebooks, Kaggle, a repo | analysis |
| Product & project management | — | product story |
| Marketing & growth | campaign samples, published work | campaign |
| Writing & content | published clips | piece |
| Photography, film & visual media | a reel or gallery | piece |
| Business, finance & operations | — | engagement |
| Education & research | — (publications count as bonus) | programme |
| Healthcare & social care | — | placement |
| Skilled trades & technical services | — | job |
| Something else | — | project |

Detection reads the document's own vocabulary and reports how sure it is. Two details
matter more than the arithmetic:

- **A weak signal is reported as weak.** Below ~25% confidence it falls back to the
  general profile rather than committing to a guess, because the profile decides which
  checks run — a confident wrong answer makes every finding below it wrong invisibly.
- **It shows its working.** The report prints the terms it matched ("figma, wireframe,
  usability test") and the runner-up field, and the upload form has a dropdown to
  override it outright. A detector you cannot argue with is one you have to either
  accept whole or abandon.

Repeated words are damped, so a designer who writes "brand" twenty times does not get
filed under marketing.

## The AI review ("Your edge")

Every other check in this project measures *form*: is there a contact section, do the
links resolve, how heavy is the page. None of them can read a project description and
tell you it is the strongest thing on the site and it is buried at the bottom. That is
what this step is for — what the work demonstrates, what to lead with, and where the page
undersells real work.

Set a key and it runs on every analysis:

```bash
# .env.local — gitignored
GROQ_API_KEY=gsk_...          # https://console.groq.com/keys
GROQ_MODEL=openai/gpt-oss-120b   # optional; any Groq text model
AI_TIMEOUT_MS=20000              # optional
```

Groq speaks the OpenAI chat-completions dialect, so there is no SDK — one `fetch` against
one endpoint is the whole client. Adds roughly a second to an analysis.

How it is kept honest:

- **The model gets a digest, not the page.** It reads the already-extracted evidence —
  project titles and descriptions, detected skills, headings, contact links, and a capped
  slice of the visible copy — so it spends its attention on the work rather than on markup,
  and the prompt cannot be inflated by a huge page.
- **Every claim is shown next to its evidence.** A highlight that comes back without the
  supporting quote is dropped rather than rendered — an unsupported confident sentence is
  the one failure mode that would make this feature worse than not having it.
- **Its output is untrusted input.** `normalizeReview` re-validates every field, caps every
  length and list, and survives wrong types, exactly like the fetched page does.
- **It is strictly additive.** No key, a rate limit, a timeout, or unreadable JSON all
  degrade to `ai: null` plus a caveat on an otherwise complete report. The panel is
  unscored, and names the model and timestamp, because a reader has to be able to discount
  it.

**Privacy:** with a key set, your page content is sent to Groq. Untick "AI read of your
work" on the form, or leave `GROQ_API_KEY` unset, and nothing leaves the machine except the
requests to your own site.

### Known limits

- **OCR is approximate.** Images are accepted so that nobody is turned away, but Tesseract
  gets words wrong and drops others — in testing it silently skipped a name set at 34pt.
  Confidence travels with the report and every OCR'd document is told to send a PDF
  instead. Do not trust a quoted phrase from an image upload.
- **Field detection can be wrong.** It reads vocabulary, so a career changer or a hybrid
  role can land in the wrong profile. The report shows its evidence and its confidence,
  and the field can be overridden on the upload form.
- **Resume/portfolio classification is no longer a routing decision.** Each tab pins the
  kind, so a misread cannot silently send your CV through the portfolio checks. The
  classifier only warns when it confidently disagrees with the tab you chose. The
  inference path still exists for API callers that omit `documentKind`, and there it
  carries the old caveat.
- **ATS claims are bounded.** There are hundreds of applicant tracking products and they
  differ. What is asserted is only what follows from the extracted text itself — if the
  text is not there, no parser can read it. Beyond that it does not guess.
- **No browser.** The analyzer reads the HTML your server sends. A portfolio that renders
  its projects client-side will score 0 on projects — the report says so, and notes that
  crawlers and link previews have the same blind spot.
- **One page at a time.** If the homepage links to `/projects`, the report tells you to
  analyze that URL directly rather than guessing.
- **No paint metrics.** Performance is measured from response timing, transfer sizes, and
  headers. It never claims a Lighthouse score. "Measured page weight" is a floor: it covers
  the document plus the assets that were sampled.
- **Contrast is best-effort, and says when it fails.** It resolves CSS variables, utility
  classes on the document root, and both themes, but colours applied at runtime (inline
  styles written by JS) cannot be reached. In that case the report says it could not
  determine contrast rather than implying a pass, and the check carries no score weight —
  the analyzer's blind spot should not cost the author points.
- **Palette is reported, not graded.** Counting colours in compiled CSS cannot tell a
  sprawling palette from a rich, deliberate one — a syntax-highlighting theme alone
  contributes dozens. What it reports instead is whether colours are centralised as
  custom properties.
- **Heuristics.** Project detection looks for repeated sibling structures, since utility
  CSS means class names usually say nothing. It is checked against real portfolios, but it
  will misjudge unusual markup.

## Uploads

Not every portfolio is a website, and treating a PDF as a lesser input would exclude most
of the fields above. Upload is a first-class path with its own checks.

**Resume and portfolio are separate tabs.** They are judged by almost disjoint checks —
one is asked whether a parser can read it and whether the bullets carry numbers, the
other whether the work is explained and whether the file can be emailed. Behind a single
"File" tab the tool had to infer which it was holding, and a wrong inference produces a
confidently wrong report: a photographer's deck told to add quantified bullet points.

So the tab settles it. Nothing uploaded through the site is classified by inference, and
the report is always scored the way the person asked. The classifier still runs, but its
only remaining job is to disagree out loud: if you upload through **Resume** and the file
reads like a portfolio at 60%+ confidence, the report says so at the top and names the
evidence, while still scoring it as a resume. The person knows better than the heuristic;
they just need telling when the two diverge.

**Formats.** PDF, DOCX, and images (PNG/JPG/WEBP), decided by sniffing the file header —
never the extension or the browser's declared MIME type, both of which are routinely
wrong and trivially forged. Recognised-but-unusable formats get a specific refusal: a
legacy `.doc` is told to export a PDF rather than "unsupported file".

**What each format gives up.** A PDF is read exactly and has real pages. A DOCX carries
real heading styles — stronger evidence of a section than any text heuristic — but has no
pagination, so page-based checks are skipped and say so. An image is run through OCR: some
words come back wrong, and the report treats the file as a failure regardless of how well
it reads, because no employer's system can search it.

**The resume checks worth having.** Most of it you could eyeball. Two things you cannot:

- **Machine readability** — whether an applicant tracking system will store your resume as
  text or as an empty record. Checked against the extracted text layer, which is the same
  bytes the parser gets. This is the highest-impact fix in the tool (+25) because failing
  it makes every other quality invisible.
- **Quantification rate** — what share of your bullets carry a number. It tracks how senior
  a resume reads better than anything else measurable from text, and almost nobody counts
  it on their own.

**Nothing is stored.** The uploaded bytes are extracted in memory and dropped; only the
findings are saved. A resume is the most personal document most people own, and keeping
one would be a liability with no matching benefit. The visible consequence is that an
upload cannot be re-analyzed from history the way a URL can — you upload it again.

## API

```
POST   /api/analyze       { url, checkLinks?, ai?, save?: boolean } -> { result, trend }
POST   /api/analyze/file  multipart: file, documentKind?, discipline?, ai?, checkLinks?, save?
                          -> { result, trend, detectedKind, classificationConfidence }
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
- **Colour** — hex, `rgb()`, `hsl()`, `oklch()`, Tailwind's nested-function alpha
  (`rgb(15 23 42/var(--tw-bg-opacity))`), `var()` chains with fallbacks, and circular
  tokens that must not hang the analysis.
- **Contrast** — resolved from tokens, from utility classes on `<html>`/`<body>`, and per
  theme, so a readable light theme cannot hide an unreadable dark one.
- **AI review boundaries** — the model call is not tested (a non-deterministic network
  round trip), but the two pure functions either side of it are: the digest carries the
  project evidence and stays capped, and a response is coerced into a type that drops
  unsupported claims and survives wrong types without throwing.
- **Intake** — format sniffed from bytes (a plain zip is not a .docx); PDF line structure
  and page geometry survive; a text-free PDF is refused with the fix attached; a sparse
  portfolio page is *not*; DOCX heading styles survive the flattening; email domains are
  not mistaken for links.
- **Resume accuracy** — a date range is not read as a phone number, a job title is not
  read as a name, a referee's number on page two is not read as yours, bullets without
  glyphs still count, and ordering is left unjudged when there is too little to go on.
- **Declared kind wins** — a portfolio deck uploaded through the Resume tab is still
  scored as a resume, and still warned about; a resume uploaded as a resume gets no
  warning at all, because a false alarm on every upload trains people to ignore the one
  that matters.
- **Fields** — seven disciplines detected from their own vocabulary (including a brand
  designer, which an earlier UX-only signal list missed); thin evidence falls back to
  general; a repeated word does not outweigh a field's real vocabulary; and the same page
  scores *higher* as a designer than as a developer, because Behance is proof of work and
  a missing GitHub is not a flaw.

Document fixtures are synthesised at test time — real PDFs via pdf-lib, real .docx via a
small store-only ZIP writer in [test/doc-helpers.ts](test/doc-helpers.ts). A committed
binary fixture cannot be reviewed in a diff, and a test case that reads as the resume it
is testing is worth the forty lines.

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

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · Cheerio · pdf-lib ·
unpdf (PDF text) · mammoth (DOCX) · tesseract.js (OCR).

No database, no auth. One optional API key (Groq), used through `fetch` rather than an SDK;
without it every other feature works unchanged.

`tesseract.js` and `unpdf` are listed in `serverExternalPackages`. Both resolve a worker
script from their own `__dirname` at runtime, and once bundled that path becomes a build
artefact — the worker never starts and an upload hangs instead of failing. OCR language
models download on first use into `.tesseract-cache/` (gitignored, ~5 MB).
