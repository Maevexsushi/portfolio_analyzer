import type { Check, JobMatchReport, JobMatchSkillEvidence, SkillFinding } from "@/lib/types";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { composeVocabulary, matchSkills } from "@/lib/discipline/skills";

/**
 * Job description matching.
 *
 * The question this answers is narrow and deliberately so: which of the named skills
 * and tools this posting asks for does the resume actually evidence? It is a keyword
 * match, the same thing every "ATS keyword checker" on the market actually does under
 * the hood — the difference here is that it says so, rather than presenting a keyword
 * match as if it had run the resume through a real hiring pipeline.
 *
 * What this does NOT attempt: years-of-experience requirements, degree requirements,
 * soft-skill prose ("excellent communicator"), or anything not expressible as a named
 * skill in the shared vocabulary. Those are real parts of a posting and this says
 * nothing about them — the score is a floor on fit, not a verdict on it.
 *
 * No AI is involved in the core match. It is pure text comparison against the same
 * vocabulary the resume was already scored with, which is what keeps it deterministic,
 * testable without a network call, and free to run on every analysis.
 */

/** Marks the start of the posting's non-negotiable requirements. */
const REQUIRED_HEADING =
  /^(required|requirements?|must[- ]?have|minimum qualifications?|basic qualifications?|what you.ll need|what we.re looking for|qualifications?)\s*:?\s*$/i;

/** Marks the start of requirements the posting itself calls optional. */
const PREFERRED_HEADING =
  /^(preferred|nice[- ]to[- ]have|bonus( points)?|desired|pluses?|preferred qualifications?)\s*:?\s*$/i;

/** Any other section heading a job posting commonly carries, used to close a zone. */
const OTHER_HEADING =
  /^(about( us| the (role|team|company))?|responsibilities|what you.ll do|benefits|perks|compensation|how to apply|equal opportunity|company overview)\s*:?\s*$/i;

type Zone = "required" | "preferred" | "other";

/**
 * Splits a pasted job posting into required / preferred / other text zones by heading.
 *
 * Postings that never use these headings at all are common — a short posting is often
 * just one undifferentiated paragraph. In that case everything falls into `required`,
 * because treating an unlabelled ask as optional would understate what the posting
 * wants; a poster who cared enough to separate "nice to have" would have said so.
 */
export function splitJobDescriptionZones(text: string): Record<Zone, string> {
  const lines = text.split(/\r?\n/);
  const zones: Record<Zone, string[]> = { required: [], preferred: [], other: [] };
  let zone: Zone = "required";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (REQUIRED_HEADING.test(line)) {
      zone = "required";
      continue;
    }
    if (PREFERRED_HEADING.test(line)) {
      zone = "preferred";
      continue;
    }
    if (OTHER_HEADING.test(line)) {
      zone = "other";
      continue;
    }
    zones[zone].push(line);
  }

  return {
    required: zones.required.join("\n"),
    preferred: zones.preferred.join("\n"),
    other: zones.other.join("\n"),
  };
}

/** First short, title-ish line — shown back to the reader so they can confirm what was read. */
export function guessJobTitle(text: string): string | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length >= 3 && line.length <= 80) return line;
    if (line.length > 80) return null; // A long first line is prose, not a title.
  }
  return null;
}

/**
 * A company name, only when the text itself names it with enough grammatical certainty
 * to trust — "at Acme Corp", "Acme Corp is hiring". Job postings put the company name
 * in wildly inconsistent places (a header the paste often drops, a separate "Company"
 * field on the job board, an About-us paragraph three screens down), so most pastes
 * will not match any of these and this returns null rather than guess from weaker
 * signals like "any capitalised word." A wrong company name would fail the cover-letter
 * company check for a letter that is actually fine, which is worse than staying silent.
 */
