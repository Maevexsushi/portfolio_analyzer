import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ScoreOverview } from "@/components/ScoreOverview";
import { ReanalyzeButton } from "@/components/ReanalyzeButton";
import { AiReviewPanel } from "@/components/panels/AiReviewPanel";
import { DesignPanel } from "@/components/panels/DesignPanel";
import { DisciplinePanel } from "@/components/panels/DisciplinePanel";
import {
  DeliverabilityPanel,
  PresentationPanel,
  WorkPanel,
} from "@/components/panels/DocumentPanels";
import { LinksPanel } from "@/components/panels/LinksPanel";
import { PerformancePanel } from "@/components/panels/PerformancePanel";
import { ProjectsPanel } from "@/components/panels/ProjectsPanel";
import {
  AtsPanel,
  ContactPanel,
  ExperiencePanel,
  LanguagePanel,
  StructurePanel,
} from "@/components/panels/ResumePanels";
import { SectionsPanel } from "@/components/panels/SectionsPanel";
import { SkillsPanel } from "@/components/panels/SkillsPanel";
import { SuggestionsPanel } from "@/components/panels/SuggestionsPanel";
import { profileFor } from "@/lib/discipline/profiles";
import { getAnalysis, getTrend, trendKeyFor } from "@/lib/history";
import { shortenUrl } from "@/lib/format";
import type { AnyResult } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<AnyResult["kind"], string> = {
  website: "Website",
  resume: "Resume / CV",
  document: "Portfolio document",
};

/** Nav entries per kind — the anchors only exist for the panels that rendered. */
function navFor(result: AnyResult): { id: string; label: string }[] {
  const shared = [
    { id: "score", label: "Score" },
    { id: "edge", label: "Your edge" },
    { id: "suggestions", label: "What to fix" },
  ];

  switch (result.kind) {
    case "website":
      return [
        ...shared,
        { id: "basis", label: "Basis" },
        { id: "sections", label: "Sections" },
        { id: "projects", label: "Projects" },
        { id: "skills", label: "Skills" },
        { id: "links", label: "Links" },
        { id: "design", label: "Design" },
        { id: "performance", label: "Performance" },
      ];
    case "resume":
      return [
        ...shared,
        { id: "basis", label: "Basis" },
        { id: "ats", label: "Machine readability" },
        { id: "experience", label: "Experience" },
        { id: "structure", label: "Structure" },
        { id: "contact", label: "Contact" },
        { id: "skills", label: "Skills" },
        { id: "language", label: "Writing" },
      ];
    case "document":
      return [
        ...shared,
        { id: "basis", label: "Basis" },
        { id: "work", label: "The work" },
        { id: "presentation", label: "Presentation" },
        { id: "deliverability", label: "Deliverability" },
        { id: "contact", label: "Contact" },
        { id: "skills", label: "Skills" },
      ];
  }
}

function headingFor(result: AnyResult): { title: string; subtitle: string | null } {
  if (result.kind === "website") {
    return {
      title: result.meta.title || shortenUrl(result.finalUrl, 60),
      subtitle: result.meta.description || null,
    };
  }
  return { title: result.upload.fileName, subtitle: null };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getAnalysis(id).catch(() => null);
  if (!result) return { title: "Report not found — Portfolio Analyzer" };

  const subject =
    result.kind === "website" ? shortenUrl(result.finalUrl, 40) : result.upload.fileName;
  return { title: `${result.overallScore}/100 — ${subject} — Portfolio Analyzer` };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getAnalysis(id);
  if (!result) notFound();

  const trend = await getTrend(trendKeyFor(result), result.kind).catch(() => []);
  const heading = headingFor(result);
  const nav = navFor(result);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {KIND_LABEL[result.kind]}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{heading.title}</h1>
          {result.kind === "website" && (
            <a
              href={result.finalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm break-all text-brand-ink hover:underline"
            >
              {result.finalUrl}
            </a>
          )}
          {heading.subtitle && (
            <p className="mt-2 max-w-2xl text-sm text-muted">{heading.subtitle}</p>
          )}
        </div>

        <div className="no-print flex items-center gap-2">
          {result.kind === "website" ? (
            <ReanalyzeButton url={result.url} />
          ) : (
            // Uploaded bytes are never stored, so there is nothing to re-run against.
            <Link
              href="/"
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium transition-colors hover:border-line-strong"
            >
              Upload a new version
            </Link>
          )}
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
          {nav.map((item) => (
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
        <AiReviewPanel review={result.ai} />
        <SuggestionsPanel suggestions={result.suggestions} />
        <DisciplinePanel
          discipline={result.discipline}
          upload={result.kind === "website" ? undefined : result.upload}
          kindLabel={KIND_LABEL[result.kind]}
        />

        {result.kind === "website" && (
          <>
            <SectionsPanel report={result.sections} />
            <ProjectsPanel report={result.projects} />
            <SkillsPanel report={result.skills} />
            <LinksPanel report={result.links} />
            <DesignPanel report={result.design} />
            <PerformancePanel report={result.performance} />
          </>
        )}

        {result.kind === "resume" && (
          <>
            <AtsPanel report={result.ats} />
            <ExperiencePanel report={result.experience} />
            <StructurePanel report={result.structure} />
            <ContactPanel report={result.contact} />
            <SkillsPanel report={result.skills} />
            <LanguagePanel report={result.language} />
          </>
        )}

        {result.kind === "document" && (
          <>
            <WorkPanel report={result.work} workNoun={profileFor(result.discipline.key).workNoun} />
            <PresentationPanel report={result.presentation} />
            <DeliverabilityPanel report={result.deliverability} />
            <ContactPanel report={result.contact} />
            <SkillsPanel report={result.skills} />
          </>
        )}
      </div>

      <div className="no-print mt-8 flex items-center justify-between border-t border-line pt-6 text-sm">
        <Link href="/" className="text-brand-ink hover:underline">
          ← Analyze something else
        </Link>
        <Link href="/history" className="text-muted hover:text-ink">
          View all analyses
        </Link>
      </div>
    </div>
  );
}
