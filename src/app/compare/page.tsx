import Link from "next/link";
import { Check, X } from "lucide-react";
import { getAnalysis } from "@/lib/history";
import { compareResumes, bestIndexOf } from "@/lib/compare";
import { CATEGORY_LABELS } from "@/lib/analyzer/score";
import { BAND_MARK, bandFor, formatDateTime } from "@/lib/format";
import type { AnyResult, CategoryKey } from "@/lib/types";
import { Panel, SubHeading, EmptyNote } from "@/components/Panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Compare resumes — Profiled",
};

function normalizeIds(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  return [...new Set((Array.isArray(raw) ? raw : [raw]).filter(Boolean))];
}

function categoryLabel(category: CategoryKey | "general"): string {
  return category === "general" ? "General" : CATEGORY_LABELS[category];
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const params = await searchParams;
  const ids = normalizeIds(params.ids);

  const fetched = await Promise.all(ids.map((id) => getAnalysis(id).catch(() => null)));
  const results = fetched.filter(
    (result): result is Extract<AnyResult, { kind: "resume" }> =>
      result !== null && result.kind === "resume",
  );

  if (results.length < 2) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">Compare resumes</h1>
        <div className="card mt-6 p-8 text-center">
          <p className="text-ink-soft">
            {ids.length === 0
              ? "Nothing was selected."
              : "At least two stored resume reports are needed to compare, and one or more of the ones selected could not be found — history keeps only the last 50 runs."}
          </p>
          <Link
            href="/history"
            className="btn-brand mt-4 inline-flex h-14 items-center justify-center rounded-lg px-7 font-bold"
          >
            Back to history
          </Link>
        </div>
      </div>
    );
  }

  const comparison = compareResumes(results);
  const overallScores = comparison.subjects.map((subject) => subject.overallScore);
  const bestOverall = bestIndexOf(overallScores);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Compare resumes</h1>
          <p className="mt-1 text-sm text-muted">
            {comparison.subjects.length} reports, oldest to newest. Sections below show only
            where they disagree — anything identical across every one is left out.
          </p>
        </div>
        <Link href="/history" className="text-sm text-brand-ink hover:underline">
          ← Back to history
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {comparison.subjects.map((subject, index) => (
          <div key={subject.id} className="card p-4">
            <p className="truncate text-sm font-semibold" title={subject.fileName}>
              {subject.fileName}
            </p>
            <p className="mt-0.5 text-xs text-muted">{formatDateTime(subject.analyzedAt)}</p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-extrabold tabular-nums ${
                  bestOverall === index ? "text-good" : ""
                }`}
              >
                {subject.overallScore}
              </span>
              <span className="text-sm text-muted">/100 · {subject.grade}</span>
            </p>
            <Link
              href={`/r/${subject.id}`}
              className="mt-2 inline-block text-sm text-brand-ink hover:underline"
            >
              Open report
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Panel
          id="scores"
          title="Score breakdown"
          description="Categories where at least two reports score differently. The best score in each row is highlighted; a category every report ties on is left out."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
                  <th className="py-2 pr-4 font-semibold">Category</th>
                  {comparison.subjects.map((subject) => (
                    <th key={subject.id} className="px-3 py-2 text-right font-semibold">
                      <span className="block max-w-32 truncate" title={subject.fileName}>
                        {subject.fileName}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line font-bold">
                  <td className="py-2 pr-4">Overall</td>
                  {overallScores.map((score, index) => (
                    <td
                      key={comparison.subjects[index].id}
                      className={`px-3 py-2 text-right tabular-nums ${
                        bestOverall === index ? "text-good" : ""
                      }`}
                    >
                      {score}
                    </td>
                  ))}
                </tr>
                {comparison.categories.map((row) => (
                  <tr key={row.key} className="border-b border-line/60">
                    <td className="py-2 pr-4 text-ink-soft">{row.label}</td>
                    {row.scores.map((score, index) => (
                      <td
                        key={comparison.subjects[index].id}
                        className={`px-3 py-2 text-right tabular-nums ${
                          row.bestIndex === index
                            ? "font-bold text-good"
                            : score === null
                              ? "text-muted"
                              : "text-ink-soft"
                        }`}
                      >
                        {score ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          id="suggestions-diff"
          title="What changed"
          description="Issues open in some reports and fixed in others — the same suggestion id the report tab uses, so a check that comes back clean here really was resolved, not just re-worded."
        >
          {comparison.differingSuggestions.length === 0 ? (
            <EmptyNote>
              No suggestion differs between the reports compared — either every issue is shared
              across all of them, or none are.
            </EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
                    <th className="py-2 pr-4 font-semibold">Issue</th>
                    {comparison.subjects.map((subject) => (
                      <th key={subject.id} className="px-3 py-2 text-center font-semibold">
                        <span className="block max-w-24 truncate" title={subject.fileName}>
                          {subject.fileName}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.differingSuggestions.map((row) => (
                    <tr key={row.id} className="border-b border-line/60">
                      <td className="py-2 pr-4">
                        <p className="font-medium">{row.title}</p>
                        <p className="text-xs text-muted">{categoryLabel(row.category)}</p>
                      </td>
                      {row.open.map((isOpen, index) => (
                        <td key={comparison.subjects[index].id} className="px-3 py-2 text-center">
                          {isOpen ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-warn">
                              <X size={13} strokeWidth={3} aria-hidden />
                              Open
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-good">
                              <Check size={13} strokeWidth={3} aria-hidden />
                              Fixed
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          id="skills-diff"
          title="Skills that differ"
          description="A skill every report shares, or none do, says nothing about the difference between them — only the ones that appear in some and not others are shown."
        >
          {comparison.differingSkills.length === 0 ? (
            <EmptyNote>Every detected skill appears in all of the reports compared.</EmptyNote>
          ) : (
            <div className="space-y-5">
              {comparison.subjects.map((subject, index) => {
                const onlyHere = comparison.differingSkills.filter(
                  (skill) => skill.present[index],
                );
                if (onlyHere.length === 0) return null;
                return (
                  <div key={subject.id}>
                    <SubHeading>In {subject.fileName}</SubHeading>
                    <ul className="flex flex-wrap gap-1.5">
                      {onlyHere.map((skill) => (
                        <li
                          key={skill.name}
                          className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-sm"
                        >
                          {skill.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
