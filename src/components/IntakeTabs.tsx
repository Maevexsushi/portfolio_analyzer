"use client";

import { useState } from "react";
import { UploadForm } from "./UploadForm";
import { UrlForm } from "./UrlForm";

/**
 * The three ways in.
 *
 * A resume and a portfolio are different documents judged by almost disjoint sets of
 * checks — one is asked whether a parser can read it and whether the bullets carry
 * numbers, the other whether the work is explained and whether the file can be emailed.
 * Putting both behind a single "File" tab meant the tool had to guess which it was
 * holding, and a wrong guess produces a confidently wrong report: a photographer's deck
 * told to add quantified bullet points.
 *
 * So the choice moves to the person who already knows the answer. Each tab pins the
 * document kind, and nothing arriving through this page is classified by inference.
 * Detection still runs, but only to disagree out loud — see the mismatch warning in
 * `analyzeUpload`.
 */

type Tab = "url" | "resume" | "portfolio";

const TABS: {
  id: Tab;
  label: string;
  hint: string;
  documentKind?: "resume" | "document";
}[] = [
  {
    id: "url",
    label: "Website",
    hint: "yourname.dev, a Notion page, a Behance profile",
  },
  {
    id: "resume",
    label: "Resume",
    hint: "your CV as you send it — PDF, DOCX, or a photo of one",
    documentKind: "resume",
  },
  {
    id: "portfolio",
    label: "Portfolio file",
    hint: "the deck or PDF of your work — not your CV",
    documentKind: "document",
  },
];

export function IntakeTabs() {
  const [tab, setTab] = useState<Tab>("url");

  return (
    <div>
      <div role="tablist" aria-label="What to analyze" className="flex gap-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            type="button"
            aria-selected={tab === entry.id}
            aria-controls={`intake-${entry.id}`}
            id={`tab-${entry.id}`}
            onClick={() => setTab(entry.id)}
            className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === entry.id
                ? "border-brand text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="border-t border-line pt-5">
        {TABS.map((entry) => (
          <div
            key={entry.id}
            role="tabpanel"
            id={`intake-${entry.id}`}
            aria-labelledby={`tab-${entry.id}`}
            hidden={tab !== entry.id}
          >
            {tab === entry.id && (
              <>
                <p className="mb-3 text-sm text-muted">{entry.hint}</p>
                {entry.documentKind ? (
                  // Remounting per tab is deliberate: switching from Resume to
                  // Portfolio file should not carry the previously chosen file over
                  // into a form that will now score it against different checks.
                  <UploadForm key={entry.id} documentKind={entry.documentKind} />
                ) : (
                  <UrlForm autoFocus />
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
