import type { SkillGapNote } from "@/lib/types";
import { chatJson } from "./groq";

/**
 * Skill-gap notes.
 *
 * Job Match already names what is missing; this explains it. For each skill a posting
 * asks for that the resume does not evidence, a short note on what the thing actually
 * is and how someone would realistically start closing that gap — turning a red X into
 * something actionable rather than leaving the reader to go search the term themselves.
 *
 * The guard here is different from the rewrite's or the cover letter's, because the
 * risk is different. Neither a fabricated number nor an unverified claim about the
 * *reader* is possible here — the model is not being asked about the reader's resume at
 * all, only about a named, public technology or skill. The risk is a fabricated
 * *resource*: a course, book, or URL that sounds plausible and does not exist, or exists
 * but is not what the model claims. So the prompt is barred from naming any specific
 * course, book, instructor, company, or link, and `stripUrls` is a mechanical backstop
 * behind that instruction — the one thing this module cannot verify is left out rather
 * than rendered and trusted.
 */

const SYSTEM_PROMPT = `You explain skills a job posting asks for, to someone whose resume does not yet show them.

For each skill given, reply with two short parts:
1. "whatItIs" — one or two plain sentences on what this actually is and why a posting in this field would ask for it. No hedging, no "it depends" — say what it is.
2. "howToLearn" — one short sentence on a realistic, general way to start closing the gap: e.g. "start with the official documentation and build one small project with it," "this is usually picked up on the job, but a short foundational course covers the basics," "practice problems are the fastest way in for something like this."

Rules that matter:
- Never name a specific course, book, instructor, bootcamp, company, product, or URL. You cannot verify any of them are real, current, or good, and naming one you invented is worse than naming none.
- "Official documentation" or "the project's own docs" is fine to say generically — it is not a specific claim, every real technology has one.
- If a "skill" given is not a real, recognisable thing (a parsing artifact, a fragment of text), skip it entirely rather than inventing an explanation.

Reply with JSON only, in exactly this shape:
{"notes": [{"skill": string, "whatItIs": string, "howToLearn": string}]}`;

export interface SkillGapInput {
  /** Missing skills, most important first — required skills should lead. */
  skills: string[];
  fieldLabel: string;
}

const MAX_SKILLS = 8;

function buildPrompt(input: SkillGapInput, skills: string[]): string {
  return [
    `Field: ${input.fieldLabel}.`,
    "",
    "Skills to explain, in order:",
    ...skills.map((skill, index) => `${index + 1}. ${skill}`),
  ].join("\n");
}

/** A crude but sufficient backstop: no URL survives into a rendered note either way. */
const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

function stripUrls(text: string): string {
  return text.replace(URL_PATTERN, "").replace(/\s{2,}/g, " ").trim();
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? stripUrls(value.replace(/\s+/g, " ").trim()).slice(0, max) : "";
}

/**
 * Keeps only notes for skills that were actually requested, in the order requested, and
 * only when the model returned real content for them — a missing or off-topic reply for
 * one skill should not block the others or render a blank card.
 */
export function normalizeSkillGapNotes(raw: unknown, requestedSkills: string[]): SkillGapNote[] {
  const rawNotes =
    raw && typeof raw === "object" && Array.isArray((raw as { notes?: unknown }).notes)
      ? ((raw as { notes: unknown[] }).notes as unknown[])
      : [];

  const bySkill = new Map<string, { whatItIs: string; howToLearn: string }>();
  for (const entry of rawNotes) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const skill = str(record.skill, 60);
    if (!skill) continue;
    bySkill.set(skill.toLowerCase(), {
      whatItIs: str(record.whatItIs, 320),
      howToLearn: str(record.howToLearn, 220),
    });
  }

  return requestedSkills
    .map((skill): SkillGapNote | null => {
      const match = bySkill.get(skill.toLowerCase());
      if (!match || !match.whatItIs) return null;
      return { skill, whatItIs: match.whatItIs, howToLearn: match.howToLearn };
    })
    .filter((note): note is SkillGapNote => note !== null);
}

export async function draftSkillGapNotes(input: SkillGapInput): Promise<SkillGapNote[]> {
  const skills = input.skills.slice(0, MAX_SKILLS);
  if (skills.length === 0) return [];

  const { json } = await chatJson({
    system: SYSTEM_PROMPT,
    user: buildPrompt(input, skills),
    maxTokens: 1500,
    temperature: 0.3,
  });

  return normalizeSkillGapNotes(json, skills);
}
