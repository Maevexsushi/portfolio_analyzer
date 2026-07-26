import { describe, expect, it } from "vitest";
import { detectDiscipline } from "@/lib/discipline/detect";
import { profileFor } from "@/lib/discipline/profiles";
import { composeVocabulary, matchSkills, skillsRegionFromLines } from "@/lib/discipline/skills";
import { analyzeLinks } from "@/lib/analyzer/links";
import { ctxFrom, shell } from "./helpers";

/*
 * The inclusivity claim, pinned down.
 *
 * These cases exist because the failure they guard against is invisible: a report that
 * judges an illustrator by whether they have a GitHub does not crash or look broken. It
 * looks like a strict review, and it tells someone their portfolio is deficient in a way
 * it is not. Each test below is a field whose expectations differ from software's.
 */

const detect = (text: string) => detectDiscipline(text);

describe("discipline detection", () => {
  it("reads a developer", () => {
    const finding = detect(
      "Software engineer. Built a REST API in Python with Docker and Kubernetes, deployed on AWS. See my GitHub repositories.",
    );
    expect(finding.key).toBe("software");
    expect(finding.confidence).toBeGreaterThan(50);
  });

  it("reads a designer", () => {
    const finding = detect(
      "Product designer. Case studies covering user research, wireframes, and a design system built in Figma. Usability testing with eight participants.",
    );
    expect(finding.key).toBe("design");
  });

  /*
   * A real miss found in end-to-end testing: the design signals were all UX vocabulary,
   * so a brand and editorial designer's portfolio — identity, packaging, typesetting,
   * signage, not a wireframe in sight — fell through to the general profile and was
   * judged by nobody's standards.
   */
  it("reads a brand and editorial designer, not just a UX one", () => {
    const finding = detect(
      "Selected work. Priya Raman, brand and editorial designer. Brand identity for a regional roaster: packaging system and in-store signage. Editorial design across four issues — set the grid and the typographic scale.",
    );
    expect(finding.key).toBe("design");
    expect(finding.confidence).toBeGreaterThan(45);
  });

  it("reads a nurse", () => {
    const finding = detect(
      "Registered nurse, NMC PIN held. Ward-based patient care on a busy surgical unit, medication administration, care planning, and safeguarding.",
    );
    expect(finding.key).toBe("care");
  });

  it("reads a marketer", () => {
    const finding = detect(
      "Growth marketer running paid social and SEO campaigns. Improved ROAS and cut CAC across Meta Ads and Google Ads, reporting through HubSpot.",
    );
    expect(finding.key).toBe("marketing");
  });

  it("reads an electrician", () => {
    const finding = detect(
      "Qualified electrician, 18th Edition and CSCS carded. First fix and second fix electrical installation, fault finding, and consumer unit upgrades. NVQ Level 3.",
    );
    expect(finding.key).toBe("trades");
  });

  it("reads a teacher", () => {
    const finding = detect(
      "Secondary school teacher with QTS and a PGCE. Curriculum design, lesson planning, differentiation for SEN pupils, and safeguarding lead.",
    );
    expect(finding.key).toBe("education");
  });

  it("reads a photographer", () => {
    const finding = detect(
      "Photographer and videographer. Studio lighting, colour grading in DaVinci Resolve, retouching in Lightroom. Commercial and documentary shoots.",
    );
    expect(finding.key).toBe("media");
  });

  /*
   * Confidence has to be honest, because a low-confidence guess still drives which
   * checks run. Falling back to the general profile is the correct behaviour for a
   * document that gives the detector nothing.
   */
  it("falls back to general rather than guessing at thin evidence", () => {
    const finding = detect("Hard-working professional seeking new opportunities. References available.");
    expect(finding.key).toBe("general");
    expect(finding.confidence).toBeLessThan(45);
  });

  it("offers the runner-up when two fields both fit", () => {
    const finding = detect(
      "Design technologist. I build design systems in Figma and ship them as React component libraries in TypeScript, with Storybook and accessibility testing.",
    );
    expect(["design", "software"]).toContain(finding.key);
    expect(finding.alternative).not.toBeNull();
  });

  it("shows the terms it matched so the reader can disagree", () => {
    const finding = detect("Registered nurse. Patient care, care plans, NMC registration.");
    expect(finding.evidence.length).toBeGreaterThan(0);
  });

  it("lets an explicit choice override detection entirely", () => {
    const finding = detectDiscipline("Software engineer with Python and Docker and Kubernetes.", {
      chosen: "care",
    });
    expect(finding.key).toBe("care");
    expect(finding.chosen).toBe(true);
    expect(finding.confidence).toBe(100);
  });

  /*
   * Repetition must not beat breadth. Without damping, one word said twenty times
   * outweighs five distinct signals from the field the document is actually about.
   */
  it("does not let one repeated word outweigh a field's real vocabulary", () => {
    const text = `${"design ".repeat(30)} Registered nurse with NMC registration, patient care, care planning, medication administration, and safeguarding on a surgical ward.`;
    expect(detect(text).key).toBe("care");
  });
});

