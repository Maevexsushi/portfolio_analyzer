import type { JobMatchReport, SkillFinding } from "@/lib/types";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { analyzeJobMatch, guessJobTitle } from "./index";

/**
 * Reverse job matching: one resume against several postings, ranked.
 *
 * The forward direction (one posting, does this resume fit) already exists on the Job
 * Match page. This answers the question that comes right after someone has three tabs
 * open with job postings in them: which one is actually worth applying to first. It is
 * the same deterministic `analyzeJobMatch` run once per posting against one resume's
 * skill set, extracted once — no new matching logic, just the fan-out and the sort.
 */

/** A line of three or more dashes on its own, the same convention Markdown uses for `<hr>`. */
const POSTING_DELIMITER = /^[ \t]*-{3,}[ \t]*$/m;

const MAX_POSTINGS = 10;

export interface SplitPostingsResult {
  postings: string[];
  /** How many were dropped for exceeding MAX_POSTINGS, so the caller can say so. */
  droppedCount: number;
}

/** Splits pasted text into individual postings on a `---` line, dropping blank chunks. */
export function splitPostings(text: string): SplitPostingsResult {
  const all = text
    .split(POSTING_DELIMITER)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  return {
    postings: all.slice(0, MAX_POSTINGS),
    droppedCount: Math.max(0, all.length - MAX_POSTINGS),
  };
}

export interface RankedPosting {
  /** Position in the pasted text, for a stable label when no title could be read. */
  index: number;
  jobTitle: string | null;
  jobMatch: JobMatchReport;
}

/**
 * Runs the same job-match check once per posting against one resume's skill set, and
 * orders the results best fit first. A posting with no recognisable skills at all
 * (`score: null`) sorts last rather than being scored 0 — it was not evaluated, not
 * evaluated-and-failed, and those are different things worth keeping visually apart.
 */
export function rankPostings(
  postings: string[],
  profile: DisciplineProfile,
  resumeSkills: SkillFinding[],
): RankedPosting[] {
  const ranked = postings.map((jobDescriptionText, index) => ({
    index,
    jobTitle: guessJobTitle(jobDescriptionText),
    jobMatch: analyzeJobMatch({ jobDescriptionText, profile, resumeSkills }),
  }));

  return ranked.sort((a, b) => {
    if (a.jobMatch.score === null && b.jobMatch.score === null) return 0;
    if (a.jobMatch.score === null) return 1;
    if (b.jobMatch.score === null) return -1;
    return b.jobMatch.score - a.jobMatch.score;
  });
}
