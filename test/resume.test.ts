import { describe, expect, it } from "vitest";
import { extractDocument } from "@/lib/intake";
import { profileFor } from "@/lib/discipline/profiles";
import { analyzeAts } from "@/lib/document/ats";
import { analyzeContact } from "@/lib/document/contact";
import { analyzeExperience } from "@/lib/document/experience";
import { analyzeLanguage } from "@/lib/document/language";
import { analyzeResumeStructure } from "@/lib/document/sections";
import { classifyDocument } from "@/lib/document/classify";
import { STRONG_RESUME, makeDocx, makePdf, makeTextPdf } from "./doc-helpers";
import type { ExtractedDocument } from "@/lib/intake";

const SOFTWARE = profileFor("software");

async function fromText(text: string, fileName = "ada-okonkwo-resume.pdf") {
  return extractDocument({ fileName, bytes: await makeTextPdf(text) });
}

const statusOf = (checks: { id: string; status: string }[], id: string) => {
  const check = checks.find((entry) => entry.id === id);
  if (!check) throw new Error(`no check "${id}" (have: ${checks.map((c) => c.id).join(", ")})`);
  return check.status;
};

describe("contact extraction", () => {
  it("pulls name, email, phone and location out of a header block", async () => {
    const report = analyzeContact(await fromText(STRONG_RESUME), SOFTWARE, { strict: true });

    expect(report.name).toBe("ADA OKONKWO");
    expect(report.email).toBe("ada.okonkwo@example.com");
    expect(report.phone).toContain("7700");
    expect(report.location).toContain("London");
  });

  /*
   * "2021 - Present" and "2018 - 2021" satisfy any loose phone pattern, and a resume is
   * full of them. Reporting a date range as someone's phone number would be a visible,
   * embarrassing wrong answer in the first panel of the report.
   */
  it("does not read a date range as a phone number", async () => {
    const document = await fromText(
      "MARIA SANTOS\nmaria@example.com\nEXPERIENCE\nAnalyst, 2019 - 2023\nEDUCATION\nBA 2019",
    );
    expect(analyzeContact(document, SOFTWARE, { strict: true }).phone).toBeNull();
  });

  it("does not mistake a job title line for a person's name", async () => {
    const document = await fromText(
      `Senior Marketing Manager
CURRICULUM VITAE
sam@example.com
EXPERIENCE
Brand Lead, Acme, 2020 - 2023
- Ran the rebrand across six markets.`,
    );
    const report = analyzeContact(document, SOFTWARE, { strict: true });
    expect(report.name).not.toBe("Senior Marketing Manager");
  });

  it("finds contact details only near the top, not a referee on the last page", async () => {
    const bytes = await makePdf([
      { lines: ["ADA OKONKWO", "ada@example.com", "EXPERIENCE", "Engineer at Monzo since 2021"] },
      { lines: ["REFERENCES", "Dr Referee", "referee@university.example", "+44 20 7946 0000"] },
    ]);
    const report = analyzeContact(
      await extractDocument({ fileName: "ada.pdf", bytes }),
      SOFTWARE,
      { strict: true },
    );
    expect(report.phone).toBeNull();
  });
});

