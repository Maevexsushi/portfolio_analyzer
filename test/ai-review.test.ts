import { describe, expect, it } from "vitest";
import { buildDigest, isEmptyReview, normalizeReview, type ReviewInput } from "@/lib/ai/review";
import { analyzeLinks } from "@/lib/analyzer/links";
import { analyzeProjects } from "@/lib/analyzer/projects";
import { analyzeSections } from "@/lib/analyzer/sections";
import { analyzeSkills } from "@/lib/analyzer/skills";
import { SOFTWARE_PROFILE, ctxFrom, shell } from "./helpers";

/*
 * The model call itself is not tested — it is a network round trip whose output is
 * non-deterministic by design. What is worth pinning down are the two boundaries
 * either side of it: what leaves the process, and what a response is allowed to
 * become once it is back. Both are pure functions, so both are cheap to hold still.
 */

const PAGE = shell(`
  <h1>Ada Okonkwo</h1>
  <section id="about"><h2>About</h2><p>I build accessible web applications.</p></section>
  <section id="projects"><h2>Projects</h2>
    <article>
      <h3>Ledger</h3>
      <p>A double-entry accounting engine handling reconciliation for 4,000 monthly transactions.</p>
      <a href="https://ledger.example">Live</a>
      <a href="https://github.com/ada/ledger">Source</a>
      <span>TypeScript</span><span>Postgres</span>
    </article>
  </section>
  <section id="contact"><h2>Contact</h2><a href="mailto:ada@example.com">Email</a></section>
`);

async function inputFrom(html: string): Promise<ReviewInput> {
  const ctx = ctxFrom(html);
  return {
    finalUrl: ctx.finalUrl,
    meta: ctx.meta,
    headings: ctx.headings,
    text: ctx.text,
    sections: analyzeSections(ctx),
    projects: analyzeProjects(ctx),
    skills: analyzeSkills(ctx, SOFTWARE_PROFILE),
    links: await analyzeLinks(ctx, { checkLinks: false, maxLinkChecks: 0, profile: SOFTWARE_PROFILE }),
  };
}

describe("review digest", () => {
  it("carries the project evidence the question is actually about", async () => {
    const digest = buildDigest(await inputFrom(PAGE));
    expect(digest).toContain("Ledger");
    expect(digest).toContain("double-entry accounting engine");
    expect(digest).toContain("has a live demo");
    expect(digest).toContain("source linked");
  });

  it("puts the projects ahead of the raw page copy", async () => {
    const digest = buildDigest(await inputFrom(PAGE));
    expect(digest.indexOf("## Projects")).toBeLessThan(digest.indexOf("## Visible page copy"));
  });

  it("caps the page copy so one long site cannot blow the context window", async () => {
    const filler = "<p>Lorem ipsum dolor sit amet consectetur. </p>".repeat(4000);
    const digest = buildDigest(await inputFrom(shell(`<h1>Ada</h1>${filler}`)));
    // 6k of copy plus the structured evidence above it, nowhere near the raw page.
    expect(digest.length).toBeLessThan(12_000);
  });

  it("says so plainly when no projects were found", async () => {
    const digest = buildDigest(await inputFrom(shell("<h1>Ada</h1><p>Coming soon.</p>")));
    expect(digest).toContain("None could be extracted");
  });
});

describe("review normalization", () => {
  const now = "2026-01-01T00:00:00.000Z";

  it("keeps a well-formed response intact", () => {
    const review = normalizeReview(
      {
        pitch: "Builds accounting infrastructure end to end.",
        positioning: "Stronger systems depth than most juniors.",
        strengths: [{ title: "Real reconciliation logic", evidence: "Ledger handles 4,000 transactions." }],
        underselling: [{ title: "Scale is buried", evidence: "The 4,000 figure is in body copy, not the heading." }],
        standoutProject: "Ledger",
        bestFitRoles: ["Junior backend engineer"],
      },
      "openai/gpt-oss-120b",
      now,
    );

    expect(review.strengths).toHaveLength(1);
    expect(review.standoutProject).toBe("Ledger");
    expect(review.bestFitRoles).toEqual(["Junior backend engineer"]);
    expect(review.model).toBe("openai/gpt-oss-120b");
  });

  /*
   * An unsupported claim is the one failure mode that makes this feature worse than
   * not having it: a confident sentence with nothing behind it reads exactly like a
   * measured finding. Highlights missing their evidence are dropped, not rendered.
   */
  it("drops highlights with no evidence behind them", () => {
    const review = normalizeReview(
      {
        strengths: [
          { title: "Great engineer" },
          { title: "", evidence: "orphaned evidence" },
          { title: "Ships production systems", evidence: "Ledger is deployed and linked." },
        ],
      },
      "m",
      now,
    );
    expect(review.strengths).toEqual([
      { title: "Ships production systems", evidence: "Ledger is deployed and linked." },
    ]);
  });

  it("survives wrong types without throwing", () => {
    const review = normalizeReview(
      { pitch: 42, positioning: null, strengths: "none", underselling: {}, bestFitRoles: [1, 2] },
      "m",
      now,
    );
    expect(review.pitch).toBe("");
    expect(review.strengths).toEqual([]);
    expect(review.underselling).toEqual([]);
    expect(review.bestFitRoles).toEqual([]);
    expect(isEmptyReview(review)).toBe(true);
  });

  it("reads a declined standout project as no standout project", () => {
    expect(normalizeReview({ standoutProject: "" }, "m", now).standoutProject).toBeNull();
    expect(normalizeReview({ standoutProject: "None" }, "m", now).standoutProject).toBeNull();
  });

  it("caps list lengths so one verbose response cannot flood the panel", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      title: `Strength ${index}`,
      evidence: "Backed by the digest.",
    }));
    const review = normalizeReview({ strengths: many, underselling: many }, "m", now);
    expect(review.strengths).toHaveLength(5);
    expect(review.underselling).toHaveLength(4);
  });

  it("deduplicates roles case-insensitively", () => {
    const review = normalizeReview(
      { bestFitRoles: ["Frontend engineer", "frontend engineer", "Backend engineer"] },
      "m",
      now,
    );
    expect(review.bestFitRoles).toEqual(["Frontend engineer", "Backend engineer"]);
  });
});
