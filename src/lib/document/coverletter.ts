import type { Check, CoverLetterReport } from "@/lib/types";
import { CLICHES } from "./language";
import { scoreFromChecks } from "@/lib/analyzer/check-utils";

/**
 * Cover letter review.
 *
 * The same discipline as the resume's Writing tab, plus the handful of things specific
 * to this document: is it addressed to a person, and does it actually engage with the
 * job it is meant to be for. Both of those catch the two failure modes that make a
 * reader assume a cover letter is a template that was never adjusted — a generic
 * greeting, and zero mention of the company or role it claims to be applying for.
 */

/** Openers that read as "this was never addressed to anyone in particular". */
const GENERIC_GREETING =
  /^\s*(to whom it may concern|dear (hiring manager|sir\s*\/?\s*madam|recruiter|team)|dear sir or madam)\b/i;

/** A greeting naming an actual person: "Dear Jane", "Dear Ms. Okafor". */
const NAMED_GREETING = /^\s*dear\s+([A-Z][a-z]+\.?\s*)?[A-Z][a-z]+/i;

/** Sign-offs that at least gesture at a next step, rather than trailing off. */
const CLOSING_CTA =
  /(look forward to|would welcome the (opportunity|chance)|happy to discuss|available (for|to) (an? )?(interview|call|conversation)|thank you for (your consideration|considering))/i;

const IDEAL_WORDS = { min: 200, max: 450 };

function firstMeaningfulLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

export interface CoverLetterAnalysisInput {
  text: string;
  /** From the pasted job posting, if one was given — used for the company/role checks. */
  jobTitle: string | null;
  companyName: string | null;
}

/**
 * A company name is never handed to us directly — nothing upstream extracts one from a
 * job posting, because postings name the company in wildly inconsistent places (a
 * header, a footer, an "About us" paragraph, sometimes not at all). Rather than guess
 * confidently and be wrong, this only ever checks a name the caller explicitly supplies.
 */
export function analyzeCoverLetter(input: CoverLetterAnalysisInput): CoverLetterReport {
  const { text } = input;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const opening = firstMeaningfulLine(text);

  const clicheHits: string[] = [];
  for (const pattern of CLICHES) {
    const match = new RegExp(pattern, "i").exec(text);
    if (match) clicheHits.push(match[0].toLowerCase());
  }

  const hasPersonalGreeting = NAMED_GREETING.test(opening) && !GENERIC_GREETING.test(opening);
  const hasClosingCTA = CLOSING_CTA.test(text);

  const mentionsRole = input.jobTitle
    ? text.toLowerCase().includes(input.jobTitle.toLowerCase())
    : null;
  const mentionsCompany = input.companyName
    ? text.toLowerCase().includes(input.companyName.toLowerCase())
    : null;

  const checks: Check[] = [
    {
      id: "coverletter-length",
      label: "Length",
      status:
        wordCount >= IDEAL_WORDS.min && wordCount <= IDEAL_WORDS.max
          ? "pass"
          : wordCount === 0
            ? "fail"
            : "warn",
      detail:
        wordCount === 0
          ? "No text to review."
          : wordCount < IDEAL_WORDS.min
            ? `${wordCount} words — thin enough that it reads as an afterthought. Aim for ${IDEAL_WORDS.min}-${IDEAL_WORDS.max}.`
            : wordCount > IDEAL_WORDS.max
              ? `${wordCount} words — long enough that a reviewer skimming it will stop partway through. Aim for ${IDEAL_WORDS.min}-${IDEAL_WORDS.max}.`
              : `${wordCount} words, in the range a reviewer will actually read in full.`,
    },
    {
      id: "coverletter-greeting",
      label: "Addressed to a person",
      status: hasPersonalGreeting ? "pass" : "warn",
      detail: hasPersonalGreeting
        ? `Opens with a named greeting: "${opening}".`
        : GENERIC_GREETING.test(opening)
          ? `Opens with "${opening}" — a generic greeting is the clearest tell that a letter was never adjusted for this application. LinkedIn or the posting itself often names the hiring manager.`
          : "No greeting naming a person was found at the top.",
    },
    {
      id: "coverletter-cliches",
      label: "Free of filler phrases",
      status: clicheHits.length === 0 ? "pass" : clicheHits.length <= 2 ? "warn" : "fail",
      detail:
        clicheHits.length === 0
          ? "No stock phrases found."
          : `Found ${clicheHits.length}: ${clicheHits.slice(0, 4).map((hit) => `"${hit}"`).join(", ")}. These describe every applicant equally.`,
    },
    {
      id: "coverletter-closing",
      label: "Closes with a next step",
      status: hasClosingCTA ? "pass" : "warn",
      detail: hasClosingCTA
        ? "Ends by inviting a next step."
        : "No closing line inviting an interview or a call. A letter that just stops reads as unfinished.",
    },
  ];

  if (mentionsRole !== null) {
    checks.push({
      id: "coverletter-role",
      label: "Names the role",
      status: mentionsRole ? "pass" : "warn",
      detail: mentionsRole
        ? "The role title from the posting appears in the letter."
        : `The posting's title ("${input.jobTitle}") does not appear anywhere in the letter — worth checking this was written for this application specifically.`,
    });
  }

  if (mentionsCompany !== null) {
    checks.push({
      id: "coverletter-company",
      label: "Names the company",
      status: mentionsCompany ? "pass" : "fail",
      detail: mentionsCompany
        ? "The company name appears in the letter."
        : `The company name was not found anywhere in the letter — the single most common sign of a template that never got the placeholder filled in.`,
    });
  }

  return {
    score: scoreFromChecks(checks, {
      "coverletter-length": 1.5,
      "coverletter-greeting": 1.5,
      "coverletter-cliches": 2,
      "coverletter-closing": 1,
      "coverletter-role": 1,
      "coverletter-company": 2.5,
    }),
    wordCount,
    clicheHits,
    hasPersonalGreeting,
    mentionsCompany,
    mentionsRole,
    hasClosingCTA,
    checks,
  };
}
