import type { Check, ExperienceEntry, ExperienceReport } from "@/lib/types";
import type { ExtractedDocument } from "@/lib/intake";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { scoreFromChecks } from "@/lib/analyzer/check-utils";
import { looksLikeHeading } from "./sections";

/**
 * Experience analysis — the part of a resume that decides interviews.
 *
 * Almost every weak resume fails in the same two ways, and both are measurable. Bullets
 * describe duties instead of actions ("Responsible for managing the social calendar"),
 * and nothing carries a number, so a reader has no way to tell a small job from a large
 * one. Quantification rate in particular tracks seniority better than any other signal
 * available from text alone.
 *
 * What this cannot do is judge whether the numbers are impressive, or true. It reports
 * the shape of the writing and leaves the substance to the editorial read.
 */

/** Verbs that open a bullet describing something the writer actually did. */
const ACTION_VERBS = [
  "achieved", "accelerated", "added", "administered", "advised", "analysed", "analyzed",
  "architected", "audited", "authored", "automated", "built", "championed", "coached",
  "collaborated", "conducted", "consolidated", "converted", "coordinated", "created",
  "cut", "decreased", "defined", "delivered", "designed", "developed", "diagnosed",
  "directed", "doubled", "drove", "edited", "eliminated", "engineered", "established",
  "exceeded", "executed", "expanded", "facilitated", "founded", "generated", "grew",
  "halved", "implemented", "improved", "increased", "influenced", "initiated",
  "instituted", "integrated", "introduced", "investigated", "launched", "led", "managed",
  "mentored", "migrated", "modernised", "modernized", "negotiated", "optimised",
  "optimized", "orchestrated", "organised", "organized", "overhauled", "performed",
  "pioneered", "planned", "presented", "prioritised", "prioritized", "produced",
  "published", "raised", "rebuilt", "recovered", "recruited", "redesigned", "reduced",
  "refactored", "resolved", "restructured", "revamped", "saved", "scaled", "secured",
  "shipped", "simplified", "solved", "spearheaded", "standardised", "standardized",
  "streamlined", "supervised", "supported", "surpassed", "taught", "tested", "trained",
  "transformed", "translated", "treated", "tripled", "unified", "upgraded", "won", "wrote",
];

const ACTION_VERB_PATTERN = new RegExp(`^(${ACTION_VERBS.join("|")})\\b`, "i");

/** Openings that describe a job description rather than a contribution. */
const WEAK_OPENINGS =
  /^(responsible for|duties (included|were)|tasked with|helped (to |with )?|assisted (with|in)|worked (on|with|as)|involved in|participated in|in charge of|handled|dealt with)\b/i;

/**
 * Whether a bullet says how much.
 *
 * An earlier version listed the nouns a number could attach to — "12 people", "40
 * users" — and missed most real achievements as a result. "Led a team of 4 engineers"
 * and "reduced on-call pages from 30 to 4" are precisely the bullets this check exists
 * to reward, and no noun list will ever cover the vocabulary of every field.
 *
 * So the rule is inverted: any digit counts, once the digits that are *not* measurements
 * have been removed. In practice that means dates — the one kind of number every resume
 * is full of and which says nothing about scale.
 */
const DATE_NOISE =
  /\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,4}\b|\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/gi;

export function isQuantified(bullet: string): boolean {
  const withoutDates = bullet.replace(DATE_NOISE, " ");
  // A percentage or currency amount survives on its own even if it looked date-like.
  if (/\d\s*%|[$£€¥]\s?\d/.test(bullet)) return true;
  return /\d/.test(withoutDates);
}

/** Bullet glyphs, plus the hyphen most plain-text exports fall back to. */
const BULLET_MARK = /^[•·▪◦‣⁃*\-–—]\s+/;

/** A line that names a role and its dates — the anchor a group of bullets hangs from. */
const ROLE_LINE =
  /((19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current|now)|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(19|20)?\d{2}\b)/i;

const DATE_RANGE_CAPTURE =
  /((?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current|now)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:19|20)?\d{2}\s*[-–—]\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:19|20)?\d{2}|present|current|now))/i;

const EXPERIENCE_HEADING =
  /^(work|professional|relevant|employment|career)?\s*(experience|history|employment|placements?)\b/i;

const OTHER_HEADING =
  /^(education|skills?|certificat|awards?|publications?|volunteer|interests?|references|projects?|summary|profile|languages?)\b/i;

function isBullet(line: string): boolean {
  return BULLET_MARK.test(line);
}

function bulletBody(line: string): string {
  return line.replace(BULLET_MARK, "").trim();
}

/**
 * Slice the document into role entries.
 *
 * Falls back to treating the whole experience section as one entry when no role lines
 * can be found — that is common in heavily designed resumes where dates sit in a side
 * column and come out of the text layer detached from their job. Reporting "0 roles"
 * there would be an artefact of extraction, not a fact about the resume.
 */
export function splitEntries(lines: string[]): { title: string; lines: string[] }[] {
  const start = lines.findIndex((line) => EXPERIENCE_HEADING.test(line));
  if (start === -1) return [];

  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (looksLikeHeading(line) && OTHER_HEADING.test(line)) break;
    body.push(line);
  }

  const entries: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of body) {
    if (!isBullet(line) && ROLE_LINE.test(line)) {
      current = { title: line, lines: [] };
      entries.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }

  if (entries.length === 0 && body.length > 0) {
    return [{ title: "Experience", lines: body }];
  }
  return entries;
}

