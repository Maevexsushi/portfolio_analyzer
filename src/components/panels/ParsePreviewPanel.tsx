import { AlertTriangle } from "lucide-react";
import { Panel, SubHeading } from "@/components/Panel";
import type { ParsePreview, ParsePreviewEntry } from "@/lib/types";

/**
 * The ATS parse preview.
 *
 * Every other tab renders a check: pass, warn, fail. This renders the field itself —
 * the same fields a resume parser has to build one line at a time, with no markup to
 * lean on — so a failure that would otherwise surface as a silently empty field in a
 * real application shows up here first, while there is still time to fix it. Not a
 * claim to replicate any specific ATS product; the same class of heuristic, made
 * visible.
 */

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className={`mt-0.5 text-sm ${value ? "" : "font-medium text-bad"}`}>
        {value ?? "Not detected"}
      </dd>
    </div>
  );
}

function WorkEntry({ entry, index }: { entry: ParsePreviewEntry; index: number }) {
  const split = entry.title !== null || entry.company !== null;
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Role {index + 1}</p>
      {split ? (
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Title</dt>
            <dd className="text-sm font-medium">{entry.title ?? "Not detected"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Company</dt>
            <dd className="text-sm font-medium">{entry.company ?? "Not detected"}</dd>
          </div>
        </dl>
      ) : (
        <div className="mt-2 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p>
            Title and company could not be confidently separated — shown as extracted:{" "}
            <span className="font-medium">&ldquo;{entry.raw}&rdquo;</span>
          </p>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        {entry.dateRange ? `Dates: ${entry.dateRange}` : "No date range detected"} ·{" "}
        {entry.bulletCount} bullet{entry.bulletCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function ParsePreviewPanel({ report }: { report: ParsePreview }) {
  return (
    <Panel
      id="parsepreview"
      title="Parse preview"
      description="What this tool's own extraction saw in your resume, laid out as fields rather than folded into a score — the same class of heuristic an applicant tracking system runs, made visible."
    >
      <div className="space-y-6">
        <div>
          <SubHeading>Contact</SubHeading>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" value={report.name} />
            <Field label="Email" value={report.email} />
            <Field label="Phone" value={report.phone} />
            <Field label="Location" value={report.location} />
          </dl>
          {report.links.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {report.links.map((link) => (
                <li
                  key={link.url}
                  className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-sm"
                >
                  {link.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SubHeading>Work history</SubHeading>
          {report.workHistory.length > 0 ? (
            <div className="space-y-3">
              {report.workHistory.map((entry, index) => (
                <WorkEntry key={index} entry={entry} index={index} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No role lines were extracted.</p>
          )}
        </div>

        <div>
          <SubHeading>Education</SubHeading>
          {report.educationFound ? (
            report.educationLines.length > 0 ? (
              <ul className="space-y-1 text-sm text-ink-soft">
                {report.educationLines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                An Education heading was found, but no lines under it were extracted.
              </p>
            )
          ) : (
            <p className="text-sm font-medium text-bad">No Education section was detected.</p>
          )}
          <p className="mt-1 text-xs text-muted">
            Shown verbatim — degree, school, and year are not parsed out individually.
          </p>
        </div>

        <div>
          <SubHeading>
            Skills declared ({report.skillsDeclared.length} of {report.skillsTotal} detected)
          </SubHeading>
          {report.skillsDeclared.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {report.skillsDeclared.map((name) => (
                <li
                  key={name}
                  className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-sm"
                >
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              No skills were found inside a dedicated skills section — the rest of the total
              above was inferred from prose elsewhere in the resume.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