describe("field-appropriate proof-of-work links", () => {
  const html = shell(`<h1>Priya Raman</h1>
    <p>Brand designer</p>
    <a href="https://www.behance.net/priya">Behance</a>
    <a href="https://www.linkedin.com/in/priya">LinkedIn</a>
    <a href="mailto:priya@example.com">Email</a>`);

  it("accepts Behance as proof of work for a designer", async () => {
    const report = await analyzeLinks(ctxFrom(html), {
      checkLinks: false,
      maxLinkChecks: 0,
      profile: profileFor("design"),
    });

    const proof = report.checks.find((check) => check.id === "links-proof-portfolio-platform");
    expect(proof?.status).toBe("pass");
    // The dev-only assumption this whole layer removes: no GitHub check for a designer.
    expect(report.checks.some((check) => check.id === "links-proof-github")).toBe(false);
  });

  it("still expects a code host from a developer", async () => {
    const report = await analyzeLinks(ctxFrom(html), {
      checkLinks: false,
      maxLinkChecks: 0,
      profile: profileFor("software"),
    });
    expect(report.checks.find((check) => check.id === "links-proof-github")?.status).toBe("fail");
  });

  /*
   * A designer with no GitHub is not deficient. Scoring the same page higher under the
   * design profile than under software is the whole point of the feature.
   */
  it("does not penalise a designer for the links their field does not use", async () => {
    const options = { checkLinks: false, maxLinkChecks: 0 };
    const asDesigner = await analyzeLinks(ctxFrom(html), {
      ...options,
      profile: profileFor("design"),
    });
    const asDeveloper = await analyzeLinks(ctxFrom(html), {
      ...options,
      profile: profileFor("software"),
    });

    expect(asDesigner.score).toBeGreaterThan(asDeveloper.score);
  });
});

describe("field-appropriate skills", () => {
  it("credits craft skills a technology taxonomy would miss entirely", () => {
    const text =
      "care planning, medication administration, clinical assessment, safeguarding, infection control, nmc registration, multidisciplinary working";
    const skills = matchSkills(text, text, composeVocabulary(profileFor("care")));
    const names = skills.map((skill) => skill.name);

    expect(names).toContain("Care Planning");
    expect(names).toContain("Safeguarding");
    expect(names).toContain("NMC / HCPC Registration");
  });

  it("keeps the technology vocabulary available to every field", () => {
    // A marketer who writes SQL should get the credit; careers are not tidy.
    const text = "seo, paid social, google analytics, sql, excel";
    const names = matchSkills(text, text, composeVocabulary(profileFor("marketing"))).map(
      (skill) => skill.name,
    );

    expect(names).toContain("SEO");
    expect(names).toContain("SQL");
  });

  it("finds the skills region in a plain-text document", () => {
    const lines = [
      "ADA OKONKWO",
      "EXPERIENCE",
      "Engineer at Monzo",
      "SKILLS",
      "Go, TypeScript, PostgreSQL",
      "EDUCATION",
      "BSc Computer Science",
    ];
    const region = skillsRegionFromLines(lines);

    expect(region).toContain("typescript");
    expect(region).not.toContain("monzo");
    expect(region).not.toContain("bsc computer science");
  });

  it("reads a one-line 'Skills: ...' heading as its own payload", () => {
    const region = skillsRegionFromLines(["Skills: Figma, Sketch, prototyping"]);
    expect(region).toContain("figma");
  });
});
