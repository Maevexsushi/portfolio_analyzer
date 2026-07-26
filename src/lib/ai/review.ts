import type {
  AiReview,
  AiHighlight,
  AnalysisMeta,
  ContactReport,
  DocumentWorkReport,
  ExperienceReport,
  HeadingNode,
  LinksReport,
  ProjectsReport,
  SectionsReport,
  SkillsReport,
} from "@/lib/types";
import type { ExtractedDocument } from "@/lib/intake";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { chatJson } from "./groq";

/**
 * The editorial read — "what is the advantage of this work?"
 *
 * Every other analyzer in this project measures *form*: is there a contact section,
 * do the links resolve, how heavy is the page. None of them can read a project
 * description and tell you it is the strongest thing on the site and it is buried at
 * the bottom. That judgement is what this module buys, and it is the only part of the
 * pipeline that leaves the machine.
 *
 * Two rules shape everything below. The model gets a *digest* — the extracted,
 * already-parsed evidence — not raw HTML, so it spends its attention on the work
 * rather than on markup. And every field it returns is re-validated here before it
 * reaches a type: an LLM's output is untrusted input, exactly like the fetched page.
 */

/** Everything the model is allowed to see. Assembled from analyzer output, not HTML. */
export interface ReviewInput {
  finalUrl: string;
  meta: AnalysisMeta;
  headings: HeadingNode[];
  /** Visible page copy, whitespace-collapsed. Truncated before it is sent. */
  text: string;
  sections: SectionsReport;
  projects: ProjectsReport;
  skills: SkillsReport;
  links: LinksReport;
}

const MAX_TEXT_CHARS = 6000;
const MAX_PROJECTS = 12;
const MAX_PROJECT_DESCRIPTION = 400;
const MAX_HEADINGS = 40;

const SYSTEM_PROMPT = `You are a senior engineer who reviews portfolios for hiring panels. You are reading a structured digest of one candidate's portfolio site and answering a single question: what is the real competitive advantage of this person's work, and where does the site fail to give that work credit?

Rules you must follow:
- Ground every claim in the digest. Quote or paraphrase the specific project, phrase, or skill it came from. If the digest does not support a claim, do not make it.
- Never invent employers, metrics, dates, user counts, or technologies that are not in the digest.
- Judge the substance of the work, not the page's checkboxes. Missing sections and broken links are already scored elsewhere; only mention them if they actively bury something strong.
- Be specific and plain. No marketing adjectives, no "passionate", no praise the evidence does not earn.
- Thin evidence is a real finding. If the projects are generic tutorials, say the portfolio does not yet demonstrate a distinct advantage, and return few or no strengths. An empty array is a valid, honest answer.

Reply with JSON only, matching exactly this shape:
{
  "pitch": string,              // one sentence, max 30 words: the pitch this portfolio currently earns, written as a reviewer would summarise the candidate
  "positioning": string,        // 2-3 sentences on how this work positions its author against other candidates at the same level
  "strengths": [                // 0-5 items, strongest first: the genuine advantages worth leading with
    { "title": string,          //   max 8 words, the advantage itself
      "evidence": string }      //   max 40 words, the specific thing in the digest that proves it
  ],
  "underselling": [             // 0-4 items: real work the page fails to give itself credit for
    { "title": string,          //   max 8 words, what is being undersold
      "evidence": string }      //   max 40 words, what is there now and what it should say instead
  ],
  "standoutProject": string,    // exact title of the single strongest project, or "" if none stands out
  "bestFitRoles": [string]      // 0-4 concrete roles this portfolio reads as competitive for today, e.g. "Junior frontend engineer (React)"
}`;

