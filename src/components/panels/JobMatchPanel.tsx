import Link from "next/link";
import { Check, X } from "lucide-react";
import { EmptyNote, Panel, SubHeading } from "@/components/Panel";
import { CheckList } from "@/components/viz";
import type { JobMatchReport } from "@/lib/types";

/**
 * Job description match.
 *
 * Unscored against the overall report on purpose — see the type's own comment — so
 * this panel carries its own score, separate from the badge the tab strip would
 * otherwise infer from checks alone. The chips are the point: a percentage without the
 * actual missing skill names is a number you have to trust; the names are a number you
 * can act on.
 */
function SkillChips({ names, matched }: { names: string[]; matched: boolean }) {
  if (names.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <li
          key={name}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm ${
            matched
              ? "border-good/40 bg-good-soft text-ink"
              : "border-bad/40 bg-bad-soft text-bad"
          }`}
        >
          {matched ? (
            <Check size={13} strokeWidth={3} aria-hidden />
          ) : (
            <X size={13} strokeWidth={3} aria-hidden />
          )}
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
        {totalRequired > 0 && (
          <div>
            <SubHeading>
              Required skills ({report.matchedRequired.length}/{totalRequired})
            </SubHeading>
            <div className="space-y-2">
              <SkillChips names={report.matchedRequired} matched />
              <SkillChips names={report.missingRequired} matched={false} />
            </div>
          </div>
        )}

        {totalPreferred > 0 && (
          <div>
            <SubHeading>
              Preferred skills ({report.matchedPreferred.length}/{totalPreferred})
            </SubHeading>
            <div className="space-y-2">
              <SkillChips names={report.matchedPreferred} matched />
              <SkillChips names={report.missingPreferred} matched={false} />
            </div>
          </div>
        )}

        <CheckList checks={report.checks} />
      </div>
    </Panel>
  );
}
