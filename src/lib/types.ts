/**
 * Shared shapes for the whole analysis pipeline.
 *
 * Every analyzer module returns a `*Report` that carries its own 0-100 score plus
 * the raw evidence behind it, so the UI and the PDF report can both explain a
 * score instead of just asserting it.
 */

export type CategoryKey =
  | "sections"
  | "projects"
  | "skills"
  | "links"
  | "design"
  | "performance";

export type CheckStatus = "pass" | "warn" | "fail";

export type Severity = "critical" | "important" | "polish";

/** A single pass/warn/fail assertion with the evidence that produced it. */
export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface ScoreBreakdown {
  key: CategoryKey;
  label: string;
  score: number;
  weight: number;
  summary: string;
}

/* ---------------------------------- sections --------------------------------- */

export interface SectionFinding {
  id: string;
  label: string;
  /** Required sections count against the score; optional ones only add bonus. */
  required: boolean;
  found: boolean;
  evidence: string[];
}

export interface SectionsReport {
  score: number;
  requiredFound: number;
  requiredTotal: number;
  bonusFound: number;
  sections: SectionFinding[];
}

/* ---------------------------------- projects --------------------------------- */

export interface ProjectFinding {
  title: string;
  description: string;
  descriptionWords: number;
  liveUrl: string | null;
  repoUrl: string | null;
  imageCount: number;
  techTags: string[];
  quality: number;
  issues: string[];
}

export interface ProjectsReport {
  score: number;
  count: number;
  projects: ProjectFinding[];
  withDescription: number;
  withLiveDemo: number;
  withRepo: number;
  withImage: number;
  averageQuality: number;
  checks: Check[];
}

/* ----------------------------------- skills ---------------------------------- */

export type SkillCategory =
  | "languages"
  | "frontend"
  | "backend"
  | "database"
  | "devops"
  | "mobile"
  | "design"
  | "data"
  | "testing"
  | "tools";

export interface SkillFinding {
  name: string;
  category: SkillCategory;
  mentions: number;
  /** true when the skill appeared inside a detected skills section or tag list. */
  declared: boolean;
}

export interface SkillsReport {
  score: number;
  total: number;
  skills: SkillFinding[];
  categoriesCovered: SkillCategory[];
  missingCategories: SkillCategory[];
  hasSkillsSection: boolean;
  checks: Check[];
}

/* ----------------------------------- links ----------------------------------- */

export type LinkKind =
  | "social"
  | "repo"
  | "email"
  | "phone"
  | "resume"
  | "internal"
  | "anchor"
  | "external";

export interface LinkFinding {
  url: string;
  text: string;
  kind: LinkKind;
  platform: string | null;
  checked: boolean;
  status: number | null;
  ok: boolean | null;
  /** Host answered but refused the automated request — unverifiable, not broken. */
  blocked: boolean;
  error: string | null;
  redirectedTo: string | null;
}

export interface EssentialLink {
  id: string;
  label: string;
  found: boolean;
  url: string | null;
}

export interface LinksReport {
  score: number;
  total: number;
  checkedCount: number;
  brokenCount: number;
  /** Probed links whose host blocks automated requests; reported, never scored against. */
  unverifiedCount: number;
  links: LinkFinding[];
  broken: LinkFinding[];
  unverified: LinkFinding[];
  essentials: EssentialLink[];
  checks: Check[];
}

/* ----------------------------------- design ---------------------------------- */

export interface HeadingNode {
  level: number;
  text: string;
}

export interface DesignReport {
  score: number;
  checks: Check[];
  palette: string[];
  fonts: string[];
  headings: HeadingNode[];
  imagesTotal: number;
  imagesMissingAlt: number;
  responsive: boolean;
  darkModeAware: boolean;
  semanticLandmarks: string[];
}

/* -------------------------------- performance -------------------------------- */

export interface ResourceGroup {
  type: string;
  count: number;
  sameOrigin: number;
  thirdParty: number;
}

export interface PerformanceReport {
  score: number;
  htmlBytes: number;
  ttfbMs: number;
  downloadMs: number;
  requestCount: number;
  resources: ResourceGroup[];
  renderBlockingScripts: number;
  renderBlockingStyles: number;
  inlineStyleBytes: number;
  inlineScriptBytes: number;
  imagesTotal: number;
  imagesLazy: number;
  imagesMissingDimensions: number;
  compression: string | null;
  cacheControl: string | null;
  server: string | null;
  https: boolean;
  checks: Check[];
}

/* -------------------------------- suggestions -------------------------------- */

export interface Suggestion {
  id: string;
  category: CategoryKey | "general";
  severity: Severity;
  title: string;
  detail: string;
  /** Rough number of overall points recovered by fixing this. */
  impact: number;
}

/* ---------------------------------- result ----------------------------------- */

export interface AnalysisMeta {
  title: string;
  description: string;
  ogImage: string | null;
  favicon: string | null;
  lang: string | null;
  author: string | null;
}

export interface AnalysisResult {
  id: string;
  url: string;
  finalUrl: string;
  analyzedAt: string;
  durationMs: number;
  overallScore: number;
  grade: string;
  verdict: string;
  meta: AnalysisMeta;
  breakdown: ScoreBreakdown[];
  sections: SectionsReport;
  projects: ProjectsReport;
  skills: SkillsReport;
  links: LinksReport;
  design: DesignReport;
  performance: PerformanceReport;
  suggestions: Suggestion[];
  warnings: string[];
}

/** Compact row used by the history list so we never ship full reports to a list view. */
export interface HistoryEntry {
  id: string;
  url: string;
  finalUrl: string;
  title: string;
  analyzedAt: string;
  overallScore: number;
  grade: string;
}

export interface AnalyzeOptions {
  /** Network link checking is the slowest step; callers can turn it off. */
  checkLinks?: boolean;
  maxLinkChecks?: number;
}
