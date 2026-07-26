import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { ScoreOverview } from "@/components/ScoreOverview";
import { ReanalyzeButton } from "@/components/ReanalyzeButton";
import { ReportTabs, type ReportTab } from "@/components/ReportTabs";
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
import { RewritePanel } from "@/components/panels/RewritePanel";
import { SectionsPanel } from "@/components/panels/SectionsPanel";
import { SkillsPanel } from "@/components/panels/SkillsPanel";
import { SuggestionsPanel } from "@/components/panels/SuggestionsPanel";
import { rewriteToText } from "@/lib/ai/rewrite";
import { profileFor } from "@/lib/discipline/profiles";
import { getAnalysis, getTrend, trendKeyFor } from "@/lib/history";
import { shortenUrl } from "@/lib/format";
import type { AnyResult, Check, CheckStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<AnyResult["kind"], string> = {
  website: "Website",
  resume: "Resume / CV",
  document: "Portfolio document",
};

/**
 * The badge a tab carries: how many checks inside it are not passing, and how bad the
 * worst one is. It lets the reader see where the problems are before opening anything,
 * which is the main thing a tab strip costs them versus one long scroll.
 */
function countIssues(checks: Check[]): { issues: number; tone: CheckStatus } {
  const fails = checks.filter((check) => check.status === "fail").length;
  const warns = checks.filter((check) => check.status === "warn").length;
  return { issues: fails + warns, tone: fails > 0 ? "fail" : "warn" };
}

function tabsFor(result: AnyResult): ReportTab[] {
  const shared: ReportTab[] = [
    {
      id: "fix",
      label: "What to fix",
      issues: result.suggestions.length,
      tone: result.suggestions.some((s) => s.severity === "critical") ? "fail" : "warn",
      content: <SuggestionsPanel suggestions={result.suggestions} />,
    },
    {
      id: "edge",
      label: "Your edge",
      content: <AiReviewPanel review={result.ai} />,
    },
  ];

  const basis: ReportTab = {
    id: "basis",
    label: "Basis",
    content: (
      <DisciplinePanel
        discipline={result.discipline}
        upload={result.kind === "website" ? undefined : result.upload}
        kindLabel={KIND_LABEL[result.kind]}
      />
    ),
  };

  if (result.kind === "website") {
    return [
      ...shared,
      {
        id: "sections",
        label: "Sections",
        score: result.sections.score,
        ...countIssues(
          result.sections.sections
            .filter((section) => section.required && !section.found)
            .map((section) => ({
              id: section.id,
              label: section.label,
              status: "fail" as CheckStatus,
              detail: "",
            })),
        ),
        content: <SectionsPanel report={result.sections} />,
      },
      {
        id: "projects",
        label: "Projects",
        score: result.projects.score,
        ...countIssues(result.projects.checks),
        content: <ProjectsPanel report={result.projects} />,
      },
      {
        id: "skills",
        label: "Skills",
        score: result.skills.score,
        ...countIssues(result.skills.checks),
        content: <SkillsPanel report={result.skills} />,
      },
      {
        id: "links",
        label: "Links",
        score: result.links.score,
        ...countIssues(result.links.checks),
        content: <LinksPanel report={result.links} />,
      },
      {
        id: "design",
        label: "Design",
        score: result.design.score,
        ...countIssues(result.design.checks),
        content: <DesignPanel report={result.design} />,
      },
      {
        id: "performance",
        label: "Performance",
        score: result.performance.score,
        ...countIssues(result.performance.checks),
        content: <PerformancePanel report={result.performance} />,
      },
      basis,
    ];
  }

  if (result.kind === "resume") {
    return [
      // The draft leads: everything else describes the problem, this one fixes it.
      {
        id: "draft",
        label: "Improved draft",
        issues: result.rewrite?.placeholders.length,
        tone: "warn",
        content: (
          <RewritePanel
            rewrite={result.rewrite}
            reportId={result.id}
            plainText={result.rewrite ? rewriteToText(result.rewrite) : ""}
          />
        ),
      },
      ...shared,
      {
        id: "ats",
        label: "Machine readability",
        score: result.ats.score,
        ...countIssues(result.ats.checks),
        content: <AtsPanel report={result.ats} />,
      },
      {
        id: "experience",
        label: "Experience",
        score: result.experience.score,
        ...countIssues(result.experience.checks),
        content: <ExperiencePanel report={result.experience} />,
      },
      {
        id: "structure",
        label: "Structure",
        score: result.structure.score,
        ...countIssues(result.structure.checks),
        content: <StructurePanel report={result.structure} />,
      },
      {
        id: "contact",
        label: "Contact",
        score: result.contact.score,
        ...countIssues(result.contact.checks),
        content: <ContactPanel report={result.contact} />,
      },
      {
        id: "skills",
        label: "Skills",
        score: result.skills.score,
        ...countIssues(result.skills.checks),
        content: <SkillsPanel report={result.skills} />,
      },
      {
        id: "language",
        label: "Writing",
        score: result.language.score,
        ...countIssues(result.language.checks),
        content: <LanguagePanel report={result.language} />,
      },
      basis,
    ];
  }

  return [
    ...shared,
    {
      id: "work",
      label: "The work",
      score: result.work.score,
      ...countIssues(result.work.checks),
      content: (
        <WorkPanel report={result.work} workNoun={profileFor(result.discipline.key).workNoun} />
      ),
    },
    {
      id: "presentation",
      label: "Presentation",
      score: result.presentation.score,
      ...countIssues(result.presentation.checks),
      content: <PresentationPanel report={result.presentation} />,
    },
    {
      id: "deliverability",
      label: "Deliverability",
      score: result.deliverability.score,
      ...countIssues(result.deliverability.checks),
      content: <DeliverabilityPanel report={result.deliverability} />,
    },
    {
      id: "contact",
      label: "Contact",
      score: result.contact.score,
      ...countIssues(result.contact.checks),
      content: <ContactPanel report={result.contact} />,
    },
    {
      id: "skills",
      label: "Skills",
      score: result.skills.score,
      ...countIssues(result.skills.checks),
      content: <SkillsPanel report={result.skills} />,
    },
    basis,
  ];
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
  if (!result) return { title: "Report not found — Profiled" };

  const subject =
    result.kind === "website" ? shortenUrl(result.finalUrl, 40) : result.upload.fileName;
  return { title: `${result.overallScore}/100 — ${subject} — Profiled` };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getAnalysis(id);
  if (!result) notFound();

  const trend = await getTrend(trendKeyFor(result), result.kind).catch(() => []);
  const heading = headingFor(result);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-bold tracking-wider text-muted uppercase">
            {KIND_LABEL[result.kind]}
          </span>
          <h1 className="mt-2 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
            {heading.title}
          </h1>
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
              className="btn-secondary rounded-lg px-3.5 py-2 text-sm font-bold"
            >
              Upload a new version
            </Link>
          )}
          <a
            href={`/api/report/${result.id}`}
            className="btn-brand rounded-lg px-3.5 py-2 text-sm font-bold"
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
              className="flex gap-2.5 rounded-lg bg-warn-soft px-4 py-3 text-sm text-ink"
            >
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <ScoreOverview result={result} trend={trend} />
      </div>

      <div className="mt-6">
        <ReportTabs tabs={tabsFor(result)} />
      </div>

      <div className="no-print mt-10 flex items-center justify-between border-t border-line pt-6 text-sm">
        <Link href="/" className="text-brand-ink hover:underline">
          ← Analyze something else
        </Link>
        <Link href="/history" className="text-muted transition-colors hover:text-ink">
          View all analyses
        </Link>
      </div>
    </div>
  );
}
