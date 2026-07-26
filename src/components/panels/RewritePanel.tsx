"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { EmptyNote, Panel, SubHeading } from "@/components/Panel";
import { formatDateTime } from "@/lib/format";
import type { ResumeRewrite } from "@/lib/types";

/**
 * The improved draft.
 *
 * Presented as a diff rather than a finished document, and that is the whole design.
 * A polished replacement invites the author to send it unread; a before/after with a
 * reason attached to each line makes them the editor, which is the only safe
 * relationship to have with a machine rewriting claims about their own career.
 *
 * The placeholders come first, before the draft, because they are the work. Everything
 * below is done; the tokens are the part only the author can finish.
 */

/** Renders `[N staff]` tokens as something obviously unfinished. */
function WithPlaceholders({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]*\])/g).map((part, index) =>
        part.startsWith("[") && part.endsWith("]") ? (
          <mark
            key={index}
            className="rounded-md border border-warn/40 bg-warn-soft px-1 font-semibold text-warn"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard is permission-gated; the text is on screen to select by hand.
          setCopied(false);
        }
      }}
      className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold transition-colors hover:border-line-strong"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function RewritePanel({
  rewrite,
  reportId,
  plainText,
}: {
  rewrite: ResumeRewrite | null;
  reportId: string;
  plainText: string;
}) {
  if (!rewrite) {
    return (
      <Panel
        id="draft"
        title="Improved draft"
        description="An AI rewrite of your resume that fixes what it can and marks what it cannot."
      >
        <EmptyNote>
          No draft on this report. Tick &ldquo;Draft an improved version&rdquo; when you upload a
          resume, and one will be written alongside the analysis.
        </EmptyNote>
      </Panel>
    );
  }

  return (
    <Panel
      id="draft"
      title="Improved draft"
      description="Every line rewritten from what your resume already says. Nothing here is invented — where a fact was missing, you get a gap to fill rather than a number someone made up."
      actions={
        <div className="flex shrink-0 items-center gap-2">
          <CopyButton text={plainText} label="Copy all" />
          <a
            href={`/api/rewrite/${reportId}`}
            className="btn-brand rounded-lg px-2.5 py-1 text-xs font-semibold"
          >
            Download PDF
          </a>
        </div>
      }
    >
      <div className="space-y-7">
        {rewrite.placeholders.length > 0 && (
          <div className="flex gap-3 rounded-lg border border-warn/40 bg-warn-soft p-4">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            <div>
              <h3 className="font-bold">
                {rewrite.placeholders.length} thing
                {rewrite.placeholders.length === 1 ? "" : "s"} only you can fill in
              </h3>
              <p className="mt-1 text-sm text-ink-soft">
                These are the numbers the rewrite refused to guess. Go and find the real figures —
                this is the single highest-value edit on the whole document.
              </p>
              <dl className="mt-3 space-y-2">
                {rewrite.placeholders.map((placeholder) => (
                  <div key={placeholder.token} className="flex flex-wrap gap-x-2 text-sm">
                    <dt className="shrink-0 rounded-md border border-warn/40 bg-surface px-1.5 py-0.5 font-mono font-bold text-warn">
                      {placeholder.token}
                    </dt>
                    <dd className="min-w-0 flex-1 text-ink-soft">{placeholder.prompt}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {rewrite.stockPhrases.length > 0 && (
          <div className="flex gap-3 rounded-lg border border-bad/40 bg-bad-soft p-4">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-bad" aria-hidden />
            <div>
              <h3 className="font-bold">The draft slipped in filler of its own</h3>
              <p className="mt-1 text-sm text-ink-soft">
                These are the same stock phrases the Writing tab tells you to cut. The model
                reached for them anyway; rewrite those lines in your own words before you use them.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {rewrite.stockPhrases.map((phrase) => (
                  <li
                    key={phrase}
                    className="rounded-md border border-bad/40 bg-surface px-2 py-0.5 text-sm text-bad"
                  >
                    {phrase}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {rewrite.notes.length > 0 && (
          <div>
            <SubHeading>What changed</SubHeading>
            <ul className="space-y-1 text-sm text-ink-soft">
              {rewrite.notes.map((note) => (
                <li key={note} className="flex gap-2">
                  <span aria-hidden className="text-muted">
                    —
                  </span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <SubHeading>The draft</SubHeading>
          <div className="rounded-lg border border-line">
            <div className="border-b border-line bg-surface-2/50 px-4 py-3">
              <p className="font-semibold">{rewrite.headline}</p>
              <p className="text-sm text-muted">{rewrite.contactLine}</p>
            </div>

            <div className="divide-y divide-line">
              {rewrite.sections.map((section) => (
                <section key={section.heading} className="px-4 py-4">
                  <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
                    {section.heading}
                  </h3>

                  {section.body && (
                    <p className="mt-2 text-sm leading-relaxed">
                      <WithPlaceholders text={section.body} />
                    </p>
                  )}

                  {section.entries.map((entry, entryIndex) => (
                    <div key={`${entry.title}-${entryIndex}`} className="mt-4 first:mt-3">
                      <p className="font-medium">{entry.title}</p>
                      {entry.meta && <p className="text-sm text-muted">{entry.meta}</p>}

                      <ul className="mt-2 space-y-3">
                        {entry.bullets.map((bullet, bulletIndex) => (
                          <li key={bulletIndex} className="rounded-lg bg-surface-2/40 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 text-sm leading-relaxed">
                                <WithPlaceholders text={bullet.after} />
                              </p>
                              <CopyButton text={bullet.after} />
                            </div>

                            {bullet.before && bullet.before !== bullet.after && (
                              <p className="mt-2 text-xs text-muted line-through decoration-muted/50">
                                {bullet.before}
                              </p>
                            )}
                            <p className="mt-1.5 text-xs text-muted">
                              {bullet.why}
                              {bullet.redacted && (
                                <span className="text-warn">
                                  {" "}
                                  · a number here was not in your resume and was removed
                                </span>
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>

        <p className="border-t border-line pt-3 text-xs text-muted">
          Drafted by {rewrite.model} on {formatDateTime(rewrite.generatedAt)}. Read every line
          before you use it: it is your name on the document, and you will be asked about what is
          on it.
        </p>
      </div>
    </Panel>
  );
}