const COMPANY_PATTERNS = [
  /\bat\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\s*(?:[,.!]|\s+is\b|\s+is\s+looking|\s+we\b|$)/,
  /^\s*([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\s+is\s+(?:hiring|looking for|seeking)/im,
  /\bjoin\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\b/,
];

const NOT_A_COMPANY = /^(we|our|the|this|you|your|i|is|us)$/i;

export function guessCompanyName(text: string): string | null {
  for (const pattern of COMPANY_PATTERNS) {
    const match = pattern.exec(text);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length <= 60 && !NOT_A_COMPANY.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function skillNames(findings: SkillFinding[]): Set<string> {
  return new Set(findings.map((finding) => finding.name));
}

/** Looks up the resume's own finding for a matched skill, so the match carries evidence. */
function evidenceFor(
  matched: SkillFinding[],
  resumeByName: Map<string, SkillFinding>,
): JobMatchSkillEvidence[] {
  return matched.map((skill) => {
    const found = resumeByName.get(skill.name);
    return { name: skill.name, mentions: found?.mentions ?? 0, declared: found?.declared ?? false };
  });
}

export interface JobMatchInput {
  jobDescriptionText: string;
  /** The resume's own detected field — reused so both sides are read with one vocabulary. */
  profile: DisciplineProfile;
  /** The resume's already-computed skill findings — matched anywhere in its text. */
  resumeSkills: SkillFinding[];
}

export function analyzeJobMatch(input: JobMatchInput): JobMatchReport {
  const { jobDescriptionText, profile, resumeSkills } = input;
  const vocabulary = composeVocabulary(profile);
  const resumeNames = skillNames(resumeSkills);
  const resumeByName = new Map(resumeSkills.map((finding) => [finding.name, finding]));

  const zones = splitJobDescriptionZones(jobDescriptionText);
  const lower = jobDescriptionText.toLowerCase();

  /*
   * The whole posting text is passed as both `haystack` and `declaredText`: a job
   * posting is a curated, formal document, not casual prose, so the false-positive risk
   * that makes ambiguous bare names ("Go", "Express") unsafe in a resume's body copy is
   * much lower here — a posting that says "Express" almost always means the framework.
   */
  const requiredSkills = matchSkills(zones.required.toLowerCase(), zones.required.toLowerCase(), vocabulary);
  const preferredSkillsRaw = matchSkills(
    zones.preferred.toLowerCase(),
    zones.preferred.toLowerCase(),
    vocabulary,
  );

  const requiredNames = skillNames(requiredSkills);
  // A skill named in both zones counts once, as required — the stronger ask wins.
  const preferredSkills = preferredSkillsRaw.filter((skill) => !requiredNames.has(skill.name));

  const matchedRequiredSkills = requiredSkills.filter((skill) => resumeNames.has(skill.name));
  const missingRequired = requiredSkills
    .filter((skill) => !resumeNames.has(skill.name))
    .map((s) => s.name);
  const matchedPreferredSkills = preferredSkills.filter((skill) => resumeNames.has(skill.name));
  const missingPreferred = preferredSkills
    .filter((skill) => !resumeNames.has(skill.name))
    .map((s) => s.name);

  const matchedRequired = evidenceFor(matchedRequiredSkills, resumeByName);
  const matchedPreferred = evidenceFor(matchedPreferredSkills, resumeByName);

  const totalDetected = requiredSkills.length + preferredSkills.length;
  // Required carries most of the weight; a posting with no preferred section at all
  // still scores purely on required coverage rather than being capped below 100.
  const requiredWeight = requiredSkills.length > 0 ? 0.82 : 0.6;
  const preferredWeight = requiredSkills.length > 0 ? 0.18 : 0.4;

  const checks: Check[] = [];

  if (totalDetected === 0) {
    checks.push({
      id: "jobmatch-empty",
      label: "Job description readable",
      status: "fail",
      detail:
        "Nothing recognisable — no named skill, tool, or technology — could be pulled from the pasted text. Check that the full posting was pasted in, not a truncated snippet or a page's navigation chrome.",
    });
    return {
      score: null,
      jobTitle: guessJobTitle(jobDescriptionText),
      requiredWeight,
      preferredWeight,
      matchedRequired: [],
      missingRequired: [],
      matchedPreferred: [],
      missingPreferred: [],
      checks,
    };
  }

  const requiredCoverage =
    requiredSkills.length > 0 ? matchedRequired.length / requiredSkills.length : 1;
  const preferredCoverage =
    preferredSkills.length > 0 ? matchedPreferred.length / preferredSkills.length : 1;
  const score = Math.round(100 * requiredWeight * requiredCoverage + 100 * preferredWeight * preferredCoverage);

  checks.push({
    id: "jobmatch-required",
    label: "Required skills covered",
    status: missingRequired.length === 0 ? "pass" : missingRequired.length <= 2 ? "warn" : "fail",
    detail:
      requiredSkills.length === 0
        ? "No section of the posting reads as a required-skills list — only preferred/bonus terms were found."
        : missingRequired.length === 0
          ? `All ${requiredSkills.length} required skill${requiredSkills.length === 1 ? "" : "s"} this posting names are evidenced in your resume: ${matchedRequired.map((s) => s.name).join(", ")}.`
          : `Missing ${missingRequired.length} of ${requiredSkills.length} required skills: ${missingRequired.join(", ")}. Only add ones you genuinely have — this checks whether they are on the page, not whether you should invent them.`,
  });

  if (preferredSkills.length > 0) {
    checks.push({
      id: "jobmatch-preferred",
      label: "Preferred skills covered",
      status: missingPreferred.length === 0 ? "pass" : "warn",
      detail:
        missingPreferred.length === 0
          ? `All ${preferredSkills.length} preferred skill${preferredSkills.length === 1 ? "" : "s"} are covered too: ${matchedPreferred.map((s) => s.name).join(", ")}.`
          : `${missingPreferred.length} of ${preferredSkills.length} preferred (not required) skills are not evidenced: ${missingPreferred.join(", ")}.`,
    });
  }

  return {
    score,
    jobTitle: guessJobTitle(jobDescriptionText),
    requiredWeight,
    preferredWeight,
    matchedRequired,
    missingRequired,
    matchedPreferred,
    missingPreferred,
    checks,
  };
}
