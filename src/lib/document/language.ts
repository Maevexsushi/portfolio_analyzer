import type { Check, LanguageReport } from "@/lib/types";
import type { ExtractedDocument } from "@/lib/intake";
import { scoreFromChecks } from "@/lib/analyzer/check-utils";

/**
 * Writing quality, limited to what can be counted honestly.
 *
 * There is no attempt here to judge prose. What it counts are three specific habits
 * that cost people interviews and that they cannot see in their own writing: sentences
 * too long to survive a skim, filler phrases that every reviewer has read ten thousand
 * times, and passive constructions that hide who did the work.
 *
 * Each finding quotes the phrase it found. A count on its own ("4 clichés") is an
 * accusation; the quote lets the writer look at it and decide.
 */

/** Phrases so common in applications that they carry no information at all. */
export const CLICHES = [
  "hard.?working",
  "team player",
  "self.?starter",
  "go.?getter",
  "think outside the box",
  "detail.?oriented",
  "results.?driven",
  "passionate about",
  "dynamic professional",
  "proven track record",
  "synerg",
  "wear many hats",
  "hit the ground running",
  "value add",
  "best.of.breed",
  "excellent communication skills",
  "works? well (both )?(independently and )?in a team",
  "fast.?paced environment",
  "references available on request",
  "responsible for various",
];

/** Passive voice: a form of "to be" followed by a past participle. */
const PASSIVE =
  /\b(was|were|is|are|been|being|be)\s+(\w+(?:ed|en))\b(?!\s+(by\s+)?(me|myself))/gi;

/** Participles that are ordinary adjectives, not passive constructions. */
const NOT_PASSIVE = /\b(was|were|is|are|been|being|be)\s+(interested|excited|based|involved|committed|dedicated|located|experienced|skilled|qualified|advanced|limited|detailed|related|used)\b/i;

const FIRST_PERSON = /\b(I|me|my|mine|myself)\b/g;

/** Beyond this a bullet stops being skimmed and starts being skipped. */
const LONG_SENTENCE_WORDS = 32;

export interface LanguageOptions {
  /**
   * Resumes are conventionally written without "I"; a portfolio's about page is not,
   * and flagging first person there would be advice against the form.
   */
  penaliseFirstPerson: boolean;
}

export function analyzeLanguage(
  document: ExtractedDocument,
  options: LanguageOptions,
): LanguageReport {
  const text = document.text;

  const sentences = text
    .split(/(?<=[.!?])\s+|\n/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  const longSentences = sentences.filter(
    (sentence) => sentence.split(/\s+/).length > LONG_SENTENCE_WORDS,
  );

  const clicheHits: string[] = [];
  for (const pattern of CLICHES) {
    const match = new RegExp(pattern, "i").exec(text);
    if (match) clicheHits.push(match[0].toLowerCase());
  }

  const passiveHits: string[] = [];
  for (const match of text.matchAll(PASSIVE)) {
    if (NOT_PASSIVE.test(match[0])) continue;
    const phrase = match[0].toLowerCase();
    if (!passiveHits.includes(phrase)) passiveHits.push(phrase);
    if (passiveHits.length >= 8) break;
  }

  const firstPersonHits = (text.match(FIRST_PERSON) ?? []).length;
  const wordCount = document.wordCount;
  const longRate = sentences.length > 0 ? longSentences.length / sentences.length : 0;

  const checks: Check[] = [
    {
      id: "language-cliches",
      label: "Free of filler phrases",
      status: clicheHits.length === 0 ? "pass" : clicheHits.length <= 2 ? "warn" : "fail",
      detail:
        clicheHits.length === 0
          ? "No stock phrases found."
          : `Found ${clicheHits.length}: ${clicheHits.slice(0, 4).map((hit) => `"${hit}"`).join(", ")}. These describe every applicant equally, so they distinguish you from none of them. Replace each with the specific thing that made you think it.`,
    },
    {
      id: "language-length",
      label: "Sentences are skimmable",
      status: longRate <= 0.1 ? "pass" : longRate <= 0.25 ? "warn" : "fail",
      detail:
        longSentences.length === 0
          ? "No overlong sentences."
          : `${longSentences.length} sentence${longSentences.length === 1 ? "" : "s"} run past ${LONG_SENTENCE_WORDS} words. A reviewer spends seconds per entry; a long sentence gets skipped whole. Longest: "${longSentences[0].slice(0, 120)}…"`,
    },
    {
      id: "language-passive",
      label: "Active voice",
      status: passiveHits.length <= 2 ? "pass" : passiveHits.length <= 5 ? "warn" : "fail",
      detail:
        passiveHits.length === 0
          ? "Reads in the active voice."
          : `${passiveHits.length} passive construction${passiveHits.length === 1 ? "" : "s"}: ${passiveHits.slice(0, 3).map((hit) => `"${hit}"`).join(", ")}. Passive voice hides who did the thing — which, on your own resume, is you.`,
    },
  ];

  if (options.penaliseFirstPerson) {
    // Per 200 words, so a two-page resume is not penalised for being longer.
    const density = wordCount > 0 ? (firstPersonHits / wordCount) * 200 : 0;
    checks.push({
      id: "language-firstperson",
      label: "Consistent voice",
      status: density <= 0.5 ? "pass" : density <= 2 ? "warn" : "fail",
      detail:
        firstPersonHits === 0
          ? "Written without first-person pronouns, which is the resume convention."
          : `${firstPersonHits} first-person pronoun${firstPersonHits === 1 ? "" : "s"}. Resumes conventionally drop them — "Led the migration" rather than "I led the migration" — and the space goes to the work. Mixing the two is the part that reads as unfinished.`,
    });
  }

  return {
    score: scoreFromChecks(checks, {
      "language-cliches": 2,
      "language-length": 1.5,
      "language-passive": 1.5,
      "language-firstperson": 1,
    }),
    wordCount,
    longSentences: longSentences.length,
    passiveHits,
    clicheHits,
    firstPersonHits,
    checks,
  };
}
