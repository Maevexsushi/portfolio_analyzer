import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ScoreOverview } from "@/components/ScoreOverview";
import { ReanalyzeButton } from "@/components/ReanalyzeButton";
import { DesignPanel } from "@/components/panels/DesignPanel";
import { LinksPanel } from "@/components/panels/LinksPanel";
import { PerformancePanel } from "@/components/panels/PerformancePanel";
import { ProjectsPanel } from "@/components/panels/ProjectsPanel";
import { SectionsPanel } from "@/components/panels/SectionsPanel";
import { SkillsPanel } from "@/components/panels/SkillsPanel";
import { SuggestionsPanel } from "@/components/panels/SuggestionsPanel";
import { getAnalysis, getTrend } from "@/lib/history";
import { shortenUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

const NAV = [
  { id: "score", label: "Score" },
  { id: "suggestions", label: "What to fix" },
  { id: "sections", label: "Sections" },
  { id: "projects", label: "Projects" },
  { id: "skills", label: "Skills" },
  { id: "links", label: "Links" },
  { id: "design", label: "Design" },
  { id: "performance", label: "Performance" },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getAnalysis(id).catch(() => null);
  if (!result) return { title: "Report not found — Portfolio Analyzer" };
  return {
    title: `${result.overallScore}/100 — ${shortenUrl(result.finalUrl, 40)} — Portfolio Analyzer`,
  };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getAnalysis(id);
  if (!result) notFound();

  const trend = await getTrend(result.finalUrl).catch(() => []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {result.meta.title || shortenUrl(result.finalUrl, 60)}
          </h1>
          <a
            href={result.finalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-sm break-all text-brand-ink hover:underline"
          >
            {result.finalUrl}
          </a>
          {result.meta.description && (
            <p className="mt-2 max-w-2xl text-sm text-muted">{result.meta.description}</p>
          )}
        </div>

        <div className="no-print flex items-center gap-2">
          <ReanalyzeButton url={result.url} />
          <a
            href={`/api/report/${result.id}`}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Download PDF
          </a>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <ul className="mt-5 space-y-2">
          {result.warnings.map((warning) => (
            <li
              key={warning}
              className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-ink"
            >
              {warning}
            </li>
          ))}
        </ul>
      )}

      <nav
        aria-label="Report sections"
        className="no-print sticky top-14 z-30 -mx-4 mt-6 overflow-x-auto border-b border-line bg-canvas/85 px-4 py-2 backdrop-blur"
      >
        <ul className="flex gap-1 text-sm whitespace-nowrap">
          {NAV.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="block rounded-lg px-3 py-1.5 text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 space-y-4">
        <ScoreOverview result={result} trend={trend} />
        <SuggestionsPanel suggestions={result.suggestions} />
        <SectionsPanel report={result.sections} />
        <ProjectsPanel report={result.projects} />
        <SkillsPanel report={result.skills} />
        <LinksPanel report={result.links} />
        <DesignPanel report={result.design} />
        <PerformancePanel report={result.performance} />
      </div>

      <div className="no-print mt-8 flex items-center justify-between border-t border-line pt-6 text-sm">
        <Link href="/" className="text-brand-ink hover:underline">
          ← Analyze another portfolio
        </Link>
        <Link href="/history" className="text-muted hover:text-ink">
          View all analyses
        </Link>
      </div>
    </div>
  );
}
