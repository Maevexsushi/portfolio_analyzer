import type { Check, ResumeSection, ResumeStructureReport } from "@/lib/types";
import type { ExtractedDocument } from "@/lib/intake";
import { scoreFromChecks } from "@/lib/analyzer/check-utils";

/**
 * Section detection in a plain-text document.
 *
 * Without markup there is nothing to query, so a heading has to be recognised by how it
 * behaves: short, on its own line, and either set in capitals or matching one of the
 * names the convention has settled on. That convention is the reason this works at all
 * — resumes are one of the few documents where nearly everyone uses the same words.
 *
 * When the file is a .docx, real heading styles are available and are trusted first;
 * a styled `<h2>Experience</h2>` is evidence, where a text match is an inference.
 */

export interface SectionSpec {
  id: string;
  label: string;
  required: boolean;
  pattern: RegExp;
}

export const RESUME_SECTIONS: SectionSpec[] = [
  {
    id: "summary",
    label: "Summary or profile",
    required: false,
    pattern: /^(professional\s+)?(summary|profile|objective|about( me)?|personal statement)\b/i,
  },
  {
    id: "experience",
    label: "Work experience",
    required: true,
    pattern:
      /^(work|professional|relevant|employment|career)?\s*(experience|history|employment|background|placements?)\b/i,
  },
  {
    id: "education",
    label: "Education",
    required: true,
    pattern: /^(education|academic|qualifications?|training)\b/i,
  },
  {
    id: "skills",
    label: "Skills",
    required: true,
    pattern:
      /^(technical |core |key |professional |relevant )?(skills?|competenc|expertise|proficienc|tech(nical)? stack|technologies)\b/i,
  },
  {
    id: "projects",
    label: "Projects or portfolio",
    required: false,
    pattern: /^(selected\s+|key\s+|personal\s+)?(projects?|portfolio|case stud|selected work)\b/i,
  },
  {
    id: "certifications",
    label: "Certifications & licences",
    required: false,
    pattern: /^(certificat|licen[cs]e|accreditation|registration|memberships?)\b/i,
  },
  {
    id: "awards",
    label: "Awards or publications",
    required: false,
    pattern: /^(awards?|honou?rs?|publications?|patents?|talks?|press)\b/i,
  },
  {
    id: "volunteering",
    label: "Volunteering or interests",
    required: false,
    pattern: /^(volunteer|community|interests?|hobbies|extracurricular)\b/i,
  },
];

/** A line short enough, and typeset distinctly enough, to be a heading. */
export function looksLikeHeading(line: string): boolean {
  if (line.length > 60 || line.length < 3) return false;
  if (/[.!?]$/.test(line)) return false;

  const words = line.replace(/[:•\-–—]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;

  const stripped = line.replace(/[^A-Za-z]/g, "");
  if (stripped.length === 0) return false;

  const isAllCaps = stripped === stripped.toUpperCase();
  const isTitleCase = words.every((word) => /^[A-Z&]/.test(word) || word.length <= 3);
  const endsWithColon = line.endsWith(":");

  return isAllCaps || endsWithColon || isTitleCase;
}

/** Heading lines in document order, from DOCX styles where available, text shape otherwise. */
export function headingLines(document: ExtractedDocument): string[] {
  if (document.html) {
    const styled = [...document.html.matchAll(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/gis)]
      .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter((text) => text.length > 0);
    // Only trust styles if the author actually used them; plenty of .docx resumes are
    // bold paragraphs pretending to be headings.
    if (styled.length >= 2) return styled;
  }
  return document.lines.filter(looksLikeHeading);
}

/** Years mentioned in a line, used to check reverse-chronological ordering. */
function yearsIn(line: string): number[] {
  return [...line.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)].map((match) => Number(match[1]));
}

/**
 * Whether dated entries run newest-first.
 *
 * Returns null rather than false when there is not enough to judge. Two entries prove
 * nothing about ordering, and a resume with one job would otherwise be told its
 * chronology is wrong.
 */
