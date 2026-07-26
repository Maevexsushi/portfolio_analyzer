import { EmptyNote, Panel, SubHeading } from "@/components/Panel";
import { CheckList } from "@/components/viz";
import type {
  AtsReport,
  ContactReport,
  ExperienceReport,
  LanguageReport,
  ResumeStructureReport,
} from "@/lib/types";

/**
 * Resume report panels.
 *
 * Each one leads with the evidence and puts the checks under it, in the same order the
 * suggestions list will bring them back up. The one that gets the most room is
 * experience, because quantification is where nearly every resume loses, and the
 * before/after is only persuasive when you can see your own bullets quoted.
 */

export function ContactPanel({ report }: { report: ContactReport }) {
  const rows: [string, string | null][] = [
    ["Name", report.name],
    ["Email", report.email],
    ["Phone", report.phone],
    ["Location", report.location],
  ];

  return (
    <Panel
      id="contact"
      title="Contact & reachability"
      score={report.score}
      description="What a recruiter can extract from the text layer — not what a human eye can find on the page."
    >
      <dl className="mb-5 grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface-2 px-3 py-2">
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
            <dd className={`mt-0.5 text-sm ${value ? "" : "text-muted italic"}`}>
              {value ?? "not found"}
            </dd>
          </div>
        ))}
      </dl>

      {report.links.length > 0 && (
        <div className="mb-5">
          <SubHeading>Links found</SubHeading>
          <ul className="space-y-1 text-sm">
            {report.links.map((link) => (
              <li key={link.url} className="flex flex-wrap items-baseline gap-2">
                <span className="text-muted">{link.label}</span>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-brand-ink hover:underline"
                >
                  {link.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CheckList checks={report.checks} />
    </Panel>
  );
}

export function StructurePanel({ report }: { report: ResumeStructureReport }) {
  return (
    <Panel
      id="structure"
      title="Structure"
      score={report.score}
      description={`${report.requiredFound} of ${report.requiredTotal} expected sections found.`}
    >
      <ul className="mb-5 grid gap-2 sm:grid-cols-2">
        {report.sections.map((section) => (
          <li
            key={section.id}
            className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm"
          >
            <span
              aria-hidden
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: section.found
                  ? "var(--viz-good)"
                  : section.required
                    ? "var(--viz-bad)"
                    : "var(--color-line-strong)",
              }}
            />
            <span className="min-w-0">
              <span className="font-medium">{section.label}</span>
              {!section.required && <span className="text-muted"> · optional</span>}
              <span className="block truncate text-muted">
                {section.evidence ? `“${section.evidence}”` : "not found"}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <CheckList checks={report.checks} />
    </Panel>
  );
}

export function ExperiencePanel({ report }: { report: ExperienceReport }) {
  const percent = Math.round(report.quantificationRate * 100);

  return (
    <Panel
      id="experience"
      title="Experience & impact"
      score={report.score}
      description="Whether your bullets describe what you did and what it was worth, or what you were assigned."
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Roles", value: String(report.entries.length) },
          { label: "Bullets", value: String(report.totalBullets) },
          { label: "Carry a number", value: `${percent}%` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-surface-2 px-3 py-3 text-center">
            <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
            <p className="mt-0.5 text-xs tracking-wide text-muted uppercase">{stat.label}</p>
          </div>
        ))}
      </div>

      {report.entries.length === 0 ? (
        <EmptyNote>
          No role entries could be separated out of the text. That is usually a layout problem
          rather than a content one — see the machine readability panel.
        </EmptyNote>
      ) : (
        <div className="mb-5">
          <SubHeading>Role by role</SubHeading>
          <ol className="space-y-2">
            {report.entries.map((entry, index) => (
              <li key={`${entry.title}-${index}`} className="rounded-lg border border-line p-4">
                <p className="font-medium">{entry.title}</p>
                <p className="mt-1 text-sm text-muted">
                  {entry.bulletCount} bullet{entry.bulletCount === 1 ? "" : "s"} ·{" "}
                  {entry.quantifiedBullets} with numbers · {entry.actionVerbBullets} opening with an
                  action
                </p>
                {entry.weakBullets.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {entry.weakBullets.map((bullet) => (
                      <li key={bullet} className="text-sm text-ink-soft">
                        <span className="text-warn">Rewrite:</span> “{bullet}”
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <CheckList checks={report.checks} />
    </Panel>
  );
}

export function AtsPanel({ report }: { report: AtsReport }) {
  return (
    <Panel
      id="ats"
      title="Machine readability"
      score={report.score}
      description="What an applicant tracking system stores when your file arrives. You cannot see this yourself, and it decides whether anyone ever reads the rest."
    >
      {!report.machineReadable && (
        <div className="mb-5 rounded-xl border border-bad/40 bg-bad-soft px-4 py-3 text-sm">
          <p className="font-medium">This file has no machine-readable text.</p>
          <p className="mt-1 text-ink-soft">
            Every applicant tracking system will store it as an empty record. No keyword search
            will return it, and in most cases no human will see it either. Nothing else in this
            report matters until that is fixed.
          </p>
        </div>
      )}

      {report.standardHeadings.length > 0 && (
        <div className="mb-4">
          <SubHeading>Headings a parser recognises</SubHeading>
          <ul className="flex flex-wrap gap-1.5">
            {report.standardHeadings.map((heading) => (
              <li
                key={heading}
                className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-sm"
              >
                {heading}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.nonStandardHeadings.length > 0 && (
        <div className="mb-5">
          <SubHeading>Headings it will not map</SubHeading>
          <ul className="flex flex-wrap gap-1.5">
            {report.nonStandardHeadings.slice(0, 12).map((heading) => (
              <li
                key={heading}
                className="rounded-md border border-warn/40 bg-warn-soft px-2 py-0.5 text-sm"
              >
                {heading}
              </li>
            ))}
          </ul>
        </div>
      )}

      <CheckList checks={report.checks} />
    </Panel>
  );
}

export function LanguagePanel({ report }: { report: LanguageReport }) {
  return (
    <Panel
      id="language"
      title="Writing"
      score={report.score}
      description={`${report.wordCount} words. Only what can be counted honestly — the editorial read handles the rest.`}
    >
      {(report.clicheHits.length > 0 || report.passiveHits.length > 0) && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          {report.clicheHits.length > 0 && (
            <div>
              <SubHeading>Stock phrases</SubHeading>
              <ul className="flex flex-wrap gap-1.5">
                {report.clicheHits.map((hit) => (
                  <li
                    key={hit}
                    className="rounded-md border border-warn/40 bg-warn-soft px-2 py-0.5 text-sm"
                  >
                    {hit}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.passiveHits.length > 0 && (
            <div>
              <SubHeading>Passive constructions</SubHeading>
              <ul className="flex flex-wrap gap-1.5">
                {report.passiveHits.map((hit) => (
                  <li
                    key={hit}
                    className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-sm"
                  >
                    {hit}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <CheckList checks={report.checks} />
    </Panel>
  );
}
