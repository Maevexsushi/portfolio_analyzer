import { AlertCircle } from "lucide-react";
import { EmptyNote, Panel, SubHeading } from "@/components/Panel";
import { CheckList } from "@/components/viz";
import { formatBytes } from "@/lib/format";
import type {
  DeliverabilityReport,
  DocumentWorkReport,
  PresentationReport,
} from "@/lib/types";

/** Panels for an uploaded portfolio document — a deck, a lookbook, a case-study set. */

export function WorkPanel({
  report,
  workNoun,
}: {
  report: DocumentWorkReport;
  workNoun: { singular: string; plural: string };
}) {
  return (
    <Panel
      id="work"
      title="The work"
      score={report.score}
      description={
        report.count === 0
          ? `No distinct ${workNoun.plural} could be read out of this file.`
          : `${report.count} ${report.count === 1 ? workNoun.singular : workNoun.plural}, ${report.averageWords} words each on average, ${report.withOutcome} stating an outcome.`
      }
    >
      {report.works.length === 0 ? (
        <EmptyNote>
          Nothing could be identified as a separate piece. If each one is a titled page, the
          titles are not coming through as text — which means they are set as images, and are
          invisible to search.
        </EmptyNote>
      ) : (
        <ol className="mb-5 space-y-2">
          {report.works.map((work) => (
            <li key={`${work.page}-${work.title}`} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 font-medium">{work.title}</p>
                <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted tabular-nums">
                  page {work.page}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {work.wordCount} words · {work.imageCount} image{work.imageCount === 1 ? "" : "s"}
                {work.outcomeTerms.length > 0 && ` · mentions ${work.outcomeTerms.join(", ")}`}
              </p>
              {work.issues.length > 0 && (
                <p className="mt-1.5 text-sm text-ink-soft">Missing: {work.issues.join("; ")}.</p>
              )}
            </li>
          ))}
        </ol>
      )}

      <CheckList checks={report.checks} />
    </Panel>
  );
}

export function PresentationPanel({ report }: { report: PresentationReport }) {
  return (
    <Panel
      id="presentation"
      title="Presentation"
      score={report.score}
      description="How the document holds together as one object, and whether a reviewer will reach the end of it."
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Pages", value: report.pageCount === null ? "—" : String(report.pageCount) },
          { label: "Images / page", value: String(report.imagesPerPage) },
          { label: "Words / page", value: String(report.wordsPerPage) },
          { label: "Orientation", value: report.orientation },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-surface-2 px-3 py-3 text-center">
            <p className="text-xl font-semibold tabular-nums capitalize">{stat.value}</p>
            <p className="mt-0.5 text-xs tracking-wide text-muted uppercase">{stat.label}</p>
          </div>
        ))}
      </div>

      <CheckList checks={report.checks} />
    </Panel>
  );
}

export function DeliverabilityPanel({ report }: { report: DeliverabilityReport }) {
  const broken = report.links.filter((link) => link.checked && link.ok === false);

  return (
    <Panel
      id="deliverability"
      title="Deliverability"
      score={report.score}
      description={`${formatBytes(report.bytes)} · ${report.linkCount} link${report.linkCount === 1 ? "" : "s"}. Whether the file survives being sent and stays useful once it lands.`}
    >
      {!report.emailable && (
        <div className="mb-5 flex gap-2.5 rounded-lg bg-bad-soft px-4 py-3 text-sm">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <div>
            <p className="font-bold">Too large for most employer inboxes.</p>
            <p className="mt-1 text-ink-soft">
              At {formatBytes(report.bytes)} this is over the 10 MB most corporate mail servers
              accept. Rejections are usually silent — you would not be told it never arrived.
            </p>
          </div>
        </div>
      )}

      {broken.length > 0 && (
        <div className="mb-5">
          <SubHeading>Dead links inside the document</SubHeading>
          <ul className="space-y-1 text-sm">
            {broken.map((link) => (
              <li key={link.url} className="break-all text-ink-soft">
                <span className="text-bad">
                  {link.status ? `HTTP ${link.status}` : (link.error ?? "unreachable")}
                </span>{" "}
                — {link.url}
              </li>
            ))}
          </ul>
        </div>
      )}

      <CheckList checks={report.checks} />
    </Panel>
  );
}
