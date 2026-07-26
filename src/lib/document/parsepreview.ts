import type {
  ContactReport,
  ExperienceReport,
  ParsePreview,
  ParsePreviewEntry,
  ResumeStructureReport,
  SkillsReport,
} from "@/lib/types";
import { RESUME_SECTIONS } from "./sections";

/**
 * The ATS parse preview.
 *
 * Every other tab tells you whether a field passed a check; this shows the field
 * itself, the way a resume parser actually has to build it — one line at a time, with
 * no markup to lean on. That is the same class of heuristic a real applicant tracking
 * system runs, not a claim to replicate any specific one, and the point is the same
 * either way: a name that gets swallowed by a "not found" or a role line that never
 * splits into a title an ATS can file under the right field is invisible on a plain
 * score, and very visible once you see the field it actually landed in.
 *
 * Two pieces here are genuinely new extraction, not a repackaging of an existing
 * report, and both follow the rest of this codebase's rule: decline rather than guess
 * badly.
 *
 * - Splitting a role line into title and company. A comma, dash, or "at" separates
 *   them in most resumes, but which side is which is not fixed — "Monzo, Senior
 *   Backend Engineer" and "Senior Backend Engineer, Monzo" are both common. The split
 *   is only trusted when exactly one side reads as a job title (matches a broad list
 *   of role words) and the other does not; a line that splits into two title-shaped
 *   or two company-shaped halves is left unsplit rather than assigned a coin-flip.
 * - Reading the Education section's own lines, not just detecting the heading. Nothing
 *   upstream parses degree/school/year out of them — that would need field-specific
 *   knowledge this heuristic does not have — so they are shown as extracted, verbatim.
 */

const EDUCATION_HEADING =
  RESUME_SECTIONS.find((section) => section.id === "education")?.pattern ??
  /^(education|academic|qualifications?|training)\b/i;

/** Mirrors the heading-boundary heuristic already used to scope the Skills section. */
const LIKELY_HEADING = /^[A-Z][A-Za-z &/'-]{2,40}:?$/;

const MAX_EDUCATION_LINES = 6;

function educationLines(lines: string[]): string[] {
  const collected: string[] = [];
  let capturing = false;

  for (const line of lines) {
    if (EDUCATION_HEADING.test(line)) {
      capturing = true;
      continue;
    }
    if (!capturing) continue;

    const isAllCaps = line === line.toUpperCase() && /[A-Z]{3}/.test(line) && line.length < 48;
    if (isAllCaps || (LIKELY_HEADING.test(line) && line.split(" ").length <= 4)) break;

    collected.push(line);
    if (collected.length >= MAX_EDUCATION_LINES) break;
  }

  return collected;
}

/** Broad enough to catch most disciplines' role words without also matching company names. */
const ROLE_WORD =
  /\b(engineer|developer|programmer|manager|director|analyst|designer|specialist|coordinator|lead|architect|consultant|scientist|administrator|technician|associate|assistant|officer|executive|intern|founder|president|owner|supervisor|representative|strategist|producer|editor|writer|nurse|therapist|counsel(?:l?or)|teacher|instructor|professor|paralegal|accountant|auditor|recruiter|planner|advisor|adviser|agent|clerk|technologist|practitioner|marketer|copywriter|photographer|videographer|electrician|plumber|mechanic|welder|carpenter)\b/i;

const SPLIT_DELIMITERS = [/\s+[-–—]\s+/, /\s*\|\s*/, /,\s*/, /\s+at\s+/i, /\s+@\s+/];

/**
 * Splits a role line's remainder (dates already stripped) into title/company, or
 * declines. Declining is the common outcome for anything that is not "A, B" shaped —
 * that is the honest answer for a line this cannot confidently take apart.
 */
function splitTitleCompany(remainder: string): { title: string | null; company: string | null } {
  const trimmed = remainder.trim();
  if (!trimmed) return { title: null, company: null };

  for (const delimiter of SPLIT_DELIMITERS) {
    const parts = trimmed
      .split(delimiter)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length !== 2) continue;

    const [a, b] = parts;
    const aIsRole = ROLE_WORD.test(a);
    const bIsRole = ROLE_WORD.test(b);
    if (aIsRole === bIsRole) continue; // both read as a title, or neither does — ambiguous

    return aIsRole ? { title: a, company: b } : { title: b, company: a };
  }

  return { title: null, company: null };
}

function stripDateRange(line: string, dateRange: string | null): string {
  return dateRange ? line.replace(dateRange, "").trim() : line;
}

export function buildParsePreview(
  lines: string[],
  contact: ContactReport,
  experience: ExperienceReport,
  structure: ResumeStructureReport,
  skills: SkillsReport,
): ParsePreview {
  const workHistory: ParsePreviewEntry[] = experience.entries.map((entry) => {
    const remainder = stripDateRange(entry.title, entry.dateRange);
    const { title, company } = splitTitleCompany(remainder);
    return {
      raw: entry.title,
      title,
      company,
      dateRange: entry.dateRange,
      bulletCount: entry.bulletCount,
    };
  });

  const educationFound = structure.sections.some(
    (section) => section.id === "education" && section.found,
  );

  return {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    location: contact.location,
    links: contact.links,
    workHistory,
    educationFound,
    educationLines: educationFound ? educationLines(lines) : [],
    skillsDeclared: skills.skills.filter((skill) => skill.declared).map((skill) => skill.name),
    skillsTotal: skills.total,
  };
}
