import { describe, expect, it } from "vitest";
import { analyzeCoverLetter } from "@/lib/document/coverletter";
import {
  findUnverifiedSkills,
  isEmptyCoverLetterDraft,
  coverLetterToText,
  normalizeCoverLetterDraft,
} from "@/lib/ai/coverletter";
import { statusOf } from "./helpers";
import { SOFTWARE_PROFILE } from "./helpers";

/*
 * The cover letter review is the same kind of check as the resume's Writing tab, run
 * against a different document shape. The draft's guard is narrower than the resume
 * rewrite's — see the module comment in src/lib/ai/coverletter.ts for why — so these
 * cases pin exactly what it does check: named skills against the resume's own findings.
 */

const GOOD_LETTER = `Dear Jane Okafor,

I'm applying for the Senior Backend Engineer role at Acme Corp because your payments
platform is exactly the kind of high-stakes infrastructure I want to keep building. At my
last role I built production services in Python and Go, and I led the migration of our
order pipeline onto Kubernetes without a single missed deployment window.

I would also point to my work hardening our PostgreSQL clusters, which taught me most of
what I know about the operational side of running a platform like Acme's at scale.

I would welcome the opportunity to discuss how this experience could serve your team.

Sincerely,
Sam Patel`;

describe("cover letter review", () => {
  it("passes a letter that names a person, the role, the company, and closes with a next step", () => {
    const report = analyzeCoverLetter({
      text: GOOD_LETTER,
      jobTitle: "Senior Backend Engineer",
      companyName: "Acme Corp",
    });

    expect(statusOf(report.checks, "coverletter-greeting")).toBe("pass");
    expect(statusOf(report.checks, "coverletter-role")).toBe("pass");
    expect(statusOf(report.checks, "coverletter-company")).toBe("pass");
    expect(statusOf(report.checks, "coverletter-closing")).toBe("pass");
    expect(report.hasPersonalGreeting).toBe(true);
  });

  it("flags a generic greeting", () => {
    const report = analyzeCoverLetter({
      text: "To Whom It May Concern,\n\nI am writing to apply.",
      jobTitle: null,
      companyName: null,
    });
    expect(report.hasPersonalGreeting).toBe(false);
    expect(statusOf(report.checks, "coverletter-greeting")).toBe("warn");
  });

  it("catches stock phrases", () => {
    const report = analyzeCoverLetter({
      text: "Dear Jane,\n\nI am a hard-working team player with a proven track record.",
      jobTitle: null,
      companyName: null,
    });
    expect(report.clicheHits.length).toBeGreaterThan(0);
    expect(statusOf(report.checks, "coverletter-cliches")).not.toBe("pass");
  });

  it("fails when the company name never appears", () => {
    const report = analyzeCoverLetter({
      text: GOOD_LETTER.replace(/Acme('s)?\s*(Corp)?/gi, ""),
      jobTitle: "Senior Backend Engineer",
      companyName: "Acme Corp",
    });
    expect(report.mentionsCompany).toBe(false);
    expect(statusOf(report.checks, "coverletter-company")).toBe("fail");
  });

  it("skips the role/company checks entirely when neither was given", () => {
    const report = analyzeCoverLetter({ text: GOOD_LETTER, jobTitle: null, companyName: null });
    expect(report.mentionsRole).toBeNull();
    expect(report.mentionsCompany).toBeNull();
    expect(report.checks.find((c) => c.id === "coverletter-role")).toBeUndefined();
    expect(report.checks.find((c) => c.id === "coverletter-company")).toBeUndefined();
  });

  it("flags a letter that is too short to say anything specific", () => {
    const report = analyzeCoverLetter({
      text: "Dear Jane,\n\nPlease consider my application.",
      jobTitle: null,
      companyName: null,
    });
    expect(statusOf(report.checks, "coverletter-length")).toBe("warn");
  });
});

describe("cover letter draft — unverified-skill guard", () => {
  const resumeSkillNames = new Set(["Python", "Docker"]);

  it("passes a draft that only names skills the resume already evidences", () => {
    const unverified = findUnverifiedSkills(
      "Built services in Python, deployed with Docker.",
      SOFTWARE_PROFILE,
      resumeSkillNames,
    );
    expect(unverified).toEqual([]);
  });

  /* The one failure mode this guard exists to catch: a technology the resume never mentioned. */
  it("flags a skill the draft names that the resume never evidenced", () => {
    const unverified = findUnverifiedSkills(
      "Built services in Python and led our Kubernetes migration.",
      SOFTWARE_PROFILE,
      resumeSkillNames,
    );
    expect(unverified).toContain("Kubernetes");
    expect(unverified).not.toContain("Python");
  });

  it("normalizes a well-formed model response and surfaces the unverified skill", () => {
    const draft = normalizeCoverLetterDraft(
      {
        greeting: "Dear Hiring Manager,",
        paragraphs: ["I have built services in Python and Kubernetes clusters at scale."],
        closing: "I would welcome the chance to discuss this further.",
        notes: ["Drew on the Python experience."],
      },
      SOFTWARE_PROFILE,
      resumeSkillNames,
      "test-model",
      "2026-01-01T00:00:00.000Z",
    );

    expect(draft.unverifiedSkills).toContain("Kubernetes");
    expect(isEmptyCoverLetterDraft(draft)).toBe(false);
  });

  it("treats a response with no paragraphs as empty", () => {
    const draft = normalizeCoverLetterDraft(
      { greeting: "Dear Hiring Manager,", paragraphs: [], closing: "", notes: [] },
      SOFTWARE_PROFILE,
      resumeSkillNames,
      "test-model",
      "2026-01-01T00:00:00.000Z",
    );
    expect(isEmptyCoverLetterDraft(draft)).toBe(true);
  });

  it("renders plain, copyable text with no run of blank lines", () => {
    const draft = normalizeCoverLetterDraft(
      {
        greeting: "Dear Hiring Manager,",
        paragraphs: ["First paragraph.", "Second paragraph."],
        closing: "Sincerely, Sam.",
        notes: [],
      },
      SOFTWARE_PROFILE,
      resumeSkillNames,
      "test-model",
      "2026-01-01T00:00:00.000Z",
    );

    const text = coverLetterToText(draft);
    expect(text).toContain("First paragraph.");
    expect(text).toContain("Sincerely, Sam.");
    expect(text).not.toMatch(/\n{3}/);
  });

  it("survives a malformed response without throwing", () => {
    const draft = normalizeCoverLetterDraft(
      { greeting: 42, paragraphs: "nope", closing: null, notes: "nope" },
      SOFTWARE_PROFILE,
      resumeSkillNames,
      "test-model",
      "2026-01-01T00:00:00.000Z",
    );
    expect(draft.greeting).toBe("Dear Hiring Manager,");
    expect(draft.paragraphs).toEqual([]);
    expect(draft.notes).toEqual([]);
  });
});
