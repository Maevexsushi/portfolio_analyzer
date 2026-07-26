import type { SkillCategory } from "@/lib/types";

/**
 * Discipline profiles.
 *
 * This analyzer began as a developer tool, and every judgement in it quietly assumed
 * one: a portfolio without a GitHub link lost points, "projects" meant repositories,
 * and the skills taxonomy was a list of frameworks. Applied to an illustrator or a
 * nurse, that is not a strict review — it is a wrong one, and it tells people to fix
 * things that were never broken.
 *
 * A profile is the set of expectations one field actually has: what its practitioners
 * call their work, where they publish proof of it, which skills read as credible, and
 * what a hiring reviewer in that field looks for first. Detection picks a profile from
 * the document's own vocabulary, and every check downstream asks the profile rather
 * than assuming.
 */

export type DisciplineKey =
  | "software"
  | "design"
  | "data"
  | "product"
  | "marketing"
  | "writing"
  | "media"
  | "business"
  | "education"
  | "care"
  | "trades"
  | "general";

export interface SkillDefinition {
  name: string;
  category: SkillCategory;
  /** Unambiguous forms, counted anywhere in the text. */
  patterns: string[];
  /**
   * Bare names that are also ordinary words. Counted only where the author is clearly
   * listing skills, because matching them in prose invents credentials — the failure
   * that makes a report worse than no report.
   */
  declaredOnly?: string[];
}

/** A place this field's practitioners publish work, and how much it counts for. */
export interface ProofPlatform {
  id: string;
  label: string;
  pattern: RegExp;
  /**
   * `expected` costs points when missing — a developer with no code anywhere, a
   * designer with no case studies. `bonus` only ever adds.
   */
  weight: "expected" | "bonus";
  /** Said to someone who does not have it. */
  note: string;
}

export interface DisciplineProfile {
  key: DisciplineKey;
  label: string;
  /** Plain-language description used in the report header. */
  blurb: string;
  /**
   * Terms that indicate this field. Weighted because "figma" is far stronger evidence
   * of a designer than "design", a word that appears in everyone's copy.
   */
  signals: { pattern: RegExp; weight: number }[];
  /** Vocabulary specific to this field, layered on top of the shared set. */
  skills: SkillDefinition[];
  /** Skill groups a credible practitioner in this field should cover. */
  coreCategories: SkillCategory[];
  /** Where this field's work lives. */
  platforms: ProofPlatform[];
  /** What a unit of work is called here — "project", "case study", "campaign". */
  workNoun: { singular: string; plural: string };
  /**
   * What a reviewer in this field looks for in a piece of work, in their words. Used
   * verbatim in suggestions and in the AI prompt, so it has to read as field-native.
   */
  depthExpectations: string[];
  /** Terms that signal a piece of work described its outcome rather than its features. */
  outcomeTerms: string[];
}

export interface DisciplineFinding {
  key: DisciplineKey;
  label: string;
  blurb: string;
  /** 0-100. Low means the vocabulary was thin and the profile is a guess. */
  confidence: number;
  /** The matched terms that decided it, strongest first. Shown so a user can disagree. */
  evidence: string[];
  /** Runner-up, when something else scored close. */
  alternative: { key: DisciplineKey; label: string } | null;
  /** True when the user chose the field rather than the detector. */
  chosen: boolean;
}
