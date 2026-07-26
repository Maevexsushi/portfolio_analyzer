import { describe, expect, it } from "vitest";
import { draftSkillGapNotes, normalizeSkillGapNotes } from "@/lib/ai/skillgap";

/*
 * The guard here is a fabricated *resource*, not a fabricated fact about the reader —
 * unlike the rewrite's number guard or the cover letter's unverified-skill guard, this
 * module cannot ask the model anything about the resume at all, only about a named
 * public skill. These cases pin the one enforcement surface that matters: no URL
 * survives into a rendered note, ordering follows what was actually requested, and a
 * skill the model skipped or invented does not produce a blank or off-topic card.
 */

describe("normalizeSkillGapNotes", () => {
  const requested = ["Docker", "Kubernetes", "Terraform"];

  it("keeps notes in the order requested, not the order returned", () => {
    const notes = normalizeSkillGapNotes(
      {
        notes: [
          { skill: "Kubernetes", whatItIs: "Container orchestration.", howToLearn: "Start small." },
          { skill: "Docker", whatItIs: "Container runtime.", howToLearn: "Build one image." },
        ],
      },
      requested,
    );

    expect(notes.map((n) => n.skill)).toEqual(["Docker", "Kubernetes"]);
  });

  it("matches skill names case-insensitively", () => {
    const notes = normalizeSkillGapNotes(
      { notes: [{ skill: "docker", whatItIs: "Container runtime.", howToLearn: "Build one image." }] },
      requested,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].skill).toBe("Docker"); // the requested casing wins, not the model's
  });

  it("drops a skill that was never requested", () => {
    const notes = normalizeSkillGapNotes(
      { notes: [{ skill: "GraphQL", whatItIs: "A query language.", howToLearn: "Read the spec." }] },
      requested,
    );
    expect(notes).toEqual([]);
  });

  it("drops an entry with no real explanation rather than rendering a blank card", () => {
    const notes = normalizeSkillGapNotes(
      { notes: [{ skill: "Docker", whatItIs: "", howToLearn: "Build one image." }] },
      requested,
    );
    expect(notes).toEqual([]);
  });

  /* The core guard: no URL survives, no matter how it is dressed up. */
  it("strips URLs out of both fields", () => {
    const notes = normalizeSkillGapNotes(
      {
        notes: [
          {
            skill: "Docker",
            whatItIs: "See https://example.com/docker for details.",
            howToLearn: "Try www.example.com/course first.",
          },
        ],
      },
      requested,
    );
    expect(notes[0].whatItIs).not.toContain("http");
    expect(notes[0].howToLearn).not.toContain("www.");
  });

  it("survives a malformed response without throwing", () => {
    expect(normalizeSkillGapNotes(null, requested)).toEqual([]);
    expect(normalizeSkillGapNotes({ notes: "nope" }, requested)).toEqual([]);
    expect(normalizeSkillGapNotes({ notes: [{ skill: 42 }] }, requested)).toEqual([]);
  });
});

describe("draftSkillGapNotes", () => {
  it("returns no notes and makes no request when there are no missing skills", async () => {
    const notes = await draftSkillGapNotes({ skills: [], fieldLabel: "Software" });
    expect(notes).toEqual([]);
  });
});