describe("resume structure", () => {
  it("finds the conventional sections", async () => {
    const report = analyzeResumeStructure(await fromText(STRONG_RESUME));
    const found = report.sections.filter((section) => section.found).map((section) => section.id);

    expect(found).toContain("experience");
    expect(found).toContain("education");
    expect(found).toContain("skills");
    expect(found).toContain("summary");
    expect(report.requiredFound).toBe(report.requiredTotal);
  });

  it("prefers real Word heading styles over guessing at text shape", async () => {
    const document = await extractDocument({
      fileName: "p.docx",
      bytes: makeDocx([
        { text: "Priya Raman", heading: 1 },
        { text: "priya@example.com" },
        { text: "Experience", heading: 2 },
        { text: "Content Designer at Monzo from 2021 to present, leading onboarding copy." },
        { text: "Education", heading: 2 },
        { text: "BA English, Leeds, 2018" },
        { text: "Skills", heading: 2 },
        { text: "Content design, UX writing, Figma" },
      ]),
    });
    const report = analyzeResumeStructure(document);
    expect(report.requiredFound).toBe(3);
  });

  it("reports reverse-chronological order", async () => {
    const forwards = await fromText(
      "ADA\nada@e.com\nEXPERIENCE\nJunior, 2015 - 2017\nMid, 2017 - 2020\nSenior, 2020 - Present\nEDUCATION\nBSc 2015",
    );
    expect(analyzeResumeStructure(forwards).reverseChronological).toBe(false);
  });

  /*
   * Two dated entries prove nothing about ordering. Telling someone with one job that
   * their chronology is wrong is the kind of confident nonsense that makes a whole
   * report untrustworthy.
   */
  it("declines to judge ordering when there is too little to go on", async () => {
    const document = await fromText(
      `ADA OKONKWO
ada@example.com
EXPERIENCE
Backend Engineer, Monzo, 2021 - Present
- Built the settlement reconciliation service.
EDUCATION
BSc Computer Science, UCL`,
    );
    expect(analyzeResumeStructure(document).reverseChronological).toBeNull();
  });
});

describe("experience and impact", () => {
  it("counts bullets, action verbs, and quantified achievements", async () => {
    const report = analyzeExperience(await fromText(STRONG_RESUME), SOFTWARE);

    expect(report.entries.length).toBe(2);
    expect(report.totalBullets).toBe(5);
    expect(report.quantifiedBullets).toBeGreaterThanOrEqual(4);
    expect(report.quantificationRate).toBeGreaterThan(0.7);
    expect(statusOf(report.checks, "experience-quantified")).toBe("pass");
  });

  it("flags duty-phrase bullets and quotes them back", async () => {
    const document = await fromText(
      `SAM PATEL
sam@example.com
EXPERIENCE
Operations Assistant, Acme, 2020 - 2023
- Responsible for managing the team calendar and inbox.
- Helped with onboarding new starters.
- Assisted with monthly reporting.
EDUCATION
BA 2020`,
    );
    const report = analyzeExperience(document, SOFTWARE);

    expect(statusOf(report.checks, "experience-verbs")).toBe("fail");
    expect(statusOf(report.checks, "experience-quantified")).toBe("fail");
    expect(report.entries[0].weakBullets[0]).toContain("Responsible for managing");
  });

  /*
   * Plenty of resumes write short paragraphs instead of glyph bullets, and some PDF
   * text layers drop the glyph entirely. Scoring those as "no bullets" would be an
   * artefact of extraction reported as a fact about the writing.
   */
  it("counts unmarked lines when the resume uses no bullet glyphs", async () => {
    const document = await fromText(
      `SAM PATEL
sam@example.com
EXPERIENCE
Operations Lead, Acme, 2020 - 2023
Cut invoice processing time by 60% across three regional offices.
Trained 12 staff on the new reconciliation workflow.
EDUCATION
BA 2020`,
    );
    const report = analyzeExperience(document, SOFTWARE);

    expect(report.totalBullets).toBeGreaterThanOrEqual(2);
    expect(report.quantifiedBullets).toBeGreaterThanOrEqual(2);
  });

  it("uses the field's own outcome vocabulary", async () => {
    const text = `PRIYA RAMAN
priya@example.com
EXPERIENCE
Growth Marketer, Acme, 2021 - Present
- Raised conversion 24% and cut CAC by a third across paid social.
EDUCATION
BA 2018`;
    const document = await fromText(text);

    const marketing = analyzeExperience(document, profileFor("marketing"));
    expect(statusOf(marketing.checks, "experience-outcomes")).not.toBe("fail");
  });
});

