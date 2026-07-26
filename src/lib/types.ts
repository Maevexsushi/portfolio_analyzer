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
  | "deliverability"
  // resume add-ons, scored separately from the weighted breakdown
  | "jobmatch"
  | "coverletter";

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

/* ----------------------------- resume rewrite -------------------------------- */

/**
 * A gap the rewrite could not fill on its own.
 *
 * The whole feature turns on these. The commonest finding on a weak resume is that
 * nothing carries a number, and a model told to fix that will simply invent one —
 * a fabricated claim on a document its author will be asked to defend. So every
 * missing fact becomes a token they have to fill, with a prompt saying what to measure.
 */
export interface RewritePlaceholder {
  /** The literal token as it appears in the text, e.g. "[N staff]". */
  token: string;
  /** What to find out, in the author's terms. */
  prompt: string;
}

export interface RewrittenBullet {
  /** The line as originally written. Null when the rewrite added structure. */
  before: string | null;
  after: string;
  /** One line on what changed, so the edit can be accepted or rejected on its merits. */
  why: string;
  /** Tokens appearing in `after`. */
  placeholders: string[];
  /**
   * True when a number the model produced was not present in the source and has been
   * replaced with a placeholder. Surfaced so the guard's work is visible, not silent.
   */
  redacted: boolean;
}

export interface RewrittenEntry {
  /** The role line, carried over rather than rewritten — it is a matter of fact. */
  title: string;
  meta: string | null;
  bullets: RewrittenBullet[];
}

export interface RewrittenSection {
  /** An ATS-standard heading, whatever the original called it. */
  heading: string;
  /** Prose sections (a summary) carry a body; experience carries entries. */
  body: string | null;
  entries: RewrittenEntry[];
}

export interface ResumeRewrite {
  model: string;
  generatedAt: string;
  /** Name and target role, as a header line. */
  headline: string;
  contactLine: string;
  sections: RewrittenSection[];
  /** Every distinct gap, deduplicated, in the order they appear. */
  placeholders: RewritePlaceholder[];
  /** What the rewrite changed overall, in a few lines. */
  notes: string[];
  /** How many fabricated numbers the guard caught and replaced. */
  redactedCount: number;
  /**
   * Stock phrases that survived into the draft. Named rather than patched: a fabricated
   * number can be swapped for a placeholder, but prose cannot be safely rewritten after
   * the fact, so the author is told which lines to redo.
   */
  stockPhrases: string[];
}

/* ------------------------------- cover letter ---------------------------------- */

/**
 * Review of a cover letter the author already wrote and pasted in.
 *
 * Same discipline as the resume's Writing tab — the cliché list is the literal same
 * one — plus the handful of things specific to a cover letter: whether it is addressed
 * to a person rather than "To Whom It May Concern", and whether it names the company
 * or role it is meant to be for (a classic tell that a mail-merge left the placeholder
 * in, or that the letter is a generic template never adjusted for this application).
 */
export interface CoverLetterReport {
  score: number;
  wordCount: number;
  clicheHits: string[];
  /** Addressed to a named person, not a generic "To Whom It May Concern". */
  hasPersonalGreeting: boolean;
  /** True when a company name was inferable from the pasted JD and appears in the letter. */
  mentionsCompany: boolean | null;
  /** True when the job title was inferable from the pasted JD and appears in the letter. */
  mentionsRole: boolean | null;
  hasClosingCTA: boolean;
  checks: Check[];
}

/**
 * A drafted cover letter. The number-fabrication guard from the resume rewrite does not
 * transfer directly — a cover letter's risk is invented free-form CLAIMS ("five years
 * leading teams"), not invented numbers, and verifying arbitrary prose against a source
 * document is not something that can be done as mechanically as digit-matching. What
 * *is* checked: every named skill or tool the draft uses is cross-referenced against
 * the resume's own skill findings, and anything the draft mentions that the resume
 * never evidenced is surfaced as an unverified claim rather than silently trusted.
 */
export interface CoverLetterDraft {
  model: string;
  generatedAt: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
  /** Skills/tools named in the draft with no support in the resume's own findings. */
  unverifiedSkills: string[];
  notes: string[];
}

/* ------------------------------- job matching --------------------------------- */

/**
 * How a resume stacks up against one job description.
 *
 * Deliberately kept out of `overallScore`/`breakdown`. Matching a specific posting is a
 * question about fit for *that* role, not about the resume's quality as an artifact —
 * an excellent generalist resume can score low against a highly specialised posting
 * with no defect in the resume at all. Folding that into the primary score would make
 * the same resume's score swing on which JD happened to be pasted in. It gets its own
 * score and its own tab instead, the same way the AI review sits outside the breakdown.
 */
/** A matched skill, with the evidence for it pulled from the resume's own skill findings. */
export interface JobMatchSkillEvidence {
  name: string;
  /** Times it appears in the resume's text. */
  mentions: number;
  /** True when it appeared inside a detected skills section or tag list, not just prose. */
  declared: boolean;
}

export interface JobMatchReport {
  /** Null when the pasted text yielded no recognisable skills to match against. */
  score: number | null;
  /** First line of the pasted text, shown back so the reader can confirm what was read. */
  jobTitle: string | null;
  /** How much of the score required vs. preferred coverage contributes, out of 1. */
  requiredWeight: number;
  preferredWeight: number;
  matchedRequired: JobMatchSkillEvidence[];
  missingRequired: string[];
  matchedPreferred: JobMatchSkillEvidence[];
  missingPreferred: string[];
  checks: Check[];
}

export interface ResumeResult {
  kind: "resume";
  /** "jobmatch" reports came from the dedicated Job Match page — see AnalyzeFileOptions. */
  focus: "full" | "jobmatch";
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
  /** An improved draft, when one was asked for and the model produced a usable one. */
  rewrite: ResumeRewrite | null;
  /** Present only when a job description was pasted in alongside the resume. */
  jobMatch: JobMatchReport | null;
  /** Present only when a cover letter was pasted in, reviewed against this resume. */
  coverLetter: CoverLetterReport | null;
  /** A drafted cover letter, when one was asked for and the model produced a usable one. */
  coverLetterDraft: CoverLetterDraft | null;
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
  /**
   * Draft an improved resume. Resumes only, and opt-in: unlike every other output, the
   * draft is the author's own content and is stored with the report.
   */
  rewrite?: boolean;
  /** Pasted job posting text. Feeds both job matching and cover-letter generation. */
  jobDescription?: string | null;
  /** A cover letter the author already wrote, pasted in for review. */
  coverLetterText?: string | null;
  /** Draft a cover letter from the resume (and the job description, if given). */
  coverLetterDraft?: boolean;
  /**
   * Which result view this run is for. "jobmatch" comes from the dedicated Job Match
   * page and renders only the job-match and cover-letter tabs — the reader came to ask
   * one specific question, not for a full resume review. Defaults to "full".
   */
  focus?: "full" | "jobmatch";
}
