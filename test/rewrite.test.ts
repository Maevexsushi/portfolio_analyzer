import { describe, expect, it } from "vitest";
import {
  normalizeRewrite,
  rewriteToText,
  sourceNumbers,
  stripInventedNumbers,
} from "@/lib/ai/rewrite";

/*
 * The fabrication guard.
 *
 * This is the highest-stakes code in the project. Every other module can be wrong and
 * cost someone a misleading score; this one can put a number a person never achieved
 * onto a document they will be asked to defend in an interview. The prompt tells the
 * model not to invent facts, but a prompt is advice — these cases pin the enforcement.
 */

const SOURCE = `SAM PATEL
sam@example.com
EXPERIENCE
Operations Assistant, Acme Logistics, 2021 - 2024
- Responsible for managing the team calendar and the shared inbox.
- Helped with onboarding 12 new starters.
EDUCATION
BA Business Studies, 2021`;

const allowed = sourceNumbers(SOURCE);

describe("source numbers", () => {
  it("collects every figure in the resume as bare digits", () => {
    expect(allowed.has("12")).toBe(true);
    expect(allowed.has("2021")).toBe(true);
    expect(allowed.has("2024")).toBe(true);
  });

  it("strips separators so reformatting is not read as invention", () => {
    const numbers = sourceNumbers("handled 1,200 tickets and 3.5 million records");
    expect(numbers.has("1200")).toBe(true);
    expect(numbers.has("35")).toBe(true);
  });
});

describe("invented-number guard", () => {
  it("keeps a number that is in the source", () => {
    const result = stripInventedNumbers("Onboarded 12 new starters", allowed);
    expect(result.text).toBe("Onboarded 12 new starters");
    expect(result.redacted).toBe(false);
  });

  /* The exact failure this whole feature is designed around. */
  it("replaces a number the model made up", () => {
    const result = stripInventedNumbers("Reduced processing time by 40%", allowed);
    expect(result.text).toBe("Reduced processing time by [N%]");
    expect(result.redacted).toBe(true);
  });

  it("distinguishes a percentage from a bare count", () => {
    expect(stripInventedNumbers("cut costs 37%", allowed).text).toContain("[N%]");
    expect(stripInventedNumbers("managed 37 people", allowed).text).toContain("[N] people");
  });

  it("tolerates the model reformatting a figure it was given", () => {
    const numbers = sourceNumbers("processed 1,200 orders");
    expect(stripInventedNumbers("Processed 1200 orders", numbers).redacted).toBe(false);
  });

  /*
   * An earlier version masked placeholders with a numeric index before scanning, so the
   * scan redacted its own scaffolding and the restored text came back mangled.
   */
  it("leaves existing placeholders alone", () => {
    const result = stripInventedNumbers("Managed the rota for [N staff] across [N] sites", allowed);
    expect(result.text).toBe("Managed the rota for [N staff] across [N] sites");
    expect(result.redacted).toBe(false);
  });

  it("guards real numbers sitting next to placeholders", () => {
    const result = stripInventedNumbers("Trained [N] staff and cut errors 60%", allowed);
    expect(result.text).toBe("Trained [N] staff and cut errors [N%]");
    expect(result.redacted).toBe(true);
  });

  it("does not touch text with no numbers at all", () => {
    const result = stripInventedNumbers("Managed the team calendar", allowed);
    expect(result.text).toBe("Managed the team calendar");
    expect(result.redacted).toBe(false);
  });
});

