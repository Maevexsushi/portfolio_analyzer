import { describe, expect, it } from "vitest";
import {
  buildDigest,
  isEmptyCompanyBrief,
  normalizeCompanyBrief,
  type CompanyPageDigest,
} from "@/lib/ai/companybrief";

/*
 * The model call itself is not tested — a network round trip, non-deterministic by
 * design, the same reason the AI review's own model call is not tested. What matters
 * here is the boundary either side of it: the digest never carries more than the pages
 * actually fetched, and a claim with no supporting line from those pages is dropped
 * rather than rendered — the same guard the AI review applies to strengths/underselling,
 * because a company is a real entity and an unsupported claim about one is worse than
 * almost any other failure mode in this app.
 */

const now = "2026-01-01T00:00:00.000Z";

function page(overrides: Partial<CompanyPageDigest> = {}): CompanyPageDigest {
  return {
    url: "https://acme.example/about",
    title: "About Acme",
    description: "",
    text: "Acme builds payment infrastructure for online retailers.",
    ...overrides,
  };
}

describe("company brief digest", () => {
  it("carries each page's URL and text", () => {
    const digest = buildDigest({ pages: [page()] });
    expect(digest).toContain("https://acme.example/about");
    expect(digest).toContain("Acme builds payment infrastructure");
  });

  it("only carries as many pages as were actually fetched", () => {
    const digest = buildDigest({ pages: [page({ url: "https://acme.example" })] });
    expect(digest).not.toContain("careers");
  });

  it("caps at three pages even if more are given", () => {
    const pages = Array.from({ length: 5 }, (_, i) =>
      page({ url: `https://acme.example/page-${i}`, text: `Page ${i} content.` }),
    );
    const digest = buildDigest({ pages });
    expect(digest).toContain("page-0");
    expect(digest).toContain("page-2");
    expect(digest).not.toContain("page-3");
    expect(digest).not.toContain("page-4");
  });

  it("truncates one very long page rather than blowing the context window", () => {
    const digest = buildDigest({
      pages: [page({ text: "Acme builds payments. ".repeat(2000) })],
    });
    expect(digest.length).toBeLessThan(6000);
  });
});

describe("company brief normalization", () => {
  it("keeps a well-formed response intact", () => {
    const brief = normalizeCompanyBrief(
      {
        whatTheyDo: "Acme builds payment infrastructure for online retailers.",
        focusAreas: [{ title: "Fraud detection", evidence: "The page describes a real-time fraud model." }],
        cultureSignals: [{ title: "Remote-first", evidence: "The careers page states the team is fully remote." }],
        notes: ["The pages say nothing about engineering practices."],
      },
      ["https://acme.example/about"],
      "openai/gpt-oss-120b",
      now,
    );

    expect(brief.whatTheyDo).toContain("payment infrastructure");
    expect(brief.focusAreas).toHaveLength(1);
    expect(brief.cultureSignals).toHaveLength(1);
    expect(brief.sourceUrls).toEqual(["https://acme.example/about"]);
    expect(brief.model).toBe("openai/gpt-oss-120b");
  });

  /* The core guard: an unsupported claim about a real company is dropped, not rendered. */
  it("drops a highlight with no supporting evidence", () => {
    const brief = normalizeCompanyBrief(
      {
        focusAreas: [
          { title: "Great company" },
          { title: "", evidence: "orphaned evidence" },
          { title: "Payments", evidence: "The homepage describes a payments API." },
        ],
      },
      [],
      "m",
      now,
    );
    expect(brief.focusAreas).toEqual([{ title: "Payments", evidence: "The homepage describes a payments API." }]);
  });

  it("survives wrong types without throwing", () => {
    const brief = normalizeCompanyBrief(
      { whatTheyDo: 42, focusAreas: "none", cultureSignals: {}, notes: [1, 2] },
      [],
      "m",
      now,
    );
    expect(brief.whatTheyDo).toBe("");
    expect(brief.focusAreas).toEqual([]);
    expect(brief.cultureSignals).toEqual([]);
    expect(brief.notes).toEqual([]);
    expect(isEmptyCompanyBrief(brief)).toBe(true);
  });

  it("caps list lengths so one verbose response cannot flood the panel", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      title: `Area ${index}`,
      evidence: "Backed by the page.",
    }));
    const brief = normalizeCompanyBrief({ focusAreas: many, cultureSignals: many }, [], "m", now);
    expect(brief.focusAreas).toHaveLength(5);
    expect(brief.cultureSignals).toHaveLength(5);
  });

  it("is not empty when only whatTheyDo came back", () => {
    const brief = normalizeCompanyBrief({ whatTheyDo: "Acme builds payments." }, [], "m", now);
    expect(isEmptyCompanyBrief(brief)).toBe(false);
  });
});
