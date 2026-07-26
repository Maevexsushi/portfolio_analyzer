"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { EmptyNote, Panel, SubHeading } from "@/components/Panel";
import { CheckList } from "@/components/viz";
import { formatDateTime } from "@/lib/format";
import type { CoverLetterDraft, CoverLetterReport } from "@/lib/types";

/**
 * Cover letter: the letter the author already wrote (reviewed), and/or one drafted for
 * them. Both can be present at once — someone can paste their own letter for a check and
 * also ask for a draft to compare it against — so this shows whichever exist rather than
 * picking one.
 */

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
          setCopied(false);
        }
      }}
      className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold transition-colors hover:border-line-strong"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function draftToText(draft: CoverLetterDraft): string {
  return [draft.greeting, "", ...draft.paragraphs.flatMap((p) => [p, ""]), draft.closing]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function DraftSection({ draft, reportId }: { draft: CoverLetterDraft; reportId: string }) {
  const plainText = draftToText(draft);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <SubHeading>Drafted for you</SubHeading>
        <div className="flex shrink-0 items-center gap-2">
          <CopyButton text={plainText} label="Copy all" />
          <a
            href={`/api/cover-letter/${reportId}`}
            className="btn-brand rounded-lg px-2.5 py-1 text-xs font-semibold"
          >
            Download PDF
          </a>
        </div>
      </div>

      {draft.unverifiedSkills.length > 0 && (
        <div className="flex gap-3 rounded-lg border border-warn/40 bg-warn-soft p-4">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <div>
            <h3 className="font-bold">
              {draft.unverifiedSkills.length} skill
              {draft.unverifiedSkills.length === 1 ? "" : "s"} not evidenced in your resume
            </h3>
            <p className="mt-1 text-sm text-ink-soft">
              This checks named skills only, not every claim in the letter — confirm these are
              genuinely yours before sending it: {draft.unverifiedSkills.join(", ")}.
            </p>
          </div>
        </div>
      )}

      {draft.notes.length > 0 && (
        <div>
          <SubHeading>What it drew from</SubHeading>
          <ul className="space-y-1 text-sm text-ink-soft">
            {draft.notes.map((note) => (
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

      <div className="rounded-lg border border-line p-4 text-sm leading-relaxed whitespace-pre-line">
        {plainText}
      </div>

      <p className="border-t border-line pt-3 text-xs text-muted">
        Drafted by {draft.model} on {formatDateTime(draft.generatedAt)}. Read every line before
        you send it: it is your name on the letter.
      </p>
    </div>
  );
}

function ReviewSection({ report }: { report: CoverLetterReport }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SubHeading>Your letter, reviewed</SubHeading>
        <span className="text-sm font-bold text-ink-soft">{report.score}/100</span>
      </div>
      <CheckList checks={report.checks} />
    </div>
  );
}

export function CoverLetterPanel({
  report,
  draft,
  reportId,
}: {
  report: CoverLetterReport | null;
  draft: CoverLetterDraft | null;
  reportId: string;
}) {
  if (!report && !draft) {
    return (
      <Panel
        id="coverletter"
        title="Cover letter"
        description="Paste a cover letter you already wrote to have it reviewed, or ask for one to be drafted from your resume."
      >
        <EmptyNote>
          No cover letter on this report. Run this resume again from the{" "}
          <Link href="/job-match" className="font-semibold text-brand-ink hover:underline">
            Job match page
          </Link>{" "}
          and tick &ldquo;Draft a cover letter for me&rdquo;, or paste one you wrote, to see it
          here.
        </EmptyNote>
      </Panel>
    );
  }

  return (
    <Panel
      id="coverletter"
      title="Cover letter"
      score={report?.score ?? undefined}
      description="Length, greeting, filler phrases, and whether it actually names the role and company it claims to be for."
    >
      <div className="space-y-8">
        {draft && <DraftSection draft={draft} reportId={reportId} />}
        {draft && report && <div className="border-t border-line" />}
        {report && <ReviewSection report={report} />}
      </div>
    </Panel>
  );
}
