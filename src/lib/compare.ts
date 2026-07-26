import type { CategoryKey, ResumeResult, Severity, SkillCategory } from "./types";

/**
 * Resume variant comparison.
 *
 * Deliberately ad hoc: the user picks any set of stored resume reports from history and
 * compares them side by side, rather than the app maintaining a persistent notion of
 * "variants of the same resume." Two reports of files named differently, from different
 * uploads, weeks apart, are just as comparable as two re-runs of the same file — the
 * comparison is a lens over history, not a data model of its own.
 *
 * The point of a diff is what changed, so the sections below are built around
 * disagreement: a category where the scores differ, a skill only some variants
 * evidence, a suggestion that is open in some variants and fixed in others. Anything
 * identical across every variant compared is signal-free and left out.
 */

export interface CompareSubject {
  id: string;
  fileName: string;
  analyzedAt: string;
  overallScore: number;
  grade: string;
}

export interface CategoryComparisonRow {
  key: CategoryKey;
  label: string;
  /** One score per subject, in the same order as `subjects`. Null if that report has no such category. */
  scores: (number | null)[];
  /** Index into `subjects` of the highest score, or null when there is no single winner. */
  bestIndex: number | null;
}

export interface SkillComparisonRow {
  name: string;
  category: SkillCategory;
  /** Whether each subject's resume evidences this skill, same order as `subjects`. */
  present: boolean[];
}

export interface SuggestionComparisonRow {
  id: string;
  category: CategoryKey | "general";
  severity: Severity;
  title: string;
  /** Whether each subject still has this open, same order as `subjects`. */
  open: boolean[];
}

export interface ResumeComparison {
  subjects: CompareSubject[];
  /** Only categories where at least two subjects' scores differ. */
  categories: CategoryComparisonRow[];
  /** Only skills at least one subject has and at least one lacks. */
  differingSkills: SkillComparisonRow[];
  /** Only suggestions that are not either open-everywhere or fixed-everywhere. */
  differingSuggestions: SuggestionComparisonRow[];
}

export function bestIndexOf(scores: (number | null)[]): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  let tied = false;

  scores.forEach((score, index) => {
    if (score === null) return;
    if (score > bestScore) {
      best = index;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  });

  return tied ? null : best;
}

/** Oldest first, so a comparison reads left-to-right as a progression. */
function chronological(results: ResumeResult[]): ResumeResult[] {
  return [...results].sort(
    (a, b) => new Date(a.analyzedAt).getTime() - new Date(b.analyzedAt).getTime(),
  );
}

export function compareResumes(results: ResumeResult[]): ResumeComparison {
  const ordered = chronological(results);

  const subjects: CompareSubject[] = ordered.map((result) => ({
    id: result.id,
    fileName: result.upload.fileName,
    analyzedAt: result.analyzedAt,
    overallScore: result.overallScore,
    grade: result.grade,
  }));

  const categoryOrder: CategoryKey[] = [];
  const categoryLabels = new Map<CategoryKey, string>();
  for (const result of ordered) {
    for (const entry of result.breakdown) {
      if (!categoryLabels.has(entry.key)) {
        categoryOrder.push(entry.key);
        categoryLabels.set(entry.key, entry.label);
      }
    }
  }
  const categories: CategoryComparisonRow[] = categoryOrder
    .map((key) => {
      const scores = ordered.map(
        (result) => result.breakdown.find((entry) => entry.key === key)?.score ?? null,
      );
      return { key, label: categoryLabels.get(key) ?? key, scores, bestIndex: bestIndexOf(scores) };
    })
    .filter((row) => new Set(row.scores.filter((score) => score !== null)).size > 1);

  const skillNames = new Map<string, SkillCategory>();
  for (const result of ordered) {
    for (const skill of result.skills.skills) {
      if (!skillNames.has(skill.name)) skillNames.set(skill.name, skill.category);
    }
  }
  const differingSkills: SkillComparisonRow[] = [...skillNames.entries()]
    .map(([name, category]) => ({
      name,
      category,
      present: ordered.map((result) => result.skills.skills.some((skill) => skill.name === name)),
    }))
    .filter((row) => row.present.some(Boolean) && !row.present.every(Boolean));

  const suggestionMeta = new Map<
    string,
    { category: CategoryKey | "general"; severity: Severity; title: string }
  >();
  for (const result of ordered) {
    for (const suggestion of result.suggestions) {
      if (!suggestionMeta.has(suggestion.id)) {
        suggestionMeta.set(suggestion.id, {
          category: suggestion.category,
          severity: suggestion.severity,
          title: suggestion.title,
        });
      }
    }
  }
  const differingSuggestions: SuggestionComparisonRow[] = [...suggestionMeta.entries()]
    .map(([id, meta]) => ({
      id,
      ...meta,
      open: ordered.map((result) => result.suggestions.some((s) => s.id === id)),
    }))
    .filter((row) => row.open.some(Boolean) && !row.open.every(Boolean));

  return { subjects, categories, differingSkills, differingSuggestions };
}
