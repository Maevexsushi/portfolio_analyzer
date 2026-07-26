import { describe, expect, it } from "vitest";
import { bestIndexOf, compareResumes } from "@/lib/compare";
import type { ResumeResult } from "@/lib/types";

/*
 * Resume comparison is a pure diff over stored reports: two reports in, one structure
 * out, describing only what disagrees between them. These cases pin the three things
 * that make a diff worth reading rather than noise: it orders reports chronologically
 * rather than by selection order, it drops anything identical across every report
 * compared, and ties never get papered over with a false "winner."
 */

function fakeResume(overrides: {
  id: string;
  analyzedAt: string;
  overallScore: number;
  fileName: string;
  breakdown: { key: string; label: string; score: number }[];
  skillNames?: string[];
  suggestionIds?: string[];
}): ResumeResult {
  return {
    kind: "resume",
    id: overrides.id,
    analyzedAt: overrides.analyzedAt,
    durationMs: 10,
    overallScore: overrides.overallScore,
    grade: "B",
    verdict: "",
    upload: { fileName: overrides.fileName, format: "pdf", bytes: 1000, pageCount: 1 },
    discipline: {
      key: "software",
      label: "Software",
      blurb: "",
      confidence: 100,
      evidence: [],
      alternative: null,
      chosen: true,
    },
    breakdown: overrides.breakdown.map((entry) => ({ ...entry, weight: 0.2, summary: "" })),
    skills: {
      score: 80,
      total: (overrides.skillNames ?? []).length,
      skills: (overrides.skillNames ?? []).map((name) => ({
        name,
        category: "languages",
        mentions: 1,
        declared: true,
      })),
      categoriesCovered: [],
      missingCategories: [],
      hasSkillsSection: true,
      checks: [],
    },
    suggestions: (overrides.suggestionIds ?? []).map((id) => ({
      id,
      category: "ats",
      severity: "important",
      title: `Fix ${id}`,
      detail: "",
      impact: 5,
    })),
    ai: null,
    rewrite: null,
    jobMatch: null,
    coverLetter: null,
    coverLetterDraft: null,
    warnings: [],
  } as unknown as ResumeResult;
}

describe("bestIndexOf", () => {
  it("picks the single highest score", () => {
    expect(bestIndexOf([70, 90, 60])).toBe(1);
  });

  it("returns null on a tie", () => {
    expect(bestIndexOf([80, 80, 60])).toBeNull();
  });

  it("skips nulls when picking a winner", () => {
    expect(bestIndexOf([null, 55, null])).toBe(1);
  });

  it("returns null when every score is null", () => {
    expect(bestIndexOf([null, null])).toBeNull();
  });
});

describe("compareResumes", () => {
  const older = fakeResume({
    id: "a",
    analyzedAt: "2026-01-01T00:00:00.000Z",
    overallScore: 60,
    fileName: "resume-v1.pdf",
    breakdown: [
      { key: "ats", label: "Machine Readability", score: 50 },
      { key: "contact", label: "Contact & Reachability", score: 90 },
    ],
    skillNames: ["Python", "SQL"],
    suggestionIds: ["ats-readable", "ats-columns"],
  });

  const newer = fakeResume({
    id: "b",
    analyzedAt: "2026-02-01T00:00:00.000Z",
    overallScore: 80,
    fileName: "resume-v2.pdf",
    breakdown: [
      { key: "ats", label: "Machine Readability", score: 95 },
      { key: "contact", label: "Contact & Reachability", score: 90 },
    ],
    skillNames: ["Python", "Kubernetes"],
    suggestionIds: ["ats-columns"],
  });

  it("orders subjects chronologically regardless of input order", () => {
    const comparison = compareResumes([newer, older]);
    expect(comparison.subjects.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("marks the higher score as the winner in a category that differs", () => {
    const comparison = compareResumes([older, newer]);
    const ats = comparison.categories.find((c) => c.key === "ats")!;
    expect(ats.scores).toEqual([50, 95]);
    expect(ats.bestIndex).toBe(1);
  });

  it("drops a category where every report scores identically", () => {
    const comparison = compareResumes([older, newer]);
    expect(comparison.categories.find((c) => c.key === "contact")).toBeUndefined();
  });

  /* The core promise of the "what changed" view: a fixed issue reads as fixed. */
  it("shows a suggestion fixed in the newer report as fixed there and open in the older one", () => {
    const comparison = compareResumes([older, newer]);
    const readable = comparison.differingSuggestions.find((s) => s.id === "ats-readable")!;
    expect(readable.open).toEqual([true, false]);
  });

  it("drops a suggestion that is open in every report compared", () => {
    const comparison = compareResumes([older, newer]);
    expect(comparison.differingSuggestions.find((s) => s.id === "ats-columns")).toBeUndefined();
  });

  it("keeps a skill present in only one report and drops one shared by both", () => {
    const comparison = compareResumes([older, newer]);
    const names = comparison.differingSkills.map((s) => s.name);
    expect(names).toContain("SQL");
    expect(names).toContain("Kubernetes");
    expect(names).not.toContain("Python");
  });

  it("reports which reports have each differing skill", () => {
    const comparison = compareResumes([older, newer]);
    const sql = comparison.differingSkills.find((s) => s.name === "SQL")!;
    expect(sql.present).toEqual([true, false]);
  });
});
