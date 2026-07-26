/**
 * Shared shapes for the whole analysis pipeline.
 *
 * Every analyzer module returns a `*Report` that carries its own 0-100 score plus
 * the raw evidence behind it, so the UI and the PDF report can both explain a
 * score instead of just asserting it.
 */

import type { DisciplineFinding, DisciplineKey } from "./discipline/types";

export type { DisciplineFinding, DisciplineKey } from "./discipline/types";

/**
 * Every scored category across the three analysis kinds.
 *
 * One union rather than three because `Suggestion` and `ScoreBreakdown` are shared, and
 * splitting them would mean generic parameters threaded through the UI for no gain.
 * Which subset applies is decided by the weight table for the kind being scored.
 */
export type CategoryKey =
  // website
  | "sections"
  | "projects"
  | "skills"
  | "links"
  | "design"
  | "performance"
  // resume
  | "contact"
  | "structure"
  | "experience"
  | "ats"
  | "language"
  // uploaded portfolio document
  | "work"
  | "presentation"
  | "deliverability";

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

/**
 * Skill groups across every discipline, not just software.
 *
 * The first ten are the original engineering groups. The rest exist because a
 * copywriter's craft, a nurse's clinical training, and a project manager's delivery
 * process are skills in exactly the sense this report means, and filing them under
 * "tools" would be the same dev-shaped mistake the discipline profiles remove.
 */
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
  | "tools"
  | "craft"
  | "strategy"
  | "communication"
  | "research"
  | "domain"
  | "operations";

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
  /** `warn` covers partial credit — e.g. an email printed as text but never linked. */
  status: CheckStatus;
  note: string | null;
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

/* ------------------------------- ai review ----------------------------------- */

/** A claim the model made, paired with the thing on the page that backs it. */
export interface AiHighlight {
  title: string;
  evidence: string;
}

/**
 * The editorial read: what a human reviewer would say about the *substance* of the
 * work, which no amount of static checking can reach. Optional everywhere — a report
 * without an API key configured is still a complete report.
 */
