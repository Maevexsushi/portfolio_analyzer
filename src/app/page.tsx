import Link from "next/link";
import { UrlForm } from "@/components/UrlForm";
import { listHistory } from "@/lib/history";
import { BAND_MARK, bandFor, formatRelative, shortenUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

const CHECKS = [
  {
    title: "Portfolio score",
    body: "One weighted 0-100 score across six categories, with the arithmetic shown so you can see what moved it.",
  },
  {
    title: "Sections checker",
    body: "Looks for the sections a reviewer expects — intro, about, projects, skills, experience, contact — plus bonus ones.",
  },
  {
    title: "Project analyzer",
    body: "Finds your project cards and grades each on description depth, live demo, source link, screenshots, and stack.",
  },
  {
    title: "Skills detector",
    body: "Matches your copy against 100+ technologies and reports category coverage and what you never mention.",
  },
  {
    title: "Link checker",
    body: "Probes every outbound link for dead ends, and confirms GitHub, LinkedIn, email, and resume are all present.",
  },
  {
    title: "Design review",
    body: "Mobile viewport, heading structure, alt text, contrast, metadata, palette and typeface discipline.",
  },
  {
    title: "Performance report",
    body: "Real response timing, transfer sizes, request counts, compression and caching — measured, not estimated.",
  },
  {
    title: "PDF export",
    body: "Download the whole report as a PDF to work through offline or share with a mentor.",
  },
];

export default async function HomePage() {
  const history = await listHistory().catch(() => []);
  const recent = history.slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="pt-14 pb-10 sm:pt-20">
        <h1 className="max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
          Find out what a hiring reviewer sees in your portfolio.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Paste your portfolio URL. You get a scored report on the sections you are missing, how
          deep your projects read, which links are dead, and what to fix first — in about five
          seconds.
        </p>

        <div className="mt-8 max-w-2xl">
          <UrlForm autoFocus />
        </div>

        {recent.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              Recent analyses
            </p>
            <ul className="flex flex-wrap gap-2">
              {recent.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/r/${entry.id}`}
                    className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-line-strong"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: BAND_MARK[bandFor(entry.overallScore)] }}
                    />
                    <span className="max-w-52 truncate">{shortenUrl(entry.finalUrl, 30)}</span>
                    <span className="font-semibold tabular-nums">{entry.overallScore}</span>
                    <span className="text-muted">{formatRelative(entry.analyzedAt)}</span>
                  </Link>
                </li>
              ))}
              {history.length > recent.length && (
                <li>
                  <Link
                    href="/history"
                    className="flex items-center rounded-full px-3 py-1.5 text-sm text-brand-ink hover:underline"
                  >
                    All {history.length} →
                  </Link>
                </li>
              )}
            </ul>
          </div>
        )}
      </section>

      <section className="border-t border-line py-10">
        <h2 className="text-xl font-semibold tracking-tight">What it checks</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHECKS.map((check) => (
            <li key={check.title} className="card p-4">
              <h3 className="font-medium">{check.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{check.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line py-10">
        <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-4 max-w-3xl space-y-3 text-ink-soft">
          <li>
            <strong className="font-medium text-ink">1. It fetches the HTML your site serves.</strong>{" "}
            The same bytes a search engine or a link preview would get — no browser, no JavaScript
            execution.
          </li>
          <li>
            <strong className="font-medium text-ink">2. It downloads your stylesheets and samples asset sizes.</strong>{" "}
            That is where the palette, typeface, contrast, and page-weight numbers come from.
          </li>
          <li>
            <strong className="font-medium text-ink">3. It probes your outbound links.</strong>{" "}
            GitHub, LinkedIn, live demos, resume — each one gets a real request.
          </li>
          <li>
            <strong className="font-medium text-ink">4. It scores and ranks the fixes.</strong>{" "}
            Every recommendation carries the evidence that produced it, so you can disagree with
            it.
          </li>
        </ol>
        <p className="mt-5 max-w-3xl text-sm text-muted">
          One limitation worth knowing: if your projects are rendered client-side by JavaScript,
          a static analyzer cannot see them — and neither can most link previews or crawlers. The
          report says so when it suspects that is happening.
        </p>
      </section>
    </div>
  );
}
