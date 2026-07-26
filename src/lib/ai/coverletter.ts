import type { CoverLetterDraft, ContactReport, ExperienceReport, SkillsReport } from "@/lib/types";
import type { ExtractedDocument } from "@/lib/intake";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { composeVocabulary, detectSkillNames } from "@/lib/discipline/skills";
import { chatJson } from "./groq";

/**
 * Cover letter drafting.
 *
 * The resume rewrite's fabrication guard does not transfer here as-is, and it is worth
 * being explicit about why. `stripInventedNumbers` works because a number is a small,
 * mechanically comparable token — every digit in the output either does or does not
 * appear in the source. A cover letter's risk is different: an invented free-form CLAIM
 * ("led a five-person team", "three years of experience with this exact problem"). There
 * is no reliable mechanical test for whether an arbitrary sentence is supported by a
 * source document — that is a genuinely hard problem, not one this module pretends to
 * solve.
 *
 * What it does instead, honestly bounded: every named skill or tool the draft uses is
 * checked against the resume's own skill findings, and anything the letter mentions that
 * the resume never evidenced is surfaced as an unverified claim. That catches the most
 * common and most damaging failure (the letter name-drops a technology the applicant has
 * never used) without claiming to catch everything. The prompt carries the rest of the
 * weight, and the UI says plainly that this is not exhaustive fact-checking.
 */

const SYSTEM_PROMPT = `You write cover letters. You are given a resume's full text and, if provided, a job posting and a company name, and you draft a cover letter as JSON.

THE RULE THAT MATTERS: only use what is in the resume. Do not invent employers, titles, dates, metrics, responsibilities, or years of experience beyond what the resume states. If the resume does not say it, you do not know it. Where you want to make a connection between the resume and the posting that the resume does not explicitly state, phrase it as drawing a line between two things that are both true in the source — do not add a new fact to make the connection.

What you SHOULD do:
- Open with a specific reason for applying to this role/company if a job posting or company name was given; otherwise open by naming the role or field from the resume itself.
- Reference two or three concrete things from the resume's actual experience — real projects, real roles, real results — rather than generic enthusiasm.
- If a job posting was given, connect the resume's real experience to what the posting actually asks for, using the posting's own language where the resume genuinely supports it.
- Keep it to 3-4 short paragraphs, 250-350 words total.
- Close with a plain, direct next step (available for a call/interview).
- Avoid stock phrases entirely: hard-working, team player, passionate about, proven track record, dynamic professional, excellent communication skills, references available on request, fast-paced environment.

What you MUST NOT do:
- Invent a number, a metric, a team size, or a length of experience not stated in the resume.
- Invent a skill, tool, or technology not present in the resume.
- Claim a job title, employer, or qualification the resume does not contain.

Reply with JSON only, in exactly this shape:
{
  "greeting": string,       // "Dear [Name]," if a real name was given, otherwise "Dear Hiring Manager,"
  "paragraphs": [string],   // 3-4 paragraphs, plain strings, no markdown
  "closing": string,        // sign-off line, e.g. "I would welcome the chance to discuss this further."
  "notes": [string]         // 1-3 lines on what you drew from the resume and, if given, the posting
}`;

export interface CoverLetterDraftInput {
  document: ExtractedDocument;
  profile: DisciplineProfile;
  contact: ContactReport;
  experience: ExperienceReport;
  skills: SkillsReport;
  jobDescriptionText: string | null;
  companyName: string | null;
  recipientName: string | null;
}

const MAX_SOURCE_CHARS = 7000;
const MAX_JD_CHARS = 4000;

function buildPrompt(input: CoverLetterDraftInput): string {
  const lines: string[] = [
    `Field: ${input.profile.label}.`,
    input.companyName ? `Company: ${input.companyName}.` : "Company: not given — do not name one.",
    input.recipientName
      ? `Addressed to: ${input.recipientName}.`
      : "No specific recipient name — use 'Dear Hiring Manager,'.",
    "",
    "## The resume, in full",
    input.document.text.slice(0, MAX_SOURCE_CHARS),
  ];

  if (input.jobDescriptionText) {
    lines.push("", "## The job posting", input.jobDescriptionText.slice(0, MAX_JD_CHARS));
  } else {
    lines.push("", "## No job posting was provided — write a general letter for this field.");
  }

  return lines.join("\n");
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Which named skills the draft uses that the resume itself never evidenced. This is the
 * guard's entire enforcement surface — see the module comment for what it does and does
 * not cover.
 */
export function findUnverifiedSkills(
  draftText: string,
  profile: DisciplineProfile,
  resumeSkillNames: Set<string>,
): string[] {
  const vocabulary = composeVocabulary(profile);
  const mentioned = detectSkillNames(draftText, vocabulary, 20);
  return mentioned.filter((name) => !resumeSkillNames.has(name));
}

export function normalizeCoverLetterDraft(
  raw: Record<string, unknown>,
  profile: DisciplineProfile,
  resumeSkillNames: Set<string>,
  model: string,
  generatedAt: string,
): CoverLetterDraft {
  const greeting = str(raw.greeting, 60) || "Dear Hiring Manager,";
  const paragraphs = (Array.isArray(raw.paragraphs) ? raw.paragraphs : [])
    .map((p) => str(p, 900))
    .filter(Boolean)
    .slice(0, 6);
  const closing = str(raw.closing, 200);
  const notes = (Array.isArray(raw.notes) ? raw.notes : [])
    .map((n) => str(n, 240))
    .filter(Boolean)
    .slice(0, 4);

  const fullText = [greeting, ...paragraphs, closing].join("\n");
  const unverifiedSkills = findUnverifiedSkills(fullText, profile, resumeSkillNames);

  return { model, generatedAt, greeting, paragraphs, closing, unverifiedSkills, notes };
}

export function isEmptyCoverLetterDraft(draft: CoverLetterDraft): boolean {
  return draft.paragraphs.length === 0;
}

/** Plain text of the draft, for the copy button and the PDF. */
export function coverLetterToText(draft: CoverLetterDraft): string {
  return [draft.greeting, "", ...draft.paragraphs.flatMap((p) => [p, ""]), draft.closing]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function draftCoverLetter(input: CoverLetterDraftInput): Promise<CoverLetterDraft> {
  const { json, model } = await chatJson({
    system: SYSTEM_PROMPT,
    user: buildPrompt(input),
    maxTokens: 2000,
    temperature: 0.4,
  });

  const resumeSkillNames = new Set(input.skills.skills.map((skill) => skill.name));
  return normalizeCoverLetterDraft(json, input.profile, resumeSkillNames, model, new Date().toISOString());
}
