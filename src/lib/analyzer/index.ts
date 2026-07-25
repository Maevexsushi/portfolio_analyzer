import { randomUUID } from "node:crypto";
import { fetchPage } from "@/lib/fetcher";
import type { AnalysisResult, AnalyzeOptions } from "@/lib/types";
import { collectAssets } from "./assets";
import { buildContext } from "./context";
import { analyzeDesign } from "./design";
import { analyzeLinks } from "./links";
import { analyzePerformance } from "./performance";
import { analyzeProjects } from "./projects";
import { buildBreakdown, gradeFor, overallScore, verdictFor } from "./score";
import { analyzeSections } from "./sections";
import { analyzeSkills } from "./skills";
import { generateSuggestions } from "./suggestions";

export { FetchError } from "@/lib/fetcher";
export { CATEGORY_LABELS, CATEGORY_WEIGHTS } from "./score";
export { SKILL_CATEGORY_LABELS } from "./skills";

const DEFAULTS: Required<AnalyzeOptions> = {
  checkLinks: true,
  maxLinkChecks: 25,
};

const PROJECTS_PATH = /^\/(projects?|work|portfolio|case-studies|case-study|writing\/projects)\/?$/i;

/** The URL a "Projects" link on this page points to, if there is a dedicated one. */
function findProjectsSubpage(urls: string[]): string | null {
  for (const url of urls) {
    try {
      if (PROJECTS_PATH.test(new URL(url).pathname)) return url;
    } catch {
      // Not an absolute URL we can inspect; skip it.
    }
  }
  return null;
}

/**
 * Runs the full analysis for one URL.
 *
 * Order matters: the page fetch has to finish first, then assets (their CSS feeds the
 * design review), then the link probes run alongside the purely-static analyzers since
 * those need no network.
 */
export async function analyzePortfolio(
  url: string,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const settings = { ...DEFAULTS, ...options };
  const startedAt = Date.now();
  const warnings: string[] = [];

  const page = await fetchPage(url);
  if (page.truncated) {
    warnings.push("The page exceeded 3 MB and was truncated; later sections may be missed.");
  }
  if (page.redirectChain.length > 0) {
    warnings.push(`Redirected ${page.redirectChain.length}× before landing on ${page.finalUrl}.`);
  }

  const ctx = buildContext(page);

  const assets = await collectAssets(ctx);
  if (assets.css) {
    // Give the design review the real stylesheet text, not just inline styles.
    ctx.css = `${ctx.css}\n${assets.css}`;
  }
  const externalStylesheets = assets.resources.filter(
    (resource) => resource.type === "stylesheet",
  ).length;
  if (externalStylesheets > 0 && assets.stylesheetsFetched === 0) {
    warnings.push(
      "None of the external stylesheets could be downloaded, so palette, font, and contrast checks are based on inline CSS only.",
    );
  }

  // Link probing is the slow part; overlap it with the CPU-bound analyzers.
  const linksPromise = analyzeLinks(ctx, {
    checkLinks: settings.checkLinks,
    maxLinkChecks: settings.maxLinkChecks,
  });

  const sections = analyzeSections(ctx);
  const projects = analyzeProjects(ctx);
  const skills = analyzeSkills(ctx);
  const design = analyzeDesign(ctx);
  const performance = analyzePerformance(ctx, assets);
  const links = await linksPromise;

  const reports = { sections, projects, skills, links, design, performance };
  const breakdown = buildBreakdown(reports);
  const overall = overallScore(breakdown);

  if (projects.count === 0) {
    // A homepage that files its work on a subpage is common and is not the same
    // failure as having no projects — point at the better URL instead of just scoring 0.
    const subpage = findProjectsSubpage(links.links.map((link) => link.url));
    if (subpage) {
      warnings.push(
        `No projects were detected on this page, but it links to ${subpage} — analyze that URL directly for a full project review.`,
      );
    } else {
      warnings.push(
        "No projects were detected. If this page renders its projects with client-side JavaScript, a static analyzer cannot see them.",
      );
    }
  }

  return {
    id: randomUUID(),
    url,
    finalUrl: page.finalUrl,
    analyzedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    overallScore: overall,
    grade: gradeFor(overall),
    verdict: verdictFor(overall),
    meta: ctx.meta,
    breakdown,
    ...reports,
    suggestions: generateSuggestions(reports),
    warnings,
  };
}
