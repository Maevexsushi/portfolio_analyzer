import { describe, expect, it } from "vitest";
import { analyzeSkills, detectSkillNames } from "@/lib/analyzer/skills";
import { SOFTWARE_PROFILE, ctxFrom, shell } from "./helpers";

const found = (html: string): string[] => analyzeSkills(ctxFrom(html), SOFTWARE_PROFILE).skills.map((s) => s.name);

describe("skills detector — ambiguous English words", () => {
  /*
   * Several technology names are ordinary words. Matching them anywhere in the page
   * text invents skills the author never claimed, which is worse than missing one:
   * the report then tells them to "list more of your stack" while crediting them
   * with frameworks they have never used.
   */
  it("does not read prose 'express' as the Express framework", () => {
    expect(found(shell("<h1>Ada</h1><p>Design is how I express myself and my ideas.</p>"))).not.toContain(
      "Express",
    );
  });

  it("does not read 'spring semester' as Spring", () => {
    expect(
      found(shell("<h1>Ada</h1><section><h2>Education</h2><p>Spring semester 2024, BSc.</p></section>")),
    ).not.toContain("Spring");
  });

  it("does not read 'swift turnaround' as Swift", () => {
    expect(found(shell("<h1>Ada</h1><p>I pride myself on swift turnaround and clear comms.</p>"))).not.toContain(
      "Swift",
    );
  });

  it("does not read 'in jest' as Jest", () => {
    expect(found(shell("<h1>Ada</h1><p>Half in jest, half serious.</p>"))).not.toContain("Jest");
  });

  it("does not read a rust-red palette as Rust", () => {
    expect(found(shell("<h1>Ada</h1><p>A rust-red and cream colour palette.</p>"))).not.toContain("Rust");
  });

  it("does not read a bare 'TS' in prose as TypeScript", () => {
    expect(found(shell("<h1>Ada</h1><p>The TS report was filed on Monday.</p>"))).not.toContain(
      "TypeScript",
    );
  });
});

describe("skills detector — unambiguous forms still count anywhere", () => {
  it("detects Express from Express.js in a project description", () => {
    expect(found(shell("<h1>Ada</h1><p>Built the REST API with Express.js and Postgres.</p>"))).toContain(
      "Express",
    );
  });

  it("detects Spring from Spring Boot", () => {
    expect(found(shell("<h1>Ada</h1><p>A Spring Boot service behind Nginx.</p>"))).toContain("Spring");
  });

  it("detects Swift from SwiftUI", () => {
    expect(found(shell("<h1>Ada</h1><p>An iOS app in SwiftUI.</p>"))).toContain("Swift");
  });

  it("detects TypeScript spelled out", () => {
    expect(found(shell("<h1>Ada</h1><p>Written in TypeScript end to end.</p>"))).toContain("TypeScript");
  });
});

describe("skills detector — a declared skills section is trusted context", () => {
  const withSkills = shell(`<h1>Ada</h1>
    <section id="skills"><h2>Skills</h2>
      <ul><li>TS</li><li>Express</li><li>Spring</li><li>Swift</li><li>Jest</li><li>Rust</li></ul>
    </section>`);

  it("counts ambiguous names when they are listed as skills", () => {
    const names = found(withSkills);
    for (const skill of ["TypeScript", "Express", "Spring", "Swift", "Jest", "Rust"]) {
      expect(names, `${skill} should be detected inside a skills section`).toContain(skill);
    }
  });

  it("marks skills-section entries as declared", () => {
    const report = analyzeSkills(ctxFrom(withSkills), SOFTWARE_PROFILE);
    expect(report.hasSkillsSection).toBe(true);
    expect(report.skills.find((s) => s.name === "Express")?.declared).toBe(true);
  });
});

describe("detectSkillNames — project tag context", () => {
  it("accepts an ambiguous name from a short tech-tag string", () => {
    // A <li>Express</li> inside a project card is a stack listing, not prose.
    expect(detectSkillNames("Express")).toContain("Express");
  });

  it("still resolves unambiguous names", () => {
    expect(detectSkillNames("Next.js")).toContain("Next.js");
  });
});

describe("skills detector — breadth reporting", () => {
  it("does not claim coverage it cannot see", () => {
    const report = analyzeSkills(ctxFrom(shell("<h1>Ada</h1><p>I build things.</p>")), SOFTWARE_PROFILE);
    expect(report.total).toBe(0);
    expect(report.score).toBe(0);
    expect(report.checks.find((c) => c.id === "skills-count")?.status).toBe("fail");
  });

  it("credits a broad, genuinely declared stack", () => {
    const report = analyzeSkills(
      ctxFrom(
        shell(`<h1>Ada</h1><section id="skills"><h2>Tech stack</h2><ul>
        <li>TypeScript</li><li>React</li><li>Next.js</li><li>Node.js</li><li>PostgreSQL</li>
        <li>Prisma</li><li>Docker</li><li>AWS</li><li>Playwright</li><li>Tailwind CSS</li>
        <li>GraphQL</li><li>Redis</li></ul></section>`),
      ),
      SOFTWARE_PROFILE,
    );
    expect(report.total).toBeGreaterThanOrEqual(10);
    expect(report.checks.find((c) => c.id === "skills-count")?.status).toBe("pass");
    expect(report.score).toBeGreaterThan(75);
  });
});
