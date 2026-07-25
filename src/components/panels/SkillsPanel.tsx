import { EmptyNote, Panel, SubHeading } from "@/components/Panel";
import { CheckList } from "@/components/viz";
import { SKILL_CATEGORY_LABELS } from "@/lib/analyzer";
import type { SkillCategory, SkillsReport } from "@/lib/types";

/**
 * Skills Detector. Skills are identity data, not magnitude, so they render as grouped
 * chips rather than bars. A filled chip means the skill sits in a real skills section;
 * an outlined one means it was only inferred from body copy.
 */
export function SkillsPanel({ report }: { report: SkillsReport }) {
  const grouped = new Map<SkillCategory, typeof report.skills>();
  for (const skill of report.skills) {
    const existing = grouped.get(skill.category);
    if (existing) existing.push(skill);
    else grouped.set(skill.category, [skill]);
  }

  return (
    <Panel
      id="skills"
      title="Skills detected"
      description={`${report.total} technolog${report.total === 1 ? "y" : "ies"} across ${report.categoriesCovered.length} categor${report.categoriesCovered.length === 1 ? "y" : "ies"}.`}
      score={report.score}
    >
      <CheckList checks={report.checks} />

      <div className="mt-6">
        <SubHeading>By category</SubHeading>
        {report.skills.length === 0 ? (
          <EmptyNote>
            No known technologies were found in the page text. Name your stack explicitly —
            reviewers and applicant-tracking systems both search for these words.
          </EmptyNote>
        ) : (
          <div className="space-y-4">
            {[...grouped.entries()].map(([category, skills]) => (
              <div key={category}>
                <p className="mb-1.5 text-sm font-medium text-ink-soft">
                  {SKILL_CATEGORY_LABELS[category]}
                  <span className="ml-2 text-muted tabular-nums">{skills.length}</span>
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <li
                      key={skill.name}
                      className={`rounded-md px-2 py-1 text-sm ${
                        skill.declared
                          ? "bg-brand-soft text-brand-ink"
                          : "border border-line text-ink-soft"
                      }`}
                      title={
                        skill.declared
                          ? `Listed in a skills section · ${skill.mentions} mention${skill.mentions === 1 ? "" : "s"}`
                          : `Inferred from page text · ${skill.mentions} mention${skill.mentions === 1 ? "" : "s"}`
                      }
                    >
                      {skill.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-muted">
          Filled chips are listed in a skills section; outlined chips were only inferred from
          the page text.
        </p>
      </div>
    </Panel>
  );
}
