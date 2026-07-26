import { Check, Minus } from "lucide-react";
import { Panel, SubHeading } from "@/components/Panel";
import { StatusBadge } from "@/components/viz";
import type { SectionsReport } from "@/lib/types";

/** Portfolio Sections Checker: expected sections first, then the bonus ones. */
export function SectionsPanel({ report }: { report: SectionsReport }) {
  const required = report.sections.filter((section) => section.required);
  const bonus = report.sections.filter((section) => !section.required);

  return (
    <Panel
      id="sections"
      title="Portfolio sections"
      description={`${report.requiredFound} of ${report.requiredTotal} expected sections found, plus ${report.bonusFound} bonus section${report.bonusFound === 1 ? "" : "s"}.`}
      score={report.score}
    >
      <SubHeading>Expected</SubHeading>
      <ul className="grid gap-2 sm:grid-cols-2">
        {required.map((section) => (
          <li
            key={section.id}
            className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/50 p-3"
          >
            <StatusBadge status={section.found ? "pass" : "fail"} />
            <div className="min-w-0">
              <p className="font-medium">{section.label}</p>
              <p className="mt-0.5 text-sm break-words text-muted">
                {section.found ? section.evidence.join(" · ") : "Not found"}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <SubHeading>Bonus</SubHeading>
        <ul className="flex flex-wrap gap-2">
          {bonus.map((section) => (
            <li
              key={section.id}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                section.found
                  ? "border-good/40 bg-good-soft text-ink"
                  : "border-line bg-surface-2 text-muted"
              }`}
              title={section.found ? section.evidence.join(" · ") : "Not found"}
            >
              {section.found ? (
                <Check size={14} strokeWidth={3} aria-hidden />
              ) : (
                <Minus size={14} strokeWidth={3} aria-hidden />
              )}
              {section.label}
              <span className="sr-only">{section.found ? " found" : " not found"}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
