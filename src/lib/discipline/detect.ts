import { DISCIPLINE_ORDER, PROFILES, profileFor } from "./profiles";
import type { DisciplineFinding, DisciplineKey } from "./types";

/**
 * Discipline detection.
 *
 * Scores each profile's signal terms against the document and takes the winner. Two
 * details matter more than the arithmetic.
 *
 * The first is that a *weak* winner is reported as weak. A one-page resume for a career
 * changer might trip three design terms and two marketing ones; declaring "Design & UX"
 * with the same confidence as a portfolio full of Figma links would make every
 * downstream check wrong in a way the reader cannot see. Confidence travels with the
 * finding, and a low one falls back to the general profile rather than guessing.
 *
 * The second is that the matched terms are kept. A detector that cannot show its
 * working is one the user has to either accept or abandon; showing the evidence lets
 * them look at "matched: figma, wireframe, usability test" and correct it in one click.
 */

/** Below this the evidence is too thin to specialise the report. */
const MIN_CONFIDENCE = 25;

/** A runner-up this close is worth offering as a one-click correction. */
const ALTERNATIVE_MARGIN = 0.7;

/** Score at which a profile is considered unambiguously identified. */
const SATURATION = 22;

interface Scored {
  key: DisciplineKey;
  score: number;
  evidence: string[];
}

function scoreProfile(key: DisciplineKey, text: string): Scored {
  const profile = PROFILES[key];
  let score = 0;
  const evidence: string[] = [];

  for (const signal of profile.signals) {
    const matches = text.match(new RegExp(signal.pattern.source, "gi"));
    if (!matches || matches.length === 0) continue;

    /*
     * Repeats count, but with sharply diminishing returns. A resume that says "nurse"
     * eleven times is not eleven times more medical than one that says it twice, and
     * without the damping a single repeated word can outweigh five distinct signals
     * from another field — which is exactly how a designer who mentions "brand" a lot
     * gets filed under marketing.
     */
    score += signal.weight * (1 + Math.log2(Math.min(matches.length, 8)));

    const sample = matches[0].trim().toLowerCase();
    if (sample && !evidence.includes(sample)) evidence.push(sample);
  }

  return { key, score, evidence };
}

export interface DetectOptions {
  /** An explicit choice from the user always wins. */
  chosen?: DisciplineKey | null;
}

export function detectDiscipline(text: string, options: DetectOptions = {}): DisciplineFinding {
  if (options.chosen) {
    const profile = profileFor(options.chosen);
    return {
      key: profile.key,
      label: profile.label,
      blurb: profile.blurb,
      confidence: 100,
      evidence: [],
      alternative: null,
      chosen: true,
    };
  }

  const haystack = text.toLowerCase();
  const scored = DISCIPLINE_ORDER.filter((key) => key !== "general")
    .map((key) => scoreProfile(key, haystack))
    .sort((a, b) => b.score - a.score);

  const [best, runnerUp] = scored;

  if (!best || best.score === 0) {
    const general = PROFILES.general;
    return {
      key: "general",
      label: general.label,
      blurb: general.blurb,
      confidence: 0,
      evidence: [],
      alternative: null,
      chosen: false,
    };
  }

  /*
   * Confidence is absolute evidence tempered by how clearly the winner beat the field.
   * A resume can match a lot of terms and still be genuinely ambiguous — a design
   * technologist trips both software and design hard — and reporting that as certain
   * would hide the one thing the reader most needs to correct.
   */
  const strength = Math.min(1, best.score / SATURATION);
  const separation = runnerUp && runnerUp.score > 0 ? 1 - Math.min(1, runnerUp.score / best.score) : 1;
  const confidence = Math.round(100 * strength * (0.55 + 0.45 * separation));

  if (confidence < MIN_CONFIDENCE) {
    const general = PROFILES.general;
    return {
      key: "general",
      label: general.label,
      blurb: general.blurb,
      confidence,
      evidence: best.evidence.slice(0, 6),
      alternative: { key: best.key, label: PROFILES[best.key].label },
      chosen: false,
    };
  }

  const profile = PROFILES[best.key];
  const alternative =
    runnerUp && runnerUp.score >= best.score * ALTERNATIVE_MARGIN
      ? { key: runnerUp.key, label: PROFILES[runnerUp.key].label }
      : null;

  return {
    key: profile.key,
    label: profile.label,
    blurb: profile.blurb,
    confidence,
    evidence: best.evidence.slice(0, 6),
    alternative,
    chosen: false,
  };
}