export interface AiReview {
  model: string;
  generatedAt: string;
  /** The one-line pitch this portfolio currently earns, in the reviewer's words. */
  pitch: string;
  /** Two or three sentences on how the work positions its author. */
  positioning: string;
  /** Genuine advantages — the things worth leading with. */
  strengths: AiHighlight[];
  /** Real work the page fails to give itself credit for. */
  underselling: AiHighlight[];
  /** The project that does the most for the author, if one stands out. */
  standoutProject: string | null;
  /** Roles this portfolio reads as competitive for today. */
  bestFitRoles: string[];
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

/**
 * What was analyzed.
 *
 * A URL, an uploaded resume, and an uploaded portfolio document are three different
 * questions with three different sets of checks, and flattening them into one shape
 * with everything optional would push the branching into every consumer. They share a
 * base — score, grade, discipline, suggestions, AI review — and diverge below it.
 */
export type AnalysisKind = "website" | "resume" | "document";

export interface UploadInfo {
  fileName: string;
  format: "pdf" | "docx" | "image";
  bytes: number;
  pageCount: number | null;
  /** "embedded" for a real text layer, "ocr" when the text was recognised from pixels. */
  textOrigin: "embedded" | "ocr";
  ocrConfidence: number | null;
}

export interface AnalysisResult {
  kind: "website";
  id: string;
  url: string;
  finalUrl: string;
  analyzedAt: string;
  durationMs: number;
  overallScore: number;
  grade: string;
  verdict: string;
  meta: AnalysisMeta;
  discipline: DisciplineFinding;
  breakdown: ScoreBreakdown[];
  sections: SectionsReport;
  projects: ProjectsReport;
  skills: SkillsReport;
  links: LinksReport;
  design: DesignReport;
  performance: PerformanceReport;
  suggestions: Suggestion[];
  /** null when no API key is configured, or when the model call failed. */
  ai: AiReview | null;
  warnings: string[];
}

/* --------------------------------- resume ------------------------------------ */

export interface ContactReport {
  score: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  /** Profile and proof-of-work URLs found in the document. */
  links: { label: string; url: string }[];
  checks: Check[];
}

export interface ResumeSection {
  id: string;
  label: string;
  required: boolean;
  found: boolean;
  /** The heading line that matched, so the finding can be argued with. */
  evidence: string | null;
}

export interface ResumeStructureReport {
  score: number;
  sections: ResumeSection[];
  requiredFound: number;
  requiredTotal: number;
  /** Reverse-chronological ordering is the convention every recruiter expects. */
  reverseChronological: boolean | null;
  checks: Check[];
}

export interface ExperienceEntry {
  /** The role line as written. */
  title: string;
  dateRange: string | null;
  bulletCount: number;
  /** Bullets opening with a strong verb rather than "Responsible for". */
  actionVerbBullets: number;
  /** Bullets carrying a number, percentage, or currency amount. */
  quantifiedBullets: number;
  weakBullets: string[];
}

export interface ExperienceReport {
  score: number;
  entries: ExperienceEntry[];
  totalBullets: number;
  quantifiedBullets: number;
  actionVerbBullets: number;
  /** 0-1. The single strongest predictor of a resume that reads as senior. */
  quantificationRate: number;
  checks: Check[];
}

/** Whether a machine can read this at all — invisible to the applicant, decisive for them. */
export interface AtsReport {
  score: number;
  /** True when the text came from a real text layer rather than OCR. */
  machineReadable: boolean;
  /** Headings an ATS parser recognises without guessing. */
  standardHeadings: string[];
  nonStandardHeadings: string[];
  /** Multi-column layouts scramble reading order in most parsers. */
  suspectedColumns: boolean;
  wordsPerPage: number | null;
  fileNameProfessional: boolean;
  checks: Check[];
}

export interface LanguageReport {
  score: number;
  wordCount: number;
  /** Bullets or sentences over the length a recruiter will actually read. */
  longSentences: number;
  passiveHits: string[];
  clicheHits: string[];
  firstPersonHits: number;
  checks: Check[];
}

export interface ResumeResult {
  kind: "resume";
  id: string;
  analyzedAt: string;
  durationMs: number;
  overallScore: number;
  grade: string;
  verdict: string;
  upload: UploadInfo;
  discipline: DisciplineFinding;
  breakdown: ScoreBreakdown[];
  contact: ContactReport;
  structure: ResumeStructureReport;
  experience: ExperienceReport;
  skills: SkillsReport;
  ats: AtsReport;
  language: LanguageReport;
  suggestions: Suggestion[];
  ai: AiReview | null;
  warnings: string[];
}

/* ---------------------------- document portfolio ------------------------------ */

export interface DocumentWork {
  title: string;
  /** 1-based page the piece starts on. */
  page: number;
  wordCount: number;
  imageCount: number;
  /** Terms showing the piece described its outcome, not just its appearance. */
  outcomeTerms: string[];
  issues: string[];
}

export interface DocumentWorkReport {
  score: number;
  count: number;
  works: DocumentWork[];
  averageWords: number;
  withOutcome: number;
  checks: Check[];
}

export interface PresentationReport {
  score: number;
  pageCount: number | null;
  /** Pages carrying neither meaningful text nor an image. */
  emptyPages: number;
  imagesPerPage: number;
  wordsPerPage: number;
  /** True when page dimensions are consistent — a mixed-size deck reads as unfinished. */
  consistentPageSize: boolean;
  /** Landscape suits screen review; portrait suits print. Either is fine, mixing is not. */
  orientation: "portrait" | "landscape" | "mixed";
  checks: Check[];
}

/** Whether the file can actually be sent and opened by the person hiring. */
export interface DeliverabilityReport {
  score: number;
  bytes: number;
  /** Most employer mail servers reject attachments over 10 MB. */
  emailable: boolean;
  hasClickableLinks: boolean;
  linkCount: number;
  brokenCount: number;
  unverifiedCount: number;
  links: LinkFinding[];
  checks: Check[];
}

export interface DocumentResult {
  kind: "document";
  id: string;
  analyzedAt: string;
  durationMs: number;
  overallScore: number;
  grade: string;
  verdict: string;
  upload: UploadInfo;
  discipline: DisciplineFinding;
  breakdown: ScoreBreakdown[];
  contact: ContactReport;
  work: DocumentWorkReport;
  skills: SkillsReport;
  presentation: PresentationReport;
  deliverability: DeliverabilityReport;
  suggestions: Suggestion[];
  ai: AiReview | null;
  warnings: string[];
}

/** Anything the history store can hold and the report page can render. */
export type AnyResult = AnalysisResult | ResumeResult | DocumentResult;

/** Compact row used by the history list so we never ship full reports to a list view. */
export interface HistoryEntry {
  id: string;
  kind: AnalysisKind;
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
  /** Defaults to on whenever GROQ_API_KEY is set. Tests and the PDF route turn it off. */
  aiReview?: boolean;
  /** Overrides detection when the user has told us their field. */
  discipline?: DisciplineKey | null;
}

export interface AnalyzeFileOptions {
  /** Force resume or portfolio checks instead of letting the shape of the file decide. */
  documentKind?: "resume" | "document" | null;
  discipline?: DisciplineKey | null;
  aiReview?: boolean;
  /** Probing links printed inside a document is opt-in; it is slow and often blocked. */
  checkLinks?: boolean;
}