function truncate(input: string, limit: number): string {
  const trimmed = input.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}…`;
}

/**
 * Flattens the analysis into the prompt body.
 *
 * Order is deliberate: the projects come before the page copy, because the projects
 * are what the question is actually about and attention thins out further down a long
 * prompt. The raw copy is last and capped — it is context, not the subject.
 */
export function buildDigest(input: ReviewInput): string {
  const lines: string[] = [];

  lines.push(`URL: ${input.finalUrl}`);
  if (input.meta.title) lines.push(`Page title: ${input.meta.title}`);
  if (input.meta.description) lines.push(`Meta description: ${input.meta.description}`);
  if (input.meta.author) lines.push(`Author: ${input.meta.author}`);

  const projects = input.projects.projects.slice(0, MAX_PROJECTS);
  lines.push("", `## Projects (${input.projects.count} detected)`);
  if (projects.length === 0) {
    lines.push("None could be extracted from the page.");
  }
  projects.forEach((project, index) => {
    const facts = [
      project.techTags.length > 0 ? `stack: ${project.techTags.join(", ")}` : null,
      project.liveUrl ? "has a live demo" : "no live demo",
      project.repoUrl ? "source linked" : "no source link",
      `${project.descriptionWords} words of description`,
    ].filter(Boolean);
    lines.push(
      `${index + 1}. ${project.title}`,
      `   ${truncate(project.description, MAX_PROJECT_DESCRIPTION) || "(no description on the page)"}`,
      `   ${facts.join(" · ")}`,
    );
  });

  const declared = input.skills.skills.filter((skill) => skill.declared).map((s) => s.name);
  const inferred = input.skills.skills.filter((skill) => !skill.declared).map((s) => s.name);
  lines.push("", "## Skills");
  lines.push(`Listed in a skills section: ${declared.join(", ") || "none"}`);
  lines.push(`Mentioned elsewhere in the copy: ${inferred.join(", ") || "none"}`);

  const present = input.sections.sections.filter((s) => s.found).map((s) => s.label);
  const missing = input.sections.sections.filter((s) => s.required && !s.found).map((s) => s.label);
  lines.push("", "## Structure");
  lines.push(`Sections present: ${present.join(", ") || "none"}`);
  lines.push(`Expected sections missing: ${missing.join(", ") || "none"}`);
  lines.push(
    `Headings in order: ${input.headings
      .slice(0, MAX_HEADINGS)
      .map((heading) => `h${heading.level} ${heading.text}`)
      .join(" | ") || "none"}`,
  );

  const essentials = input.links.essentials
    .map((link) => `${link.label}: ${link.found ? (link.url ?? "present") : "missing"}`)
    .join(" · ");
  lines.push("", `## Contact and proof of work`, essentials || "none detected");

  lines.push("", "## Visible page copy (truncated)", truncate(input.text, MAX_TEXT_CHARS));

  return lines.join("\n");
}

/* ------------------------------- validation ---------------------------------- */

function str(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return truncate(value.replace(/\s+/g, " "), maxChars);
}

function highlights(value: unknown, max: number): AiHighlight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): AiHighlight => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        title: str(record.title, 90),
        evidence: str(record.evidence, 320),
      };
    })
    // A highlight with no title says nothing; one with no evidence is the exact
    // unsupported assertion this feature exists to avoid printing.
    .filter((item) => item.title.length > 0 && item.evidence.length > 0)
    .slice(0, max);
}

function stringList(value: unknown, max: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = str(item, maxChars);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === max) break;
  }
  return out;
}

/**
 * Coerces a raw model response into an `AiReview`.
 *
 * Exported for the tests: this is the boundary where an unpredictable response has to
 * become a predictable type, so it is the part worth pinning down.
 */
export function normalizeReview(
  raw: Record<string, unknown>,
  model: string,
  generatedAt: string,
): AiReview {
  const standout = str(raw.standoutProject, 140);
  return {
    model,
    generatedAt,
    pitch: str(raw.pitch, 260),
    positioning: str(raw.positioning, 700),
    strengths: highlights(raw.strengths, 5),
    underselling: highlights(raw.underselling, 4),
    // "" and "none" are both how models decline this field; neither is a project.
    standoutProject: standout && !/^(none|n\/a)$/i.test(standout) ? standout : null,
    bestFitRoles: stringList(raw.bestFitRoles, 4, 80),
  };
}

/** True when the model gave us nothing worth rendering a panel for. */
export function isEmptyReview(review: AiReview): boolean {
  return (
    review.pitch.length === 0 &&
    review.positioning.length === 0 &&
    review.strengths.length === 0 &&
    review.underselling.length === 0
  );
}

/** Runs the review. Throws `AiError` on any failure; callers degrade to `ai: null`. */
export async function reviewPortfolio(input: ReviewInput): Promise<AiReview> {
  const { json, model } = await chatJson({
    system: SYSTEM_PROMPT,
    user: buildDigest(input),
    maxTokens: 3000,
    temperature: 0.3,
  });

  return normalizeReview(json, model, new Date().toISOString());
}

/* --------------------------- uploaded documents ------------------------------- */

