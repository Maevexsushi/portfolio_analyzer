import { describe, expect, it } from "vitest";
import { rankPostings, splitPostings } from "@/lib/jobmatch/rank";
import { composeVocabulary, matchSkills } from "@/lib/discipline/skills";
import type { SkillFinding } from "@/lib/types";
import { SOFTWARE_PROFILE } from "./helpers";

/*
 * Reverse job matching reuses analyzeJobMatch unchanged — the only new logic worth
 * pinning is splitting pasted text into individual postings, and putting the best fit
 * first without pretending a posting that could not be evaluated at all is the same
 * thing as a posting that was evaluated and scored zero.
 */

function resumeSkillsFrom(text: string): SkillFinding[] {
  const lower = text.toLowerCase();
  return matchSkills(lower, lower, composeVocabulary(SOFTWARE_PROFILE));
}

describe("splitPostings", () => {
  it("splits on a line of three or more dashes", () => {
    const { postings } = splitPostings("First posting.\n---\nSecond posting.\n----\nThird posting.");
    expect(postings).toEqual(["First posting.", "Second posting.", "Third posting."]);
  });

  it("treats text with no delimiter as a single posting", () => {
    const { postings } = splitPostings("Just one posting, no dashes anywhere.");
    expect(postings).toEqual(["Just one posting, no dashes anywhere."]);
  });

  it("drops blank chunks from a trailing or doubled delimiter", () => {
    const { postings } = splitPostings("First.\n---\n\n---\nSecond.");
    expect(postings).toEqual(["First.", "Second."]);
  });

  it("does not split on a hyphenated word or an em dash inside a line", () => {
    const { postings } = splitPostings("We need a full-stack engineer — apply now.");
    expect(postings).toHaveLength(1);
  });

  it("caps at 10 postings and reports how many were dropped", () => {
    const text = Array.from({ length: 13 }, (_, i) => `Posting ${i + 1}`).join("\n---\n");
    const { postings, droppedCount } = splitPostings(text);
    expect(postings).toHaveLength(10);
    expect(postings[0]).toBe("Posting 1");
    expect(droppedCount).toBe(3);
  });
});

const STRONG_JD = `Senior Backend Engineer
Requirements
- Python, Go, PostgreSQL, Docker required`;

const WEAK_JD = `Frontend Designer
Requirements
- Figma, Sketch, prototyping required`;

const EMPTY_JD = "Join our team! Great culture, great mission.";

describe("rankPostings", () => {
  const resumeSkills = resumeSkillsFrom("Built services in Python, Go, PostgreSQL, and Docker.");

  it("ranks the best-fitting posting first", () => {
    const ranked = rankPostings([WEAK_JD, STRONG_JD], SOFTWARE_PROFILE, resumeSkills);
    expect(ranked[0].jobMatch.score).not.toBeNull();
    expect(ranked[0].index).toBe(1); // STRONG_JD was second in the input, first in the input array
  });

  it("keeps the original index so a caller can label an unranked posting", () => {
    const ranked = rankPostings([STRONG_JD, WEAK_JD], SOFTWARE_PROFILE, resumeSkills);
    expect(ranked.map((r) => r.index).sort()).toEqual([0, 1]);
  });

  /* The one property that makes "ranked" honest: an unscoreable posting is not a zero. */
  it("sorts a posting with a null score last, not as a zero", () => {
    const ranked = rankPostings([STRONG_JD, EMPTY_JD], SOFTWARE_PROFILE, resumeSkills);
    expect(ranked[ranked.length - 1].jobMatch.score).toBeNull();
    expect(ranked[0].jobMatch.score).not.toBeNull();
  });

  it("guesses a job title per posting the same way single job match does", () => {
    const ranked = rankPostings([STRONG_JD], SOFTWARE_PROFILE, resumeSkills);
    expect(ranked[0].jobTitle).toBe("Senior Backend Engineer");
  });
});