describe("rewrite normalization", () => {
  const now = "2026-01-01T00:00:00.000Z";

  const wellFormed = {
    headline: "Sam Patel — Operations Coordinator",
    contactLine: "sam@example.com",
    sections: [
      {
        heading: "Experience",
        body: "",
        entries: [
          {
            title: "Operations Assistant",
            meta: "Acme Logistics, 2021 - 2024",
            bullets: [
              {
                before: "Responsible for managing the team calendar and the shared inbox.",
                after: "Managed the team calendar and shared inbox for [N staff].",
                why: "Duty phrase to action; team size missing",
              },
              {
                before: "Helped with onboarding 12 new starters.",
                after: "Onboarded 12 new starters.",
                why: "Removed hedging verb",
              },
            ],
          },
        ],
      },
    ],
    placeholders: [{ token: "[N staff]", prompt: "How many people were on the team?" }],
    notes: ["Rewrote duty phrasing as action phrasing."],
  };

  it("keeps a well-formed draft intact", () => {
    const rewrite = normalizeRewrite(wellFormed, SOURCE, "m", now);

    expect(rewrite.sections).toHaveLength(1);
    expect(rewrite.sections[0].entries[0].bullets).toHaveLength(2);
    expect(rewrite.redactedCount).toBe(0);
    expect(rewrite.placeholders[0].token).toBe("[N staff]");
  });

  it("collects the placeholders used in each bullet", () => {
    const rewrite = normalizeRewrite(wellFormed, SOURCE, "m", now);
    expect(rewrite.sections[0].entries[0].bullets[0].placeholders).toEqual(["[N staff]"]);
  });

  /*
   * The end-to-end case: a model that ignores the instruction still cannot get a
   * fabricated figure past the normalizer and into the stored document.
   */
  it("redacts an invented figure and counts it", () => {
    const withLie = structuredClone(wellFormed);
    withLie.sections[0].entries[0].bullets[1].after = "Onboarded 12 starters, cutting ramp-up 45%.";

    const rewrite = normalizeRewrite(withLie, SOURCE, "m", now);
    const bullet = rewrite.sections[0].entries[0].bullets[1];

    expect(bullet.after).toBe("Onboarded 12 starters, cutting ramp-up [N%].");
    expect(bullet.redacted).toBe(true);
    expect(rewrite.redactedCount).toBe(1);
  });

  /*
   * A token the guard introduced has no prompt from the model, because the model never
   * meant to leave a gap there. Without a fallback the author sees a bare "[N%]" with
   * nothing telling them what it wants.
   */
  it("invents a prompt for placeholders the guard created", () => {
    const withLie = structuredClone(wellFormed);
    withLie.sections[0].entries[0].bullets[1].after = "Cut ramp-up time 45%.";

    const rewrite = normalizeRewrite(withLie, SOURCE, "m", now);
    const added = rewrite.placeholders.find((p) => p.token === "[N%]");

    expect(added).toBeDefined();
    expect(added?.prompt).toContain("not in your original resume");
  });

  it("does not guard role lines, whose dates are facts from the source", () => {
    const rewrite = normalizeRewrite(wellFormed, SOURCE, "m", now);
    expect(rewrite.sections[0].entries[0].meta).toBe("Acme Logistics, 2021 - 2024");
  });

  it("survives a malformed response without throwing", () => {
    const rewrite = normalizeRewrite(
      { headline: 42, sections: "nope", placeholders: [{ token: "" }], notes: null },
      SOURCE,
      "m",
      now,
    );
    expect(rewrite.headline).toBe("");
    expect(rewrite.sections).toEqual([]);
    expect(rewrite.placeholders).toEqual([]);
    expect(rewrite.notes).toEqual([]);
  });

  it("drops empty sections and bullets rather than rendering blanks", () => {
    const rewrite = normalizeRewrite(
      {
        sections: [
          { heading: "Experience", body: "", entries: [] },
          { heading: "", body: "orphaned", entries: [] },
          { heading: "Summary", body: "Operations coordinator.", entries: [] },
        ],
      },
      SOURCE,
      "m",
      now,
    );
    expect(rewrite.sections.map((s) => s.heading)).toEqual(["Summary"]);
  });
});

/*
 * Found in live testing: asked to write the summary the resume was missing, the model
 * produced "detail-oriented operations professional with a proven track record" — two
 * of the exact phrases this tool tells people to delete, in a section it had just
 * invented. The draft would have handed back the cliché the report flags one tab over.
 */
describe("stock-phrase check", () => {
  const now = "2026-01-01T00:00:00.000Z";

  it("catches filler the model reintroduced in a summary it wrote", () => {
    const rewrite = normalizeRewrite(
      {
        headline: "Sam Patel",
        sections: [
          {
            heading: "Summary",
            body: "Detail-oriented operations professional with a proven track record.",
            entries: [],
          },
        ],
      },
      SOURCE,
      "m",
      now,
    );

    expect(rewrite.stockPhrases).toContain("detail-oriented");
    expect(rewrite.stockPhrases).toContain("proven track record");
  });

  it("catches filler in a rewritten bullet, not just prose", () => {
    const rewrite = normalizeRewrite(
      {
        sections: [
          {
            heading: "Experience",
            body: "",
            entries: [
              {
                title: "Analyst",
                meta: "",
                bullets: [{ before: "x", after: "Thrived in a fast-paced environment.", why: "y" }],
              },
            ],
          },
        ],
      },
      SOURCE,
      "m",
      now,
    );
    expect(rewrite.stockPhrases).toContain("fast-paced environment");
  });

  it("stays quiet on a draft written in plain specifics", () => {
    const rewrite = normalizeRewrite(
      {
        headline: "Sam Patel",
        sections: [
          {
            heading: "Experience",
            body: "",
            entries: [
              {
                title: "Operations Assistant",
                meta: "Acme, 2021 - 2024",
                bullets: [
                  { before: "x", after: "Managed the rota for [N staff].", why: "y" },
                ],
              },
            ],
          },
        ],
      },
      SOURCE,
      "m",
      now,
    );
    expect(rewrite.stockPhrases).toEqual([]);
  });
});

describe("plain text output", () => {
  it("renders a copyable resume", () => {
    const rewrite = normalizeRewrite(
      {
        headline: "Sam Patel",
        contactLine: "sam@example.com",
        sections: [
          {
            heading: "Experience",
            body: "",
            entries: [
              {
                title: "Operations Assistant",
                meta: "Acme, 2021 - 2024",
                bullets: [{ before: "x", after: "Managed the rota.", why: "y" }],
              },
            ],
          },
        ],
      },
      SOURCE,
      "m",
      "2026-01-01T00:00:00.000Z",
    );

    const text = rewriteToText(rewrite);
    expect(text).toContain("Sam Patel");
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("Operations Assistant — Acme, 2021 - 2024");
    expect(text).toContain("- Managed the rota.");
    // No runs of blank lines, which would look broken when pasted into a document.
    expect(text).not.toMatch(/\n{3}/);
  });
});