/**
 * The same question, asked of a file.
 *
 * The prompt is shared deliberately. "What is the advantage of this person's work, and
 * where does the presentation fail to give it credit" is the same question whether the
 * evidence arrived as a website, a resume, or a PDF deck — only the digest changes.
 * What is added is the field context, because the model has to judge a nurse's resume
 * against nursing and not against the tech resumes it has seen most of.
 */
export interface DocumentReviewInput {
  kind: "resume" | "document";
  document: ExtractedDocument;
  profile: DisciplineProfile;
  contact: ContactReport;
  skills: SkillsReport;
  experience?: ExperienceReport;
  work?: DocumentWorkReport;
}

function disciplineHeader(profile: DisciplineProfile, kind: "resume" | "document"): string {
  return [
    `The author appears to work in: ${profile.label}.`,
    `Judge this against that field's norms, not against software engineering.`,
    `A reviewer in this field expects, for each piece of work: ${profile.depthExpectations.join("; ")}.`,
    kind === "resume"
      ? "This is a resume/CV. Its job is to get one interview."
      : `This is a portfolio document — a file they send or hand over, not a website. Its ${profile.workNoun.plural} are the substance.`,
  ].join(" ");
}

export function buildDocumentDigest(input: DocumentReviewInput): string {
  const { document, profile, contact, skills } = input;
  const lines: string[] = [];

  lines.push(disciplineHeader(profile, input.kind));
  lines.push("");
  lines.push("## The file");
  lines.push(
    `${document.format.toUpperCase()}, ${(document.bytes / 1024).toFixed(0)} KB, ${
      document.pageCount === null ? "no fixed pagination" : `${document.pageCount} pages`
    }, ${document.wordCount} words${
      document.origin === "ocr"
        ? `. Text was recognised by OCR at ${document.ocrConfidence}% confidence, so quoted wording may be slightly wrong — do not comment on spelling or typos.`
        : "."
    }`,
  );

  lines.push("", "## Contact");
  lines.push(
    [
      contact.name ? `Name: ${contact.name}` : "Name: not readable",
      contact.email ? `Email: ${contact.email}` : "Email: missing",
      contact.location ? `Location: ${contact.location}` : "Location: not stated",
      contact.links.length > 0
        ? `Links: ${contact.links.map((link) => `${link.label} ${link.url}`).join(", ")}`
        : "Links: none",
    ].join(" · "),
  );

  if (input.experience) {
    lines.push("", "## Experience as written");
    for (const entry of input.experience.entries.slice(0, 8)) {
      lines.push(
        `- ${entry.title}${entry.dateRange ? ` [${entry.dateRange}]` : ""} — ${entry.bulletCount} bullets, ${entry.quantifiedBullets} with numbers`,
      );
      for (const weak of entry.weakBullets) lines.push(`    weak bullet: ${weak}`);
    }
    lines.push(
      `Overall: ${input.experience.quantifiedBullets} of ${input.experience.totalBullets} bullets carry a number.`,
    );
  }

  if (input.work) {
    lines.push("", `## ${profile.workNoun.plural} in the document`);
    if (input.work.works.length === 0) lines.push("None could be identified.");
    for (const piece of input.work.works.slice(0, 12)) {
      lines.push(
        `- p${piece.page} "${piece.title}" — ${piece.wordCount} words, ${piece.imageCount} images${
          piece.outcomeTerms.length > 0 ? `, mentions ${piece.outcomeTerms.join("/")}` : ", no outcome stated"
        }`,
      );
    }
  }

  const declared = skills.skills.filter((skill) => skill.declared).map((skill) => skill.name);
  const inferred = skills.skills.filter((skill) => !skill.declared).map((skill) => skill.name);
  lines.push("", "## Skills");
  lines.push(`Listed explicitly: ${declared.join(", ") || "none"}`);
  lines.push(`Mentioned in passing: ${inferred.join(", ") || "none"}`);

  lines.push("", "## Full text (truncated)", truncate(document.text, MAX_TEXT_CHARS));

  return lines.join("\n");
}

export async function reviewDocument(input: DocumentReviewInput): Promise<AiReview> {
  const { json, model } = await chatJson({
    system: SYSTEM_PROMPT,
    user: buildDocumentDigest(input),
    maxTokens: 3000,
    temperature: 0.3,
  });

  return normalizeReview(json, model, new Date().toISOString());
}
