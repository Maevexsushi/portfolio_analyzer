import Link from "next/link";
import { ClearHistoryButton, DeleteEntryButton } from "@/components/HistoryActions";
import { listHistory } from "@/lib/history";
import type { HistoryEntry } from "@/lib/types";
import { BAND_MARK, bandFor, formatDateTime, formatRelative, shortenUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analysis history — Portfolio Analyzer",
};

const KIND_LABEL: Record<HistoryEntry["kind"], string> = {
  website: "Website",
  resume: "Resume / CV",
  document: "Portfolio document",
};

export default async function HistoryPage() {
  const entries: HistoryEntry[] = await listHistory().catch(() => []);

  /*
   * Group by subject so repeat runs read as a progression. Keyed by kind as well as
   * identifier: a resume named "portfolio.pdf" and a site at that address are two
   * different things, and merging them would chart one score line across both.
   */
  const bySubject = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.finalUrl}`;
    const existing = bySubject.get(key);
    if (existing) existing.push(entry);
    else bySubject.set(key, [entry]);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analysis history</h1>
          <p className="mt-1 text-sm text-muted">
            {entries.length === 0
              ? "Nothing stored yet."
              : `${entries.length} stored analys${entries.length === 1 ? "is" : "es"} across ${bySubject.size} subject${bySubject.size === 1 ? "" : "s"}. The last 50 runs are kept.`}
          </p>
        </div>
        {entries.length > 0 && <ClearHistoryButton count={entries.length} />}
      </div>

      {entries.length === 0 ? (
        <div className="card mt-8 p-8 text-center">
          <p className="text-ink-soft">Run an analysis and it will show up here.</p>
          <Link
            href="/"
            className="btn-brand mt-4 inline-block rounded-xl px-5 py-2.5 font-semibold"
          >
            Analyze a portfolio or resume
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {[...bySubject.entries()].map(([key, runs]) => {
            const latest = runs[0];
            const previous = runs[1];
            const delta = previous ? latest.overallScore - previous.overallScore : null;
            const isWebsite = latest.kind === "website";

            return (
              <section key={key} className="card overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2/50 px-4 py-3">
                  <div className="min-w-0">
                    {isWebsite ? (
                      <a
                        href={latest.finalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium break-all hover:underline"
                      >
                        {shortenUrl(latest.finalUrl, 52)}
                      </a>
                    ) : (
                      // Uploads are never stored, so there is nothing to link out to.
                      <p className="font-medium break-all">{latest.finalUrl}</p>
                    )}
                    <p className="text-xs text-muted">
                      {KIND_LABEL[latest.kind]} · {runs.length} run
                      {runs.length === 1 ? "" : "s"} · latest {formatRelative(latest.analyzedAt)}
                    </p>
                  </div>
                  {delta !== null && (
                    <span className="text-sm tabular-nums text-muted">
                      {delta === 0
                        ? "no change since previous run"
                        : `${delta > 0 ? "+" : ""}${delta} vs previous run`}
                    </span>
                  )}
                </header>

                <ul className="divide-y divide-line">
                  {runs.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50"
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: BAND_MARK[bandFor(entry.overallScore)] }}
                      />
                      <span className="w-16 shrink-0 font-semibold tabular-nums">
                        {entry.overallScore}
                        <span className="ml-1 text-xs font-normal text-muted">{entry.grade}</span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                        {entry.title}
                      </span>
                      <span className="hidden shrink-0 text-sm text-muted sm:block">
                        {formatDateTime(entry.analyzedAt)}
                      </span>
                      <Link
                        href={`/r/${entry.id}`}
                        className="shrink-0 rounded-lg px-2 py-1 text-sm text-brand-ink hover:underline"
                      >
                        Open
                      </Link>
                      <DeleteEntryButton id={entry.id} label={entry.title} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
