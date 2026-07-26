import { describe, expect, it } from "vitest";
import { buildParsePreview } from "@/lib/document/parsepreview";
import type {
  ContactReport,
  ExperienceEntry,
  ExperienceReport,
  ResumeStructureReport,
  SkillFinding,
  SkillsReport,
} from "@/lib/types";

/*
 * The parse preview's own new logic — everything else on it is a repackaging of
 * reports tested elsewhere. Two things are actually new: splitting a role line into
 * title/company, and collecting the Education section's raw lines. Both follow the
 * same rule the rest of this codebase already applies: decline rather than guess badly.
 */

function contact(overrides: Partial<ContactReport> = {}): ContactReport {
  return {
    score: 100,
    name: null,
    email: null,
    phone: null,
    location: null,
    links: [],
    checks: [],
    ...overrides,
  };
}

function experience(entries: Partial<ExperienceEntry>[]): ExperienceReport {
  return {
    score: 100,
    entries: entries.map((entry) => ({
      title: "",
      dateRange: null,
      bulletCount: 0,
      actionVerbBullets: 0,
      quantifiedBullets: 0,
      weakBullets: [],
      ...entry,
    })),
    totalBullets: 0,
    quantifiedBullets: 0,
    actionVerbBullets: 0,
    quantificationRate: 0,
    checks: [],
  };
}

function structure(educationFound: boolean): ResumeStructureReport {
  return {
    score: 100,
    sections: [
      {
        id: "education",
        label: "Education",
        required: true,
        found: educationFound,
        evidence: educationFound ? "Education" : null,
      },
    ],
    requiredFound: educationFound ? 1 : 0,
    requiredTotal: 1,
    reverseChronological: null,
    checks: [],
  };
}

function skills(findings: SkillFinding[] = []): SkillsReport {
  return {
    score: 100,
    total: findings.length,
    skills: findings,
    categoriesCovered: [],
    missingCategories: [],
    hasSkillsSection: findings.length > 0,
    checks: [],
  };
}

const NO_LINES: string[] = [];

describe("buildParsePreview — title/company split", () => {
  it("splits a role line when exactly one side reads as a job title", () => {
    const preview = buildParsePreview(
      NO_LINES,
      contact(),
      experience([{ title: "Senior Backend Engineer, Monzo, 2021 - Present", dateRange: "2021 - Present" }]),
      structure(false),
      skills(),
    );

    expect(preview.workHistory[0].title).toBe("Senior Backend Engineer");
    expect(preview.workHistory[0].company).toBe("Monzo");
  });

  it("splits regardless of which side the title is on", () => {
    const preview = buildParsePreview(
      NO_LINES,
      contact(),
      experience([{ title: "Monzo, Senior Backend Engineer, 2021 - Present", dateRange: "2021 - Present" }]),
      structure(false),
      skills(),
    );

    expect(preview.workHistory[0].title).toBe("Senior Backend Engineer");
    expect(preview.workHistory[0].company).toBe("Monzo");
  });

  /* The core guard: two title-shaped or two company-shaped halves is not a coin-flip. */
  it("declines to split when both halves read as a title", () => {
    const preview = buildParsePreview(
      NO_LINES,
      contact(),
      experience([{ title: "Engineering Manager, Senior Director, 2021 - Present", dateRange: "2021 - Present" }]),
      structure(false),
      skills(),
    );

    expect(preview.workHistory[0].title).toBeNull();
    expect(preview.workHistory[0].company).toBeNull();
    expect(preview.workHistory[0].raw).toContain("Engineering Manager");
  });

  it("declines to split when neither half reads as a title", () => {
    const preview = buildParsePreview(
      NO_LINES,
      contact(),
      experience([{ title: "Monzo, Starling, 2021 - Present", dateRange: "2021 - Present" }]),
      structure(false),
      skills(),
    );

    expect(preview.workHistory[0].title).toBeNull();
    expect(preview.workHistory[0].company).toBeNull();
  });

  it("strips the date range before attempting the split", () => {
    const preview = buildParsePreview(
      NO_LINES,
      contact(),
      experience([{ title: "Senior Backend Engineer, Monzo, 2021 - Present", dateRange: "2021 - Present" }]),
      structure(false),
      skills(),
    );

    expect(preview.workHistory[0].dateRange).toBe("2021 - Present");
    expect(preview.workHistory[0].title).not.toContain("2021");
  });

  it("keeps the raw line untouched even when the split succeeds", () => {
    const preview = buildParsePreview(
      NO_LINES,
      contact(),
      experience([{ title: "Senior Backend Engineer, Monzo, 2021 - Present", dateRange: "2021 - Present" }]),
      structure(false),
      skills(),
    );
    expect(preview.workHistory[0].raw).toBe("Senior Backend Engineer, Monzo, 2021 - Present");
  });
});

describe("buildParsePreview — education", () => {
  const lines = [
    "ADA OKONKWO",
    "EXPERIENCE",
    "Senior Backend Engineer, Monzo",
    "EDUCATION",
    "BSc Computer Science, UCL, 2018",
    "SKILLS",
    "Go, PostgreSQL",
  ];

  it("collects lines under the Education heading, stopping at the next heading", () => {
    const preview = buildParsePreview(lines, contact(), experience([]), structure(true), skills());
    expect(preview.educationFound).toBe(true);
    expect(preview.educationLines).toEqual(["BSc Computer Science, UCL, 2018"]);
  });

  it("reports no lines at all when structure found no Education section", () => {
    const preview = buildParsePreview(lines, contact(), experience([]), structure(false), skills());
    expect(preview.educationFound).toBe(false);
    expect(preview.educationLines).toEqual([]);
  });
});

describe("buildParsePreview — the rest", () => {
  it("passes contact fields through unchanged", () => {
    const preview = buildParsePreview(
      NO_LINES,
      contact({ name: "Ada Okonkwo", email: "ada@example.com" }),
      experience([]),
      structure(false),
      skills(),
    );
    expect(preview.name).toBe("Ada Okonkwo");
    expect(preview.email).toBe("ada@example.com");
  });

  it("lists only declared skills, not every skill detected", () => {
    const findings: SkillFinding[] = [
      { name: "Go", category: "languages", mentions: 3, declared: true },
      { name: "PostgreSQL", category: "database", mentions: 1, declared: false },
    ];
    const preview = buildParsePreview(NO_LINES, contact(), experience([]), structure(false), skills(findings));
    expect(preview.skillsDeclared).toEqual(["Go"]);
    expect(preview.skillsTotal).toBe(2);
  });
});
