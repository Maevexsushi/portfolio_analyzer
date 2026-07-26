import { randomUUID } from "node:crypto";
import { fetchPage } from "@/lib/fetcher";
import { AiError, isAiConfigured } from "@/lib/ai/groq";
import { isEmptyReview, reviewPortfolio } from "@/lib/ai/review";
import { detectDiscipline } from "@/lib/discipline/detect";
import { profileFor } from "@/lib/discipline/profiles";
import type { AiReview, AnalysisResult, AnalyzeOptions } from "@/lib/types";
import type { PageContext } from "./context";
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

const DEFAULTS: Omit<Required<AnalyzeOptions>, "aiReview" | "discipline"> = {
  checkLinks: true,
  maxLinkChecks: 25,
};

/** Why the editorial read is missing, phrased for the caveats list on the report. */
const AI_FAILURE_NOTE: Record<string, string> = {
  auth: "The AI review was skipped: the Groq API rejected the configured key.",
  "rate-limit": "The AI review was skipped: the Groq API rate limit was hit. Re-analyze in a minute to get it.",
  timeout: "The AI review was skipped: the model did not answer in time.",
  malformed: "The AI review was skipped: the model returned a response we could not read.",
  empty: "The AI review was skipped: the model returned nothing.",
};

const PROJECTS_PATH = /^\/(projects?|work|portfolio|case-studies|case-study|writing\/projects)\/?$/i;

/**
 * Heading text, repeated so it weighs more in discipline detection than body copy.
 * What someone titles their sections is a much better signal of their field than what
 * they happen to mention once in a paragraph.
 */
function headingText(ctx: PageContext): string {
  const headings = ctx.headings.map((heading) => heading.text).join(" ");
  return `${headings} ${headings}`;
}

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

  /*
   * The field has to be settled before any check runs, because it decides what several
   * of them are even looking for — which platforms count as proof of work, which skill
   * groups a credible practitioner covers. Detection reads the page's own vocabulary,
   * with the headings and metadata weighted in by being counted twice: a site whose
   * <title> says "Photographer" is telling us more than one mention in a paragraph.
   */
  const disciplineText = [ctx.meta.title, ctx.meta.description, headingText(ctx), ctx.text].join(
    " ",
  );
  const discipline = detectDiscipline(disciplineText, { chosen: settings.discipline ?? null });
  const profile = profileFor(discipline.key);

  // Link probing is the slow part; overlap it with the CPU-bound analyzers.
  const linksPromise = analyzeLinks(ctx, {
    checkLinks: settings.checkLinks,
    maxLinkChecks: settings.maxLinkChecks,
    profile,
  });

  const sections = analyzeSections(ctx);
  const projects = analyzeProjects(ctx);
  const skills = analyzeSkills(ctx, profile);
  const design = analyzeDesign(ctx);
  const performance = analyzePerformance(ctx, assets);
  const links = await linksPromise;

  const reports = { sections, projects, skills, links, design, performance };
  const breakdown = buildBreakdown(reports);
  const overall = overallScore(breakdown);

  /*
   * The editorial read runs last, on the extracted evidence rather than the raw page,
   * and is strictly additive: any failure becomes a caveat on an otherwise complete
   * report. It cannot start earlier — the digest quotes the link checker's findings.
   */
  // No key means the feature is off, not broken — the panel explains how to turn it on
  // rather than the report carrying a caveat about a step nobody asked for.
  const wantsAi = (settings.aiReview ?? true) && isAiConfigured();
  let ai: AiReview | null = null;
  if (wantsAi) {
    try {
      const review = await reviewPortfolio({
        finalUrl: page.finalUrl,
        meta: ctx.meta,
        headings: ctx.headings,
        text: ctx.text,
        sections,
        projects,
        skills,
        links,
      });
      ai = isEmptyReview(review) ? null : review;
      if (!ai) {
        warnings.push("The AI review came back empty and was dropped.");
      }
    } catch (error) {
      const code = error instanceof AiError ? error.code : "network";
      warnings.push(
        AI_FAILURE_NOTE[code] ??
          "The AI review was skipped: the model could not be reached. The rest of the report is unaffected.",
      );
      console.error("ai review failed", error);
    }
  }

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
    kind: "website",
    id: randomUUID(),
    url,
    finalUrl: page.finalUrl,
    analyzedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    overallScore: overall,
    grade: gradeFor(overall),
    verdict: verdictFor(overall),
    meta: ctx.meta,
    discipline,
    breakdown,
    ...reports,
    suggestions: generateSuggestions(reports),
    ai,
    warnings,
  };
}
