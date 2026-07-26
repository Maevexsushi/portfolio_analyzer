import { describe, expect, it } from "vitest";
import { analyzeJobMatch, guessJobTitle, splitJobDescriptionZones } from "@/lib/jobmatch";
import { profileFor } from "@/lib/discipline/profiles";
import { composeVocabulary, matchSkills } from "@/lib/discipline/skills";
import type { JobMatchSkillEvidence, SkillFinding } from "@/lib/types";
import { SOFTWARE_PROFILE } from "./helpers";

/** Matched skills carry evidence (mentions, declared) now, not just a bare name. */
function names(matched: JobMatchSkillEvidence[]): string[] {
  return matched.map((skill) => skill.name);
}

/*
 * Job matching is deliberately the plainest kind of check in the project: does a named
 * skill from the posting appear anywhere in the resume's own findings. No AI, no
 * network call, nothing that could hallucinate a match that is not there. These cases
 * pin the two things that make that plain check trustworthy: the zone split (so
 * "nice to have" is never treated as mandatory) and the score staying honest when there
 * is nothing to compare against.
 */

const JD_WITH_ZONES = `Senior Backend Engineer

About the team
We build the payments platform that every checkout on the site depends on.

Requirements
- 5+ years building production services in Python or Go
- Deep experience with PostgreSQL and Docker
- Comfortable with Kubernetes in production

Nice to have
- Experience with Terraform
- Familiarity with GraphQL

Benefits
Health insurance, remote-first, unlimited PTO.`;

function resumeSkillsFrom(text: string): SkillFinding[] {
  const lower = text.toLowerCase();
  return matchSkills(lower, lower, composeVocabulary(SOFTWARE_PROFILE));
}

describe("splitting a posting into zones", () => {
  it("keeps required and preferred separate", () => {
    const zones = splitJobDescriptionZones(JD_WITH_ZONES);
    expect(zones.required).toContain("PostgreSQL");
    expect(zones.required).toContain("Kubernetes");
    expect(zones.required).not.toContain("Terraform");
    expect(zones.preferred).toContain("Terraform");
    expect(zones.preferred).toContain("GraphQL");
  });

  it("treats an undifferentiated posting as entirely required", () => {
    const zones = splitJobDescriptionZones("We need someone who knows React and PostgreSQL.");
    expect(zones.required).toContain("React");
    expect(zones.preferred).toBe("");
  });

  it("stops a zone at the next unrelated heading", () => {
    const zones = splitJobDescriptionZones(JD_WITH_ZONES);
    // "Benefits" closes the preferred zone; health insurance must not read as a skill ask.
    expect(zones.preferred).not.toContain("Health insurance");
  });
});

describe("guessing the job title", () => {
  it("takes the short first line", () => {
    expect(guessJobTitle(JD_WITH_ZONES)).toBe("Senior Backend Engineer");
  });

  it("declines when the first line is prose, not a title", () => {
    const prose =
      "We are looking for an experienced engineer to join our growing platform team and help us scale.";
    expect(guessJobTitle(prose)).toBeNull();
  });
});