/**
 * Bullets in an entry.
 *
 * Not every resume uses bullet glyphs — plenty write short paragraphs, and a PDF text
 * layer sometimes drops the glyph entirely. So an unmarked line of a plausible length
 * counts too, otherwise those resumes score zero on everything below.
 */
function bulletsOf(entryLines: string[]): string[] {
  const marked = entryLines.filter(isBullet).map(bulletBody);
  if (marked.length > 0) return marked;

  return entryLines
    .map((line) => line.trim())
    .filter((line) => line.length >= 25 && !looksLikeHeading(line));
}

export function analyzeExperience(
  document: ExtractedDocument,
  profile: DisciplineProfile,
): ExperienceReport {
  const raw = splitEntries(document.lines);

  const entries: ExperienceEntry[] = raw.map((entry) => {
    const bullets = bulletsOf(entry.lines);
    const weak = bullets.filter((bullet) => WEAK_OPENINGS.test(bullet));

    return {
      title: entry.title.slice(0, 140),
      dateRange: DATE_RANGE_CAPTURE.exec(entry.title)?.[0] ?? null,
      bulletCount: bullets.length,
      actionVerbBullets: bullets.filter((bullet) => ACTION_VERB_PATTERN.test(bullet)).length,
      quantifiedBullets: bullets.filter(isQuantified).length,
      weakBullets: weak.slice(0, 3).map((bullet) => bullet.slice(0, 160)),
    };
  });

  const totalBullets = entries.reduce((sum, entry) => sum + entry.bulletCount, 0);
  const quantifiedBullets = entries.reduce((sum, entry) => sum + entry.quantifiedBullets, 0);
  const actionVerbBullets = entries.reduce((sum, entry) => sum + entry.actionVerbBullets, 0);
  const weakTotal = entries.reduce((sum, entry) => sum + entry.weakBullets.length, 0);
  const quantificationRate = totalBullets > 0 ? quantifiedBullets / totalBullets : 0;
  const actionRate = totalBullets > 0 ? actionVerbBullets / totalBullets : 0;

  // Outcome vocabulary from the profile — "conversion" for a marketer, "uptime" for an
  // SRE. A field-neutral list would credit the wrong words in half the disciplines.
  const outcomeHits = profile.outcomeTerms.filter((term) =>
    new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(document.lowerText),
  );

  const checks: Check[] = [
    {
      id: "experience-entries",
      label: "Roles listed",
      status: entries.length >= 2 ? "pass" : entries.length === 1 ? "warn" : "fail",
      detail:
        entries.length === 0
          ? "No work entries could be identified. Either there is no experience section, or its dates and job titles are laid out in a way the text layer scrambles — which is also how an applicant tracking system will see it."
          : `${entries.length} role${entries.length === 1 ? "" : "s"} found${
              entries.length === 1 ? ". One role is normal early on; make sure it is described in depth." : "."
            }`,
    },
    {
      id: "experience-bullets",
      label: "Bullet points",
      status: totalBullets >= 6 ? "pass" : totalBullets >= 3 ? "warn" : "fail",
      detail:
        totalBullets === 0
          ? "No bullet points found. Solid paragraphs of duties do not get read; three to five bullets per role do."
          : `${totalBullets} bullet${totalBullets === 1 ? "" : "s"} across all roles. Three to five per recent role is the target.`,
    },
    {
      id: "experience-quantified",
      label: "Achievements carry numbers",
      status: quantificationRate >= 0.4 ? "pass" : quantificationRate >= 0.15 ? "warn" : "fail",
      detail:
        totalBullets === 0
          ? "No bullets to measure."
          : `${quantifiedBullets} of ${totalBullets} bullets (${Math.round(quantificationRate * 100)}%) contain a number, percentage, or amount. This is the single biggest difference between a resume that reads as junior and one that reads as senior — "improved onboarding" and "cut onboarding from 6 days to 2" describe the same work.`,
    },
    {
      id: "experience-verbs",
      label: "Bullets open with an action",
      status: actionRate >= 0.6 ? "pass" : actionRate >= 0.3 ? "warn" : "fail",
      detail:
        totalBullets === 0
          ? "No bullets to measure."
          : `${actionVerbBullets} of ${totalBullets} bullets start with a strong verb.${
              weakTotal > 0
                ? ` ${weakTotal} start with a duty phrase instead — e.g. "${entries.flatMap((entry) => entry.weakBullets)[0]}".`
                : ""
            }`,
    },
    {
      id: "experience-outcomes",
      label: `Outcome language for ${profile.label.toLowerCase()}`,
      status: outcomeHits.length >= 3 ? "pass" : outcomeHits.length >= 1 ? "warn" : "fail",
      detail:
        outcomeHits.length > 0
          ? `Uses outcome words this field cares about: ${outcomeHits.slice(0, 6).join(", ")}.`
          : `Nothing in the text describes an outcome in the terms this field uses (${profile.outcomeTerms.slice(0, 5).join(", ")}). Say what changed because you were there.`,
    },
  ];

  return {
    score: scoreFromChecks(checks, {
      "experience-entries": 2,
      "experience-bullets": 1.5,
      "experience-quantified": 3,
      "experience-verbs": 2,
      "experience-outcomes": 1.5,
    }),
    entries,
    totalBullets,
    quantifiedBullets,
    actionVerbBullets,
    quantificationRate: Math.round(quantificationRate * 100) / 100,
    checks,
  };
}
