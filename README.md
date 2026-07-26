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

A resume gets several things a plain score cannot: an AI rewrite that will not invent a
number, a check against a specific job posting with notes on how to close what's
missing, a cover letter reviewed or drafted from it, a preview of the exact fields a
parser extracts from it, and a side-by-side comparison against past versions. See
[Resume tools](#resume-tools).

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
| AI resume rewrite | [src/lib/ai/rewrite.ts](src/lib/ai/rewrite.ts), [src/components/panels/RewritePanel.tsx](src/components/panels/RewritePanel.tsx) |
| Job Match page + engine | [src/app/job-match/](src/app/job-match/), [src/lib/jobmatch/](src/lib/jobmatch/) |
| Rank several postings | [src/app/job-match/rank/](src/app/job-match/rank/), [src/lib/jobmatch/rank.ts](src/lib/jobmatch/rank.ts) |
| Company research briefing (AI) | [src/app/company-brief/](src/app/company-brief/), [src/lib/ai/companybrief.ts](src/lib/ai/companybrief.ts) |
| Skill-gap notes (AI) | [src/lib/ai/skillgap.ts](src/lib/ai/skillgap.ts) |
| ATS parse preview | [src/lib/document/parsepreview.ts](src/lib/document/parsepreview.ts) |
| Cover letter analyzer + AI generator | [src/lib/document/coverletter.ts](src/lib/document/coverletter.ts), [src/lib/ai/coverletter.ts](src/lib/ai/coverletter.ts) |
| Resume comparison | [src/lib/compare.ts](src/lib/compare.ts), [src/app/compare/page.tsx](src/app/compare/page.tsx) |
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

One feature per tab. A full report is anywhere from seven panels (a website) to over a
dozen (a resume, once job matching, the cover letter, and the improved draft are all
in play); stacked on a single page that is a very long scroll where the panel you want
is always below the fold and nothing tells you where you are.

Each tab carries a badge counting the checks inside it that are not passing, so the
problems are visible before anything is opened — which is the one thing a tab strip
otherwise costs you against a single scroll.

One exception, on purpose: a resume analyzed from the Job Match page gets exactly two
tabs, Job Match and Cover Letter, with its own hero score in place of the overall
resume grade. That reader came to ask one specific question, not for a full resume
review — see [Resume tools](#resume-tools).

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
GROQ_API_KEY2=gsk_...            # optional backup key, see below
GROQ_MODEL=openai/gpt-oss-120b   # optional; any Groq text model
AI_TIMEOUT_MS=20000              # optional
```

Groq speaks the OpenAI chat-completions dialect, so there is no SDK — one `fetch` against
one endpoint is the whole client. Adds roughly a second to an analysis.

**A second key is optional and used only as a fallback.** Every AI feature — the review,
the resume rewrite, cover letter drafting, skill-gap notes — goes through one transport
([src/lib/ai/groq.ts](src/lib/ai/groq.ts)), so a single rate-limited or revoked key used
to take all of them down at once. `GROQ_API_KEY2` is tried only when the first key fails
for a reason that is plausibly about that key specifically — a 429 rate limit or a
401/403 rejection — never for a timeout or a network error, which would fail identically
on a second key and would only spend the request's whole deadline twice for nothing.
With only one key set, behaviour is unchanged.

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
- **Job match is a keyword match, and says so.** It compares named skills only — years
  of experience, degree requirements, and soft-skill prose are not evaluated. A null
  score (rather than 0%) means nothing recognisable could be pulled from the pasted
  text at all, usually a truncated paste.
- **The cover letter draft's guard is narrower than the rewrite's.** It cross-checks
  named skills against the resume's own findings; it does not verify free-form claims,
  because there is no reliable mechanical test for whether an arbitrary sentence is
  supported by a source document. Read every line before sending it.
- **PDF accessibility checks stop at tagging and language.** Per-image alt-text
  detection was built and cut for reliability — see [Resume tools](#resume-tools) — so
  an untagged file is flagged, but a tagged file's alt text is not separately verified.
- **Skill-gap notes never name a specific resource.** No course, book, instructor, or
  URL — the model cannot be asked anything verifiable about your resume here, so the
  only thing it could fabricate instead is a resource that sounds plausible and does
  not exist. It sticks to what it can say honestly: what the skill is, and a general
  starting point.
- **Parse preview declines rather than guesses.** Title/company splitting only commits
  when exactly one side of the split reads as a job title; anything more ambiguous is
  shown as the raw, unsplit line. Education is shown as the section's own raw lines —
  degree, school, and year are not parsed out individually.
- **The company briefing has no search or news feed behind it.** It reads exactly the
  pages you paste in — fetched fresh, not recalled from training data — and says
  nothing beyond what is on them. It is the company's own description of itself, not
  independent reporting, and every fact it states carries the line from those pages
  that backs it.
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

## Resume tools

Four features work only with a resume. Each is opt-in, each is scored separately from
the resume's own 0–100 grade, and each degrades cleanly to nothing if you skip it —
none of them can lower the score you get for just uploading a CV.

### AI resume rewrite

Every other check in the tool describes a problem; this is the first that tries to fix
one, which makes it the first that can do real harm — a resume is a document its author
gets questioned about, so a confident invention here is worse than any wrong score
elsewhere. Ask a model to add impact to a bullet with no numbers in it and it tends to
write "reduced processing time by 40%" purely because that is what a good bullet looks
like. So the draft rewrites what is already on the page and marks what is missing:
`"Responsible for managing the rota"` becomes `"Managed the rota for [N staff]"`, with
the token carrying a prompt for what to go and measure.

That rule is enforced, not just requested. `stripInventedNumbers`
([src/lib/ai/rewrite.ts](src/lib/ai/rewrite.ts)) collects every figure already in the
resume and replaces any number in the model's output that is not among them — a second,
mechanical pass behind the prompt, because prompts are advice and this needs to be a
guarantee. The same cliché detector the Writing tab uses also runs over the draft, since
a model asked to write a summary from nothing has been caught reaching for exactly the
stock phrases this tool tells people to delete. Presented as a diff, never a finished
document: a polished replacement invites you to send it unread, and a before/after with
a reason on each line is the only safe relationship to have with a machine rewriting
claims about your career.

### Job match

Paste a job posting on the Job Match page (`/job-match`, linked in the nav — a resume
uploaded there gets a focused report with just the Job Match and Cover Letter tabs,
not the full resume breakdown) and get back the same thing every ATS keyword checker
does under the hood — except it says so. The field also takes just the posting's link
instead of the pasted text: when it is nothing but a URL, the page is fetched fresh
through the same SSRF-guarded fetcher the website analyzer uses
([src/lib/fetcher.ts](src/lib/fetcher.ts)) and matched on what comes back; a link that
fails to fetch is reported as an error rather than matched against nothing.
[src/lib/jobmatch/](src/lib/jobmatch/) splits the posting into required and preferred
zones by heading (an undifferentiated posting is treated as entirely required — a
poster who cared enough to separate "nice to have" would have said so), then matches
both zones against the same skill vocabulary the resume was scored with. The matching
itself is pure text comparison — no AI, nothing that can hallucinate a match that is
not there — the only network call is the optional fetch to resolve a link into text.

A matched skill is not just a checkmark — it carries the resume's own evidence for it
(how many times it appears, and whether it was actually listed in a skills section or
only mentioned in prose), and the score comes with its own arithmetic shown: required
coverage carries 82% of it, preferred the other 18%, both stated as plain percentages
rather than a number you have to trust. Scored and displayed separately from the
resume's own breakdown, because a resume that is a perfect fit for one posting and a
poor fit for another has not changed — the fit changed, and folding that into the
overall score would move a fixed document's score every time someone tried a different
job.

**What it does not evaluate:** years-of-experience requirements, degree requirements, or
soft-skill prose ("excellent communicator") — nothing not expressible as a named skill
in the shared vocabulary. The score is a floor on fit, not a verdict on it.

### Ranking several postings

The reverse direction, at `/job-match/rank`: one resume, several postings pasted in at
once (separated by a `---` line), ranked best fit first
([src/lib/jobmatch/rank.ts](src/lib/jobmatch/rank.ts)). For someone with five tabs of
job postings open, this is the question that actually matters — not "does this resume
fit," but "which of these should I apply to first."

No new matching logic — it is the same deterministic `analyzeJobMatch` run once per
posting against one resume's skill set, extracted once. Genuinely its own lightweight
route rather than a mode of the main analyzer: it needs none of the machinery that
produces a stored, scored report — no ATS check, no PDF export, no history entry — this
is a scratch comparison read once on the page it was run on, not a report anyone comes
back to. A posting with nothing recognisable in it sorts last with an honest "no score,"
never as a last-place zero — it was not evaluated, not evaluated-and-failed, and a
ranked list that conflated the two would be lying about what it actually checked.

Each posting can be pasted in full, or just its link — a chunk between the `---` lines
is fetched (through the same SSRF-guarded fetcher the website analyzer uses) only when
it is nothing but a bare URL with an explicit `http(s)://` scheme, start to finish;
anything else, including a paragraph that happens to mention a link, is read as the
posting itself. Fetches run concurrently, so ten links do not mean waiting out ten
sequential timeouts, and a link that fails to fetch is reported by name — the rest of
the postings still get ranked rather than the whole request failing over one dead link.

### Skill-gap notes

Tick "Explain the skills I'm missing" and every skill Job Match flagged as absent
([src/lib/ai/skillgap.ts](src/lib/ai/skillgap.ts)) gets a short note: what the thing
actually is, in plain language, and a general, honest way to start closing the gap —
turning a red X into something actionable instead of a term to go look up yourself.

The guard here is a different shape from the rewrite's or the cover letter's, because
the risk is different. Neither is possible to ask about here — the model is never asked
anything about *your* resume, only about a named public skill — so what it can fabricate
instead is a *resource*: a course, book, or link that sounds plausible and does not
exist. The prompt is barred from naming any specific course, book, instructor, company,
or URL — "the official documentation" is allowed because every real technology has one
and it is not a specific, unverifiable claim — and a mechanical strip removes any URL
that gets through regardless, since the one thing this feature cannot verify is left out
rather than rendered and trusted. Only costs a model call when Job Match actually found
something missing to explain.

### Cover letter

The same page reviews a cover letter you already wrote (length, a greeting addressed to
a person rather than "To Whom It May Concern," stock phrases, whether it actually names
the role and company it claims to be for) or drafts one from your resume
([src/lib/document/coverletter.ts](src/lib/document/coverletter.ts),
[src/lib/ai/coverletter.ts](src/lib/ai/coverletter.ts)).

The draft's fabrication guard is deliberately narrower than the resume rewrite's, and
that is a considered trade-off, not a shortcut. A number is a small, mechanically
comparable token — a digit in the output either is or is not in the source. A cover
letter's risk is a free-form *claim* ("led a five-person team"), and there is no
reliable mechanical test for whether an arbitrary sentence is supported by a source
document. What ships instead: every named skill or tool the draft uses is checked
against the resume's own skill findings, and anything the letter mentions that the
resume never evidenced is surfaced as unverified. That catches the single most common
and most damaging failure — the letter name-drops a technology the applicant has never
used — without pretending to catch everything, and the panel says so plainly.

### Accessible PDF checks

Folded into the existing Machine Readability (resume) and Presentation (portfolio file)
tabs rather than a tab of their own: whether the uploaded PDF declares itself tagged
(`MarkInfo.Marked`) and whether it names a document language (`/Lang`), both read
straight off the PDF's own catalog via `pdf.js`
([src/lib/intake/pdf.ts](src/lib/intake/pdf.ts)). An untagged PDF gets nothing read out
of it by a screen reader regardless of anything else on the page, which is why this
matters for a document nobody proofreads with assistive technology switched on.

A third signal — whether images carry alt text — was built and cut. Reading it
correctly means walking a structure tree cross-linked through a parent tree and
marked-content IDs in the page's content stream; real authoring tools wire this
correctly, but it is easy to get subtly wrong by hand, including in this project's own
test fixtures during development. An untagged file already fails the check that matters
most, alt text included, so the two signals that shipped are the ones that are both
load-bearing and reliably readable.

### Parse preview

Every other tab renders a check — pass, warn, fail. This tab
([src/lib/document/parsepreview.ts](src/lib/document/parsepreview.ts)) renders the
field itself: name, email, phone, location, links, each work-history entry split into
title and company, the Education section's own lines, and which skills were actually
declared versus inferred from prose — laid out the way a resume parser has to build
them, one line at a time, with no markup to lean on. It is not a claim to replicate any
specific ATS product's parser; it is this tool's own heuristic, the same class every one
of them runs, made visible instead of folded into a score — so a name that gets
swallowed by a blank field, or a role line that never separates into something a real
system can file correctly, shows up here first, while there is still time to fix it.
Deterministic and always computed — no opt-in, since none of it costs a model call.

Two pieces are genuinely new extraction rather than a repackaging of an existing report,
and both follow this project's usual rule: decline rather than guess badly.

- **Title/company splitting.** A comma, dash, or "at" separates them in most resumes,
  but which side is which is not fixed — "Monzo, Senior Backend Engineer" and "Senior
  Backend Engineer, Monzo" are both common. The split is trusted only when exactly one
  side reads as a job title (a broad list of role words) and the other does not; a line
  that splits into two title-shaped or two company-shaped halves is shown unsplit rather
  than assigned a coin-flip.
- **Reading the Education section's own lines**, not just detecting the heading.
  Nothing upstream parses degree/school/year apart — that needs field-specific
  knowledge this heuristic does not have — so they are shown verbatim.

### Comparing versions

History gains a checkbox per stored resume and a plain form that GETs the selected ids
to `/compare` — no persistent "variant" data model, because a re-run of the same file
and two differently-named uploads weeks apart are equally comparable; a variant is just
whichever reports you pick. [src/lib/compare.ts](src/lib/compare.ts) builds the diff
around disagreement only: a score category both reports tie on, a skill both share or
neither has, a suggestion open in every report compared — all of that is signal-free and
left out. What is shown is which report wins each category that actually differs, which
skills only some resumes evidence, and which suggestions are open in one report and
fixed in another, keyed off the same suggestion id the report tab already uses — so a
check that reads "fixed" here was actually resolved, not just reworded.

### Company research briefing

At `/company-brief` (linked from the Job Match page): paste up to three of a company's
own pages — its homepage, About, or Careers page — and get a short interview-prep
briefing built only from what is actually on them
([src/lib/ai/companybrief.ts](src/lib/ai/companybrief.ts)).

This is the one AI feature in the app that could do real reputational harm if it got
the guard wrong, because a company is a real entity most people cannot independently
fact-check on the spot. A model asked "tell me about Acme" from memory alone answers
from training data of unknown age, with no way for the reader to tell a stale fact from
a current one — so this module never asks that question. The pages are fetched fresh,
right here, through the same SSRF-guarded fetcher the website analyzer already uses,
and the model is only ever asked to summarise the text it was handed. Every stated fact
carries the line from the source pages that backs it, the identical evidence-pairing
rule the "Your edge" review already applies to a portfolio — an unsupported claim about
a company is a worse failure than almost anywhere else this app could get something
wrong, and the guard is sized to match.

**What this is not:** there is no search index and no news feed behind it. It cannot
tell you anything the company has not put on the pages you gave it, and it says so —
it is the company's own description of itself, not an independent account. Fetching
more than one page (homepage plus Careers, say) gives a fuller picture than any single
page alone; a page that fails to fetch is reported by name rather than silently
dropped, and the briefing still runs from whichever pages succeeded.

## API

```
POST   /api/analyze       { url, checkLinks?, ai?, save?: boolean } -> { result, trend }
POST   /api/analyze/file  multipart: file, documentKind?, discipline?, ai?, checkLinks?,
                          rewrite?, jobDescription? (pasted text or a bare posting link,
                          fetched fresh when it's a link), coverLetterText?, coverLetterDraft?,
                          skillGapNotes?, focus? ("full" | "jobmatch"), save?
                          -> { result, trend, detectedKind, classificationConfidence }
GET    /api/history       -> { entries }
DELETE /api/history       -> clears all
GET    /api/history/:id   -> { result, trend }
DELETE /api/history/:id   -> deletes one
GET    /api/report/:id    -> application/pdf (the full report)
GET    /api/rewrite/:id   -> application/pdf (the improved draft, if one was requested)
GET    /api/cover-letter/:id -> application/pdf (the drafted cover letter, if one was requested)
POST   /api/jobmatch/rank multipart: file, discipline?, postings (postings separated by a
                          `---` line, up to 10 — each one pasted text or a bare posting
                          link) -> { discipline, droppedCount, failed, postings }
                          — nothing here is saved; see Ranking several postings
POST   /api/company-brief { urls: string[] } (up to 3) -> { brief, failed }
                          — fetched fresh every time, nothing here is saved either
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
- **Job match** — required and preferred zones stay separate under any heading style; a
  skill genuinely absent from the resume is named as missing, not papered over by a
  percentage; a null score when nothing in the posting is recognisable; required
  coverage outweighs preferred in the score; and a matched skill carries the resume's
  own mention count and declared/prose distinction.
- **Cover letter** — a capitalised "Dear Jane," greeting is recognised (a regex missing
  its case-insensitive flag once meant it silently never was); stock phrases, length,
  and role/company mentions are checked independently; and the draft's guard flags a
  skill it named that the resume never evidenced while leaving a genuinely-evidenced one
  alone.
- **PDF accessibility** — a plain pdf-lib export reads as untagged with no declared
  language (the honest default for most real-world resumes); a hand-built tagged PDF
  with a declared `/Lang`, built against the real `pdf.js` APIs, reads as tagged; a
  `.docx` has no such property to check at all.
- **Comparison** — chronological ordering regardless of selection order; a category
  both reports tie on is dropped from the diff; a suggestion fixed in the newer report
  reads as fixed there and open in the older one; and a shared top score never gets
  falsely declared a winner.
- **Groq key fallback** — with fetch mocked: falls through to the second key on a 401
  and on a 429, does not touch a second key on a network failure (which would fail
  identically on either), does not invent a second key that was never configured, and
  still throws its plain "unconfigured" error with neither key set.
- **Skill-gap notes** — notes are returned in the order the skills were actually
  requested, not the order the model replied in; a skill the model was not asked about
  is dropped even if it answered anyway; a URL is stripped out of both fields no matter
  how it is written; and no model call is made at all when there is nothing missing to
  explain.
- **Parse preview** — a role line splits regardless of which side the title lands on;
  splitting declines when both or neither half reads as a title; the date range is
  stripped before the split is attempted; Education lines stop at the next heading; and
  only declared skills are listed, not every skill detected.
- **Ranking postings** — splitting on a `---` line does not also split on a hyphenated
  word or an em dash inside a line; blank chunks from a doubled delimiter are dropped;
  more than 10 postings are capped with the overflow reported rather than silently
  truncated; a posting with no recognisable skills sorts last with a null score, never
  as a last-place zero; and a chunk that is only a bare link is recognised as one to
  fetch, while a paragraph merely mentioning a link, or a bare domain with no scheme,
  is correctly read as pasted text instead.
- **Company briefing** — the digest carries only the pages actually fetched, capped at
  three and truncated per page so one long site cannot blow the context window; and
  normalization drops a highlight with no supporting line behind it, the same guard the
  AI review applies to a portfolio's strengths and underselling.

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