describe("machine readability", () => {
  it("passes a normal single-column PDF", async () => {
    const report = analyzeAts(await fromText(STRONG_RESUME));

    expect(report.machineReadable).toBe(true);
    expect(report.standardHeadings).toContain("EXPERIENCE");
    expect(report.suspectedColumns).toBe(false);
    expect(statusOf(report.checks, "ats-readable")).toBe("pass");
  });

  it("flags an unprofessional file name", async () => {
    const report = analyzeAts(await fromText(STRONG_RESUME, "resume final FINAL v2.pdf"));
    expect(statusOf(report.checks, "ats-filename")).toBe("warn");
  });

  it("flags headings a parser cannot map", async () => {
    const document = await fromText(
      `ADA OKONKWO
ada@example.com
Where I Have Been
Engineer at Monzo from 2021, building payment rails and settlement tooling.
My Learning Journey
BSc Computer Science, UCL, 2018
Things I Am Good At
Go, TypeScript, PostgreSQL`,
    );
    const report = analyzeAts(document);
    expect(statusOf(report.checks, "ats-headings")).not.toBe("pass");
    expect(report.nonStandardHeadings.length).toBeGreaterThan(0);
  });

  /*
   * OCR text is not machine-readable in the sense that matters here: the employer's
   * system receives the image, not our transcription of it. The report has to say the
   * document fails even though this tool managed to read it.
   */
  it("treats OCR text as unreadable by an ATS", () => {
    const ocr: ExtractedDocument = {
      format: "image",
      origin: "ocr",
      fileName: "cv.png",
      bytes: 100_000,
      text: "ADA OKONKWO\nEXPERIENCE\nEngineer",
      lowerText: "ada okonkwo\nexperience\nengineer",
      lines: ["ADA OKONKWO", "EXPERIENCE", "Engineer"],
      pages: [],
      pageCount: 1,
      wordCount: 4,
      links: [],
      hasClickableLinks: false,
      imageCount: 1,
      title: null,
      author: null,
      producer: null,
      html: null,
      ocrConfidence: 92,
      warnings: [],
    };

    const report = analyzeAts(ocr);
    expect(report.machineReadable).toBe(false);
    expect(statusOf(report.checks, "ats-readable")).toBe("fail");
  });
});

describe("writing", () => {
  it("quotes the stock phrases it found", async () => {
    const document = await fromText(
      `SAM PATEL
sam@example.com
SUMMARY
A hard-working team player and self-starter who is passionate about delivering results in a fast-paced environment.
EXPERIENCE
Analyst, Acme, 2020 - 2023
- Did the reporting.`,
    );
    const report = analyzeLanguage(document, { penaliseFirstPerson: true });

    expect(report.clicheHits.length).toBeGreaterThanOrEqual(3);
    expect(report.clicheHits.join(" ")).toContain("team player");
    expect(statusOf(report.checks, "language-cliches")).toBe("fail");
  });

  it("does not read ordinary adjectives as passive voice", async () => {
    const document = await fromText(
      `SAM PATEL
sam@example.com
SUMMARY
I am interested in platform work and experienced in distributed systems. The team is dedicated and committed.
EXPERIENCE
Engineer, Acme, 2020 - 2023
- Built the thing.`,
    );
    const report = analyzeLanguage(document, { penaliseFirstPerson: true });
    expect(report.passiveHits).toEqual([]);
  });
});

describe("document classification", () => {
  it("reads a two-page dated CV as a resume", async () => {
    const document = await fromText(STRONG_RESUME);
    const classification = classifyDocument(document);

    expect(classification.kind).toBe("resume");
    expect(classification.confidence).toBeGreaterThan(50);
  });

  it("reads a long image-led deck as a portfolio", async () => {
    const pages = Array.from({ length: 12 }, (_, index) => ({
      lines: [`Case study ${index + 1}`, "Brand identity work for a regional roaster"],
    }));
    const document = await extractDocument({
      fileName: "priya-portfolio.pdf",
      bytes: await makePdf(pages),
    });

    expect(classifyDocument(document).kind).toBe("document");
  });

  /*
   * Someone who photographs their CV must not be told it has no case studies. A single
   * image page is structurally ambiguous, so the text alone decides.
   */
  it("classifies by text when the file is a single page", async () => {
    const document = await fromText(STRONG_RESUME);
    expect(classifyDocument(document).kind).toBe("resume");
  });
});
