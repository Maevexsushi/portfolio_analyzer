import type { AnalysisResult } from "@/lib/types";
import {
  BAND_LABEL,
  BAND_MARK,
  bandFor,
  formatBytes,
  formatDateTime,
  formatMs,
} from "@/lib/format";
import { Meter, Sparkline, StatTile } from "./viz";

/**
 * Portfolio Score.
 *
 * The overall score is the one hero figure on the page (everything else is a stat tile
 * or a meter). It is a single ratio against a fixed 0-100 limit, so it renders as a
 * meter rather than a gauge or donut.
 */
export function ScoreOverview({
  result,
  trend,
}: {
  result: AnalysisResult;
  trend: { id: string; analyzedAt: string; overallScore: number }[];
}) {
  const band = bandFor(result.overallScore);
  const criticalCount = result.suggestions.filter((s) => s.severity === "critical").length;

  return (
    <section id="score" className="scroll-mt-20">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              Portfolio score
            </p>
            <div className="mt-1 flex items-end gap-3">
              <span className="text-6xl leading-none font-semibold tracking-tight">
                {result.overallScore}
              </span>
              <span className="pb-1.5 text-lg text-muted">/ 100</span>
              <span
                className="mb-1.5 rounded-lg px-2.5 py-1 text-sm font-bold text-white"
                style={{ backgroundColor: BAND_MARK[band] }}
              >
                {result.grade}
              </span>
            </div>
            <p className="mt-3 max-w-xl text-ink-soft">{result.verdict}</p>

            <div
              className="mt-4 h-2.5 w-full max-w-md overflow-hidden rounded-full"
              style={{
                backgroundColor: `color-mix(in oklab, ${BAND_MARK[band]} 16%, var(--color-surface))`,
              }}
              role="img"
              aria-label={`Overall score ${result.overallScore} out of 100 — ${BAND_LABEL[band]}`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(1.5, result.overallScore)}%`,
                  backgroundColor: BAND_MARK[band],
                }}
              />
            </div>
          </div>

          <dl className="shrink-0 space-y-1.5 text-sm sm:text-right">
            <div>
              <dt className="inline text-muted">Analyzed </dt>
              <dd className="inline">{formatDateTime(result.analyzedAt)}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Took </dt>
              <dd className="inline tabular-nums">{formatMs(result.durationMs)}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Fixes flagged </dt>
              <dd className="inline tabular-nums">
                {result.suggestions.length}
                {criticalCount > 0 && (
                  <span className="text-bad"> · {criticalCount} critical</span>
                )}
              </dd>
            </div>
            {trend.length >= 2 && (
              <div className="pt-2 sm:flex sm:justify-end">
                <Sparkline points={trend} />
              </div>
            )}
          </dl>
        </div>

        <div className="mt-7 border-t border-line pt-6">
          <h3 className="mb-4 text-xs font-semibold tracking-wide text-muted uppercase">
            How the score breaks down
          </h3>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {result.breakdown.map((entry) => (
              <Meter
                key={entry.key}
                label={entry.label}
                value={entry.score}
                weight={entry.weight}
                caption={entry.summary}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Projects"
          value={result.projects.count}
          hint={result.projects.count > 0 ? `avg depth ${result.projects.averageQuality}/100` : "none found"}
          tone={result.projects.count >= 3 ? "pass" : result.projects.count > 0 ? "warn" : "fail"}
        />
        <StatTile
          label="Sections"
          value={`${result.sections.requiredFound}/${result.sections.requiredTotal}`}
          hint={`+${result.sections.bonusFound} bonus`}
          tone={
            result.sections.requiredFound === result.sections.requiredTotal
              ? "pass"
              : result.sections.requiredFound >= 4
                ? "warn"
                : "fail"
          }
        />
        <StatTile
          label="Skills"
          value={result.skills.total}
          hint={`${result.skills.categoriesCovered.length} categories`}
          tone={result.skills.total >= 10 ? "pass" : result.skills.total >= 5 ? "warn" : "fail"}
        />
        <StatTile
          label="Broken links"
          value={result.links.brokenCount}
          hint={
            result.links.checkedCount === 0
              ? "not checked"
              : `of ${result.links.checkedCount} probed`
          }
          tone={
            result.links.checkedCount === 0
              ? "warn"
              : result.links.brokenCount === 0
                ? "pass"
                : "fail"
          }
        />
        <StatTile
          label="Images without alt"
          value={result.design.imagesMissingAlt}
          hint={`of ${result.design.imagesTotal} images`}
          tone={result.design.imagesMissingAlt === 0 ? "pass" : "fail"}
        />
        <StatTile
          label="First byte"
          value={formatMs(result.performance.ttfbMs)}
          hint={`${formatBytes(result.performance.htmlBytes)} HTML`}
          tone={
            result.performance.ttfbMs <= 600
              ? "pass"
              : result.performance.ttfbMs <= 1500
                ? "warn"
                : "fail"
          }
        />
      </div>
    </section>
  );
}