export function isReverseChronological(lines: string[]): boolean | null {
  const anchors: number[] = [];

  for (const line of lines) {
    if (/\b(present|current|now)\b/i.test(line) && yearsIn(line).length > 0) {
      anchors.push(new Date().getFullYear());
      continue;
    }
    const years = yearsIn(line);
    // The end year of a range is what orders the entry.
    if (years.length > 0) anchors.push(Math.max(...years));
  }

  if (anchors.length < 3) return null;

  let descending = 0;
  let ascending = 0;
  for (let index = 1; index < anchors.length; index++) {
    if (anchors[index] < anchors[index - 1]) descending++;
    else if (anchors[index] > anchors[index - 1]) ascending++;
  }
  if (descending + ascending === 0) return null;
  return descending >= ascending;
}

export function analyzeResumeStructure(document: ExtractedDocument): ResumeStructureReport {
  const headings = headingLines(document);

  const sections: ResumeSection[] = RESUME_SECTIONS.map((spec) => {
    const match = headings.find((heading) => spec.pattern.test(heading));
    return {
      id: spec.id,
      label: spec.label,
      required: spec.required,
      found: Boolean(match),
      evidence: match ?? null,
    };
  });

  const required = sections.filter((section) => section.required);
  const requiredFound = required.filter((section) => section.found).length;
  const missingRequired = required.filter((section) => !section.found);
  const bonusFound = sections.filter((section) => !section.required && section.found);

  const reverseChronological = isReverseChronological(document.lines);

  const checks: Check[] = [
    {
      id: "structure-required",
      label: "Expected sections present",
      status:
        missingRequired.length === 0 ? "pass" : missingRequired.length === 1 ? "warn" : "fail",
      detail:
        missingRequired.length === 0
          ? `All of ${required.map((section) => section.label.toLowerCase()).join(", ")} are present.`
          : `Missing: ${missingRequired.map((section) => section.label).join(", ")}. Recruiters skim for these headings by name; a section that exists under a creative title often reads as absent.`,
    },
    {
      id: "structure-summary",
      label: "Opening summary",
      status: sections.find((section) => section.id === "summary")?.found ? "pass" : "warn",
      detail: sections.find((section) => section.id === "summary")?.found
        ? "Opens with a summary, which frames everything under it."
        : "No summary or profile at the top. Three lines saying what you do, your level, and what you are looking for is what stops a reviewer guessing.",
    },
    {
      id: "structure-headings",
      label: "Scannable headings",
      status: headings.length >= 4 ? "pass" : headings.length >= 2 ? "warn" : "fail",
      detail:
        headings.length >= 4
          ? `${headings.length} headings found — the document can be skimmed.`
          : `Only ${headings.length} heading${headings.length === 1 ? "" : "s"} could be identified. A resume is read in about seven seconds, and headings are what make that possible.`,
    },
    {
      id: "structure-order",
      label: "Reverse-chronological order",
      status: reverseChronological === null ? "pass" : reverseChronological ? "pass" : "warn",
      detail:
        reverseChronological === null
          ? "Not enough dated entries to judge ordering."
          : reverseChronological
            ? "Dated entries run newest first, which is the convention."
            : "Dated entries appear to run oldest first. Recruiters read top-down and stop early, so your most recent work should be first.",
    },
    {
      id: "structure-bonus",
      label: "Supporting sections",
      status: bonusFound.length >= 2 ? "pass" : bonusFound.length === 1 ? "warn" : "fail",
      detail:
        bonusFound.length > 0
          ? `Also present: ${bonusFound.map((section) => section.label.toLowerCase()).join(", ")}.`
          : "Nothing beyond the basics. Certifications, projects, publications, or volunteering are where two similar candidates separate.",
    },
  ];

  return {
    score: scoreFromChecks(checks, {
      "structure-required": 3,
      "structure-summary": 1.5,
      "structure-headings": 2,
      "structure-order": 1,
      "structure-bonus": 1,
    }),
    sections,
    requiredFound,
    requiredTotal: required.length,
    reverseChronological,
    checks,
  };
}
