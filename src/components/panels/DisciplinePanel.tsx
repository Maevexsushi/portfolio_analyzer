import { Panel } from "@/components/Panel";
import type { DisciplineFinding, UploadInfo } from "@/lib/types";
import { formatBytes } from "@/lib/format";

/**
 * What the report assumed before it judged anything.
 *
 * Detection decides which checks apply, so getting it wrong invalidates a good part of
 * the report — and the reader is the only one who can tell. Showing the matched terms
 * turns "trust it or don't" into something they can actually check in two seconds.
 */
export function DisciplinePanel({
  discipline,
  upload,
  kindLabel,
}: {
  discipline: DisciplineFinding;
  upload?: UploadInfo;
  kindLabel: string;
}) {
  const unsure = !discipline.chosen && discipline.confidence < 55;

  return (
    <Panel
      id="basis"
      title="What this report assumed"
      description="These two choices decide which checks ran. If either is wrong, the findings below are aimed at the wrong target."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Field</p>
          <p className="mt-1 font-medium">{discipline.label}</p>
          <p className="mt-1 text-sm text-ink-soft">{discipline.blurb}</p>

          {discipline.chosen ? (
            <p className="mt-2 text-sm text-muted">You selected this.</p>
          ) : (
            <>
              <p className={`mt-2 text-sm ${unsure ? "text-warn" : "text-muted"}`}>
                Detected, {discipline.confidence}% confidence
                {unsure ? " — worth overriding if this is wrong" : ""}.
              </p>
              {discipline.evidence.length > 0 && (
                <p className="mt-1 text-sm text-muted">
                  Matched: {discipline.evidence.map((term) => `"${term}"`).join(", ")}.
                </p>
              )}
              {discipline.alternative && (
                <p className="mt-1 text-sm text-muted">
                  Runner-up was {discipline.alternative.label}.
                </p>
              )}
            </>
          )}
        </div>

        <div className="rounded-lg border border-line p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Read as</p>
          <p className="mt-1 font-medium">{kindLabel}</p>
          {upload && (
            <dl className="mt-2 space-y-1 text-sm text-ink-soft">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">File</dt>
                <dd className="truncate">{upload.fileName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Size</dt>
                <dd className="tabular-nums">{formatBytes(upload.bytes)}</dd>
              </div>
              {upload.pageCount !== null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Pages</dt>
                  <dd className="tabular-nums">{upload.pageCount}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Text</dt>
                <dd>
                  {upload.textOrigin === "embedded"
                    ? "read directly"
                    : `recognised by OCR (${upload.ocrConfidence}%)`}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </Panel>
  );
}
