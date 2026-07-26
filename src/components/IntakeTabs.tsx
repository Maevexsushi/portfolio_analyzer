"use client";

import { useState } from "react";
import { UploadForm } from "./UploadForm";
import { UrlForm } from "./UrlForm";

/**
 * The two ways in.
 *
 * A portfolio is a website for some fields and a PDF for most others, and neither is
 * the fallback for the other — so both tabs are equal, with no "advanced" framing on
 * the upload. The order puts the URL first only because it is the cheaper thing to try.
 */

type Tab = "url" | "file";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "url", label: "A website", hint: "yourname.dev, a Notion page, a Behance profile" },
  { id: "file", label: "A file", hint: "resume or portfolio — PDF, DOCX, or an image" },
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
                {entry.id === "url" ? <UrlForm autoFocus /> : <UploadForm />}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
