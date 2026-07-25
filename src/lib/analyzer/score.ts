import type {
  CategoryKey,
  DesignReport,
  LinksReport,
  PerformanceReport,
  ProjectsReport,
  ScoreBreakdown,
  SectionsReport,
  SkillsReport,
} from "@/lib/types";

/**
 * Portfolio Score.
 *
 * Weights reflect what actually decides an application: the projects carry the most,
 * then whether the page covers the expected ground and links out to proof of work.
 * Performance matters least — a slow portfolio still gets read; an empty one does not.
 */
export const CATEGORY_WEIGHTS: Record<CategoryKey, number> = {
  projects: 0.28,
  sections: 0.18,
  design: 0.16,
  skills: 0.14,
  links: 0.14,
  performance: 0.1,
};

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  projects: "Projects",
  sections: "Sections",
  design: "Design & Accessibility",
  skills: "Skills",
  links: "Links & Contact",
  performance: "Performance",
};

export function gradeFor(score: number): string {
  if (score >= 93) return "A+";
  if (score >= 87) return "A";
  if (score >= 82) return "B+";
  if (score >= 75) return "B";
  if (score >= 68) return "C+";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function verdictFor(score: number): string {
  if (score >= 90) return "Application-ready. This portfolio will hold up in a hiring review.";
  if (score >= 80) return "Strong. A few targeted fixes will make it excellent.";
  if (score >= 70) return "Solid foundation with clear gaps worth closing before you apply.";
  if (score >= 55) return "Incomplete. Reviewers will have questions this page does not answer.";
  if (score >= 40) return "Needs substantial work before it helps your application.";
  return "Not ready to send. Start with projects and contact details.";
}

interface Reports {
  sections: SectionsReport;
  projects: ProjectsReport;
  skills: SkillsReport;
  links: LinksReport;
  design: DesignReport;
  performance: PerformanceReport;
}

function summarize(key: CategoryKey, reports: Reports): string {
  switch (key) {
    case "sections":
      return `${reports.sections.requiredFound}/${reports.sections.requiredTotal} expected sections present, plus ${reports.sections.bonusFound} bonus.`;
    case "projects":
      return reports.projects.count === 0
        ? "No projects detected."
        : `${reports.projects.count} project${reports.projects.count === 1 ? "" : "s"}, average depth ${reports.projects.averageQuality}/100.`;
    case "skills":
      return `${reports.skills.total} technologies across ${reports.skills.categoriesCovered.length} categories.`;
    case "links":
      return reports.links.checkedCount === 0
        ? `${reports.links.total} links found; none probed.`
        : `${reports.links.brokenCount} broken of ${reports.links.checkedCount} probed.`;
    case "design": {
      const failed = reports.design.checks.filter((check) => check.status === "fail").length;
      return failed === 0
        ? "No design or accessibility failures."
        : `${failed} design/accessibility check${failed === 1 ? "" : "s"} failing.`;
    }
    case "performance":
      return `${reports.performance.ttfbMs} ms to first byte, ${reports.performance.requestCount} requests.`;
  }
}

export function buildBreakdown(reports: Reports): ScoreBreakdown[] {
  return (Object.keys(CATEGORY_WEIGHTS) as CategoryKey[])
    .map((key) => ({
      key,
      label: CATEGORY_LABELS[key],
      score: reports[key].score,
      weight: CATEGORY_WEIGHTS[key],
      summary: summarize(key, reports),
    }))
    .sort((a, b) => b.weight - a.weight);
}

export function overallScore(breakdown: ScoreBreakdown[]): number {
  const total = breakdown.reduce((sum, entry) => sum + entry.score * entry.weight, 0);
  const weightSum = breakdown.reduce((sum, entry) => sum + entry.weight, 0);
  return Math.round(total / weightSum);
}
