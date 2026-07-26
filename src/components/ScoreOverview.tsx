import type { AnyResult } from "@/lib/types";
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
interface Tile {
  label: string;
  value: string | number;
  hint: string;
  tone: "pass" | "warn" | "fail";
}

/**
 * The six headline numbers, chosen per kind.
 *
 * Each set leads with the thing that most often decides that kind of review: projects
 * for a site, quantified bullets for a resume, and for an uploaded document, whether
 * the file is even small enough to arrive.
 */
function tilesFor(result: AnyResult): Tile[] {
  if (result.kind === "website") {
    return [
      {
        label: "Projects",
        value: result.projects.count,
        hint:
          result.projects.count > 0
            ? `avg depth ${result.projects.averageQuality}/100`
            : "none found",
        tone: result.projects.count >= 3 ? "pass" : result.projects.count > 0 ? "warn" : "fail",
      },
      {
        label: "Sections",
        value: `${result.sections.requiredFound}/${result.sections.requiredTotal}`,
        hint: `+${result.sections.bonusFound} bonus`,
        tone:
          result.sections.requiredFound === result.sections.requiredTotal
            ? "pass"
            : result.sections.requiredFound >= 4
              ? "warn"
              : "fail",
      },
      {
        label: "Skills",
        value: result.skills.total,
        hint: `${result.skills.categoriesCovered.length} groups`,
        tone: result.skills.total >= 10 ? "pass" : result.skills.total >= 5 ? "warn" : "fail",
      },
      {
        label: "Broken links",
        value: result.links.brokenCount,
        hint:
          result.links.checkedCount === 0
            ? "not checked"
            : `of ${result.links.checkedCount} probed`,
        tone:
          result.links.checkedCount === 0
            ? "warn"
            : result.links.brokenCount === 0
              ? "pass"
              : "fail",
      },
      {
        label: "Images without alt",
        value: result.design.imagesMissingAlt,
        hint: `of ${result.design.imagesTotal} images`,
        tone: result.design.imagesMissingAlt === 0 ? "pass" : "fail",
      },
      {
        label: "First byte",
        value: formatMs(result.performance.ttfbMs),
        hint: `${formatBytes(result.performance.htmlBytes)} HTML`,
        tone:
          result.performance.ttfbMs <= 600
            ? "pass"
            : result.performance.ttfbMs <= 1500
              ? "warn"
              : "fail",
      },
    ];
  }

  if (result.kind === "resume") {
    const quantified = Math.round(result.experience.quantificationRate * 100);
    return [
      {
        label: "Machine readable",
        value: result.ats.machineReadable ? "Yes" : "No",
        hint: result.ats.machineReadable ? "an ATS can parse it" : "ATS sees an empty file",
        tone: result.ats.machineReadable ? "pass" : "fail",
      },
      {
        label: "Bullets with numbers",
        value: `${quantified}%`,
        hint: `${result.experience.quantifiedBullets} of ${result.experience.totalBullets}`,
        tone: quantified >= 40 ? "pass" : quantified >= 15 ? "warn" : "fail",
      },
      {
        label: "Roles",
        value: result.experience.entries.length,
        hint: `${result.experience.totalBullets} bullets total`,
        tone: result.experience.entries.length >= 2 ? "pass" : "warn",
      },
      {
        label: "Sections",
        value: `${result.structure.requiredFound}/${result.structure.requiredTotal}`,
        hint: "expected headings",
        tone:
          result.structure.requiredFound === result.structure.requiredTotal
            ? "pass"
            : result.structure.requiredFound >= 2
              ? "warn"
              : "fail",
      },
      {
        label: "Contactable",
        value: result.contact.email ? "Yes" : "No",
        hint: result.contact.email ?? "no email in the text",
        tone: result.contact.email ? "pass" : "fail",
      },
      {
        label: "Length",
        value: result.upload.pageCount === null ? "—" : `${result.upload.pageCount}p`,
        hint: result.ats.wordsPerPage ? `${result.ats.wordsPerPage} words/page` : "reflows",
        tone:
          result.upload.pageCount === null || result.upload.pageCount <= 2
            ? "pass"
            : result.upload.pageCount <= 3
              ? "warn"
              : "fail",
      },
    ];
  }

  return [
    {
      label: "Pieces of work",
      value: result.work.count,
      hint: result.work.count > 0 ? `avg ${result.work.averageWords} words` : "none identified",
      tone: result.work.count >= 3 ? "pass" : result.work.count > 0 ? "warn" : "fail",
    },
    {
      label: "With an outcome",
      value: `${result.work.withOutcome}/${result.work.count}`,
      hint: "say what came of it",
      tone:
        result.work.count > 0 && result.work.withOutcome >= Math.ceil(result.work.count * 0.5)
          ? "pass"
          : result.work.withOutcome > 0
            ? "warn"
            : "fail",
    },
    {
      label: "Emailable",
      value: result.deliverability.emailable ? "Yes" : "No",
      hint: formatBytes(result.deliverability.bytes),
      tone: result.deliverability.emailable ? "pass" : "fail",
    },
    {
      label: "Pages",
      value: result.presentation.pageCount ?? "—",
      hint: `${result.presentation.imagesPerPage} images/page`,
      tone:
        result.presentation.pageCount === null || result.presentation.pageCount <= 20
          ? "pass"
          : result.presentation.pageCount <= 40
            ? "warn"
            : "fail",
    },
    {
      label: "Contactable",
      value: result.contact.email ? "Yes" : "No",
      hint: result.contact.email ?? "no email in the text",
      tone: result.contact.email ? "pass" : "fail",
    },
    {
      label: "Links",
      value: result.deliverability.linkCount,
      hint: result.deliverability.hasClickableLinks ? "clickable" : "printed as text",
      tone: result.deliverability.hasClickableLinks
        ? "pass"
        : result.deliverability.linkCount > 0
          ? "warn"
          : "fail",
    },
  ];
}

export function ScoreOverview({
  result,
  trend,
}: {
  result: AnyResult;
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
              {result.kind === "resume" ? "Resume score" : "Portfolio score"}
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
        {tilesFor(result).map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            hint={tile.hint}
            tone={tile.tone}
          />
        ))}
      </div>
    </section>
  );
}
