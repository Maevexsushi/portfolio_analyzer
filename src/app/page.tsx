import Link from "next/link";
import {
  BarChart3,
  Building2,
  FileDown,
  FileText,
  FolderOpen,
  Gauge,
  History,
  Link2,
  ListOrdered,
  ScanSearch,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { IntakeTabs } from "@/components/IntakeTabs";
import { listHistory } from "@/lib/history";
import { BAND_MARK, bandFor, formatRelative, shortenUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

/*
 * Rotating through brand/good/warn for each icon circle is the system's own "Multi-
 * color stat numbers (each stat uses a different accent color)" bold choice, applied
 * to feature icons instead of numbers.
 */
const CHECKS = [
  {
    icon: Users,
    tone: "brand",
    title: "Works for your field",
    body: "Detects whether you are a developer, designer, writer, nurse, marketer, or tradesperson, and judges the work against that field's expectations — not against software's.",
  },
  {
    icon: FileText,
    tone: "good",
    title: "Resume analyzer",
    body: "Its own tab, its own checks. Impact and structure, plus the thing you cannot test yourself: whether an applicant tracking system can read your CV at all.",
  },
  {
    icon: FolderOpen,
    tone: "warn",
    title: "Portfolio files",
    body: "Not every portfolio is a website. Upload the deck you actually send and get a review of the work — plus whether the file will survive an employer's mail server.",
  },
  {
    icon: Gauge,
    tone: "brand",
    title: "Portfolio score",
    body: "One weighted 0-100 score, with the arithmetic shown so you can see what moved it.",
  },
  {
    icon: ScanSearch,
    tone: "good",
    title: "Work analyzer",
    body: "Finds your projects, case studies, or campaigns and grades each on depth, evidence, and whether you said what came of it.",
  },
  {
    icon: Link2,
    tone: "warn",
    title: "Link checker",
    body: "Probes every outbound link for dead ends, and confirms the proof-of-work links your field expects are present.",
  },
  {
    icon: Zap,
    tone: "brand",
    title: "Design & performance",
    body: "For websites: mobile viewport, heading structure, alt text, contrast, real response timing and transfer sizes.",
  },
  {
    icon: Target,
    tone: "good",
    title: "Job match & cover letter",
    body: "Paste a job posting — or just its link — and see exactly which required and preferred skills your resume evidences and which it's missing. Get a cover letter reviewed, or drafted from your resume, without inventing a skill it doesn't already say.",
  },
  {
    icon: ListOrdered,
    tone: "warn",
    title: "Rank several postings",
    body: "Have more than one posting open in a tab? Upload your resume once and paste them all in, ranked best fit first, with the same skill-by-skill detail as a single match.",
  },
  {
    icon: Building2,
    tone: "brand",
    title: "Company research briefing",
    body: "Paste a company's own homepage, About, or Careers page and get a short interview-prep briefing built only from what they actually publish — every claim paired with the line that backs it.",
  },
  {
    icon: History,
    tone: "good",
    title: "Track your progress",
    body: "Every analysis is saved to your history. Pick two and compare them side by side to see exactly what improved, what regressed, and what's still open.",
  },
  {
    icon: FileDown,
    tone: "warn",
    title: "PDF export",
    body: "Download the whole report as a PDF to work through offline or share with a mentor.",
  },
] as const;

const TONE_BG: Record<string, string> = {
  brand: "var(--color-brand)",
  good: "var(--viz-good)",
  warn: "var(--viz-warn)",
};

const STEPS = [
  {
    title: "You say what you're checking.",
    body: "A URL, a resume, or a portfolio file — one form, and each is judged against its own standards, not one generic rubric.",
  },
  {
    title: "It reads exactly what's there.",
    body: "The same HTML bytes a search engine would get for a site — no browser, no JavaScript execution — or the text actually extracted from a file. Nothing is invented or assumed.",
  },
  {
    title: "It checks structure, evidence, and fit.",
    body: "Whichever applies to what you gave it: ATS-readable formatting, dead outbound links, mobile viewport and contrast, or a resume's skills matched against a job posting.",
  },
  {
    title: "It scores and ranks the fixes.",
    body: "Every recommendation carries the evidence that produced it, so you can disagree with it.",
  },
];

export default async function HomePage() {
  const history = await listHistory().catch(() => []);
  const recent = history.slice(0, 4);

  return (
    <div className="relative">
      {/*
        Background decoration: large geometric shapes, low opacity, per the system's
        "Strategic Decoration" principle — visual interest without breaking the flat
        aesthetic. `overflow-hidden` on this wrapper is deliberate and load-bearing: a
        shape positioned partly outside its box gets clipped here rather than expanding
        the page's scrollable width, which is exactly the sideways-scroll bug a plain
        `100vw` wash caused earlier. Single-hue gradients only, fading to transparent —
        the system permits gradients for background decoration specifically, never
        multi-color or vibrant ones.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div
          className="absolute -top-24 -right-20 h-[420px] w-[420px] rounded-full opacity-60"
          style={{ background: "radial-gradient(circle at 30% 30%, var(--color-brand-soft), transparent 70%)" }}
        />
        <div
          className="absolute top-48 -left-16 h-64 w-64 rotate-45 rounded-[3rem] opacity-50"
          style={{ background: "linear-gradient(135deg, var(--color-good-soft), transparent)" }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <section className="pt-16 pb-10 text-center sm:pt-24">
          <h1 className="mx-auto max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-[-0.02em] text-balance sm:text-6xl">
            Find out what a hiring reviewer sees{" "}
            <span style={{ color: "var(--color-brand-ink)" }}>in your work</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft text-pretty">
            Pick what you are checking — a website, your resume, or a portfolio file — and get a
            scored report on what is missing, how deep the work reads, and what to fix first. Each
            one is judged against its own standards, and against your field, whatever that field
            is.
          </p>

          <div className="card mx-auto mt-9 max-w-2xl p-5 text-left sm:p-6">
            <IntakeTabs />
          </div>

          {recent.length > 0 && (
            <div className="mx-auto mt-8 max-w-2xl text-left">
              <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">
                Recent analyses
              </p>
              <ul className="flex flex-wrap justify-center gap-2 sm:justify-start">
                {recent.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/r/${entry.id}`}
                      className="card-interactive flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: BAND_MARK[bandFor(entry.overallScore)] }}
                      />
                      <span className="max-w-52 truncate">{shortenUrl(entry.finalUrl, 30)}</span>
                      <span className="font-bold tabular-nums">{entry.overallScore}</span>
                      <span className="text-muted">{formatRelative(entry.analyzedAt)}</span>
                    </Link>
                  </li>
                ))}
                {history.length > recent.length && (
                  <li>
                    <Link
                      href="/history"
                      className="flex items-center rounded-full px-3.5 py-2 text-sm font-semibold text-brand-ink hover:underline"
                    >
                      All {history.length} →
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          )}
        </section>

        <section className="border-t border-line py-14">
          <h2 className="text-2xl font-extrabold tracking-tight">What it checks</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CHECKS.map((check) => {
              const Icon = check.icon;
              return (
                <li key={check.title} className="card card-interactive group p-5">
                  <span
                    aria-hidden
                    className="mb-3 grid h-14 w-14 place-items-center rounded-lg text-white transition-transform duration-200 group-hover:scale-110"
                    style={{ backgroundColor: TONE_BG[check.tone] }}
                  >
                    <Icon size={22} strokeWidth={2.25} />
                  </span>
                  <h3 className="font-bold">{check.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{check.body}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="border-t border-line py-14">
          <h2 className="text-2xl font-extrabold tracking-tight">How it works</h2>
          <ol className="mt-6 max-w-3xl space-y-5">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white"
                >
                  {index + 1}
                </span>
                <p className="pt-0.5">
                  <strong className="font-bold text-ink">{step.title}</strong>{" "}
                  <span className="text-ink-soft">{step.body}</span>
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-3xl border-t border-line pt-5 text-sm text-muted">
            One limitation worth knowing: if your projects are rendered client-side by
            JavaScript, a static analyzer cannot see them — and neither can most link previews or
            crawlers. The report says so when it suspects that is happening.
          </p>
        </section>
      </div>
    </div>
  );
}
