import Link from "next/link";
import { Check, X } from "lucide-react";
import { EmptyNote, Panel, SubHeading } from "@/components/Panel";
import { CheckList } from "@/components/viz";
import type { JobMatchReport, JobMatchSkillEvidence } from "@/lib/types";

/**
 * Job description match.
 *
 * Unscored against the overall report on purpose — see the type's own comment — so
 * this panel carries its own score, separate from the badge the tab strip would
 * otherwise infer from checks alone. The chips are the point: a percentage without the
 * actual missing skill names is a number you have to trust; the names are a number you
 * can act on — and a matched name carries its own evidence (how many times it shows up,
 * and whether it was in a skills list or only in prose), so "matched" is not just a
 * checkmark you have to take on faith either.
 */
function MatchedSkillChips({ skills }: { skills: JobMatchSkillEvidence[] }) {
  if (skills.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {skills.map((skill) => (
        <li
          key={skill.name}
          title={
            skill.declared
              ? `Listed in your skills section · mentioned ${skill.mentions} time${skill.mentions === 1 ? "" : "s"}`
              : `Mentioned ${skill.mentions} time${skill.mentions === 1 ? "" : "s"} in your resume`
          }
          className="flex items-center gap-1 rounded-full border border-good/40 bg-good-soft px-2.5 py-1 text-sm text-ink"
        >
          <Check size={13} strokeWidth={3} aria-hidden className="shrink-0 text-good" />
          {skill.name}
          {skill.declared && <span className="text-good">*</span>}
          <span className="text-muted">
            · {skill.mentions}×
          </span>
        </li>
      ))}
    </ul>
  );
}

function MissingSkillChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <li
          key={name}
          className="flex items-center gap-1 rounded-full border border-bad/40 bg-bad-soft px-2.5 py-1 text-sm text-bad"
        >
          <X size={13} strokeWidth={3} aria-hidden />
          {name}
        </li>
      ))}
    </ul>
  );
}

export function JobMatchPanel({ report }: { report: JobMatchReport | null }) {
  if (!report) {
    return (
      <Panel
        id="jobmatch"
        title="Job match"
        description="How this resume stacks up against a specific posting — the same named-skill match every ATS keyword checker runs, shown with the evidence rather than just a percentage."
      >
        <EmptyNote>
          No job posting was pasted in with this resume. Run it again from the{" "}
          <Link href="/job-match" className="font-semibold text-brand-ink hover:underline">
            Job match page
          </Link>{" "}
          with a posting pasted in, and this tab will compare your named skills against what it
          asks for.
        </EmptyNote>
      </Panel>
    );
  }

  if (report.score === null) {
    return (
      <Panel id="jobmatch" title="Job match" description={report.jobTitle ?? undefined}>
        <CheckList checks={report.checks} />
      </Panel>
    );
  }

  const totalRequired = report.matchedRequired.length + report.missingRequired.length;
  const totalPreferred = report.matchedPreferred.length + report.missingPreferred.length;
  const requiredPct = totalRequired > 0 ? Math.round((report.matchedRequired.length / totalRequired) * 100) : null;
  const preferredPct =
    totalPreferred > 0 ? Math.round((report.matchedPreferred.length / totalPreferred) * 100) : null;

  const coverageParts: string[] = [];
  if (requiredPct !== null) {
    coverageParts.push(
      `${requiredPct}% of required skills (${report.matchedRequired.length} of ${totalRequired})`,
    );
  }
  if (preferredPct !== null) {
    coverageParts.push(
      `${preferredPct}% of preferred skills (${report.matchedPreferred.length} of ${totalPreferred})`,
    );
  }
  const coverageSentence =
    coverageParts.length > 0 ? ` You cover ${coverageParts.join(" and ")}.` : "";

  return (
    <Panel
      id="jobmatch"
      title="Job match"
      score={report.score}
      description={
        report.jobTitle
          ? `Matched against: “${report.jobTitle}”. Named skills only — years of experience, degree requirements, and soft-skill prose are not evaluated.`
          : "Named skills only — years of experience, degree requirements, and soft-skill prose are not evaluated."
      }
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-line bg-surface-2/50 p-4 text-sm text-ink-soft">
          <p>
            Required skills carry {Math.round(report.requiredWeight * 100)}% of this score,
            preferred skills the other {Math.round(report.preferredWeight * 100)}%.
            {coverageSentence}
          </p>
        </div>

        {totalRequired > 0 && (
          <div>
            <SubHeading>
              Required skills ({report.matchedRequired.length}/{totalRequired})
            </SubHeading>
            <div className="space-y-2">
              <MatchedSkillChips skills={report.matchedRequired} />
              <MissingSkillChips names={report.missingRequired} />
            </div>
          </div>
        )}

        <div>
          <SubHeading>
            Preferred skills
            {totalPreferred > 0 ? ` (${report.matchedPreferred.length}/${totalPreferred})` : ""}
          </SubHeading>
          {totalPreferred > 0 ? (
            <div className="space-y-2">
              <MatchedSkillChips skills={report.matchedPreferred} />
              <MissingSkillChips names={report.missingPreferred} />
            </div>
          ) : (
            <p className="text-sm text-muted">
              This posting didn&apos;t separate out any &ldquo;nice to have&rdquo; skills from its
              requirements.
            </p>
          )}
        </div>

        {(report.matchedRequired.some((s) => s.declared) ||
          report.matchedPreferred.some((s) => s.declared)) && (
          <p className="text-xs text-muted">
            * listed in your resume&apos;s skills section; the rest were mentioned elsewhere in
            the text.
          </p>
        )}

        <CheckList checks={report.checks} />
      </div>
    </Panel>
  );
}