describe("matching a resume against a posting", () => {
  it("reports full coverage when every required skill is evidenced", () => {
    const resumeSkills = resumeSkillsFrom(
      "Built production services in Python and Go. Deployed with Docker and Kubernetes on PostgreSQL.",
    );
    const report = analyzeJobMatch({
      jobDescriptionText: JD_WITH_ZONES,
      profile: SOFTWARE_PROFILE,
      resumeSkills,
    });

    expect(report.score).not.toBeNull();
    expect(report.missingRequired).toEqual([]);
    expect(report.matchedRequired.length).toBeGreaterThan(0);
    expect(report.checks.find((c) => c.id === "jobmatch-required")?.status).toBe("pass");
  });

  /*
   * The one property that makes this feature trustworthy rather than decorative: a
   * skill genuinely absent from the resume must show up as missing, by name, not
   * papered over by a vague percentage.
   */
  it("names what is missing rather than only scoring it", () => {
    const resumeSkills = resumeSkillsFrom("Built services in Python with some SQL experience.");
    const report = analyzeJobMatch({
      jobDescriptionText: JD_WITH_ZONES,
      profile: SOFTWARE_PROFILE,
      resumeSkills,
    });

    expect(report.missingRequired).toContain("Docker");
    expect(report.missingRequired).toContain("Kubernetes");
    expect(names(report.matchedRequired)).toContain("Python");
  });

  it("never fails the whole match for an uncovered preferred skill", () => {
    const resumeSkills = resumeSkillsFrom(
      "Python, Go, Docker, Kubernetes, PostgreSQL — no Terraform or GraphQL experience.",
    );
    const report = analyzeJobMatch({
      jobDescriptionText: JD_WITH_ZONES,
      profile: SOFTWARE_PROFILE,
      resumeSkills,
    });

    const preferredCheck = report.checks.find((c) => c.id === "jobmatch-preferred");
    expect(preferredCheck?.status).not.toBe("fail");
  });

  it("weights required coverage above preferred in the score", () => {
    const missingRequired = resumeSkillsFrom("Terraform and GraphQL only, nothing else.");
    const missingPreferred = resumeSkillsFrom(
      "Python, Go, Docker, Kubernetes, PostgreSQL — none of the nice-to-haves.",
    );

    const scoreMissingRequired = analyzeJobMatch({
      jobDescriptionText: JD_WITH_ZONES,
      profile: SOFTWARE_PROFILE,
      resumeSkills: missingRequired,
    }).score!;
    const scoreMissingPreferred = analyzeJobMatch({
      jobDescriptionText: JD_WITH_ZONES,
      profile: SOFTWARE_PROFILE,
      resumeSkills: missingPreferred,
    }).score!;

    expect(scoreMissingPreferred).toBeGreaterThan(scoreMissingRequired);
  });

  /*
   * A pasted fragment that contains no recognisable skill at all must not produce a
   * confident-looking number — null is the honest answer, not 0 or 100.
   */
  it("returns a null score when nothing could be extracted from the posting", () => {
    const report = analyzeJobMatch({
      jobDescriptionText: "Join our team! Great culture, great people, great mission.",
      profile: SOFTWARE_PROFILE,
      resumeSkills: resumeSkillsFrom("Python, Go, Docker."),
    });

    expect(report.score).toBeNull();
    expect(report.checks.find((c) => c.id === "jobmatch-empty")?.status).toBe("fail");
  });

  it("counts a skill named in both zones as required only", () => {
    const dual = "Requirements\nMust know Docker.\n\nNice to have\nDocker experience a plus.";
    const resumeSkills = resumeSkillsFrom("I use Docker daily.");
    const report = analyzeJobMatch({
      jobDescriptionText: dual,
      profile: SOFTWARE_PROFILE,
      resumeSkills,
    });

    expect(names(report.matchedRequired)).toContain("Docker");
    expect(names(report.matchedPreferred)).not.toContain("Docker");
  });

  it("works against a non-software field's own vocabulary", () => {
    const designProfile = profileFor("design");
    const jd = "Requirements\nExpert in Figma and Sketch, strong prototyping skills.";
    const resumeSkills = matchSkills(
      "designed in figma daily, built prototypes for every release".toLowerCase(),
      "figma".toLowerCase(),
      composeVocabulary(designProfile),
    );

    const report = analyzeJobMatch({ jobDescriptionText: jd, profile: designProfile, resumeSkills });
    expect(names(report.matchedRequired)).toContain("Figma");
    expect(report.missingRequired).toContain("Sketch");
  });

  /*
   * A matched skill is not just a checkmark — it carries the resume's own evidence for
   * it, so the reader can tell "declared in a skills list" from "mentioned once in
   * passing" without having to trust the match blindly.
   */
  it("carries the resume's own mention count and declared status on a match", () => {
    const resumeSkills = matchSkills(
      "built production services in python and go. deployed with docker and kubernetes on postgresql. python python.".toLowerCase(),
      "python, go, docker".toLowerCase(),
      composeVocabulary(SOFTWARE_PROFILE),
    );

    const report = analyzeJobMatch({
      jobDescriptionText: JD_WITH_ZONES,
      profile: SOFTWARE_PROFILE,
      resumeSkills,
    });

    const python = report.matchedRequired.find((s) => s.name === "Python");
    const postgres = report.matchedRequired.find((s) => s.name === "PostgreSQL");

    expect(python?.declared).toBe(true);
    expect(python?.mentions).toBeGreaterThanOrEqual(3);
    // Not in the declaredText passed above, so it is evidenced only from prose.
    expect(postgres?.declared).toBe(false);
  });

  it("weights required coverage above preferred when both sections exist", () => {
    const report = analyzeJobMatch({
      jobDescriptionText: JD_WITH_ZONES,
      profile: SOFTWARE_PROFILE,
      resumeSkills: resumeSkillsFrom("Python, Go, Docker."),
    });

    expect(report.requiredWeight).toBeGreaterThan(report.preferredWeight);
    expect(report.requiredWeight + report.preferredWeight).toBeCloseTo(1);
  });
});
