"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import type { CompanyBrief } from "@/lib/types";

/**
 * Company research briefing.
 *
 * The form only ever takes URLs, never a company name — there is no search behind this,
 * so it has nothing to look up from a name alone. What it fetches is exactly what it
 * reads, and the result says exactly which pages that was.
 */

const MIN_LOADING_MS = 5000;
const LOADING_MESSAGES = [
  "Fetching the pages you gave…",
  "Reading what the company actually says about itself…",
  "Writing the briefing…",
] as const;

interface FailedFetch {
  url: string;
  error: string;
}

interface BriefResponse {
  brief: CompanyBrief;
  failed: FailedFetch[];
}

function HighlightList({ items }: { items: { title: string; evidence: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.title} className="rounded-lg border border-line p-3">
          <p className="font-semibold">{item.title}</p>
          <p className="mt-1 text-sm text-ink-soft">{item.evidence}</p>
        </li>
      ))}
    </ul>
  );
}

export function CompanyBriefForm() {
  const [urlsText, setUrlsText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BriefResponse | null>(null);

  const urls = urlsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || urls.length === 0) return;

    setError(null);
    setResult(null);
    setPending(true);
    const startedAt = Date.now();

    try {
      const response = await fetch("/api/company-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: urls.slice(0, 3) }),
      });
      const data = (await response.json()) as BriefResponse & { error?: string };

      if (!response.ok || !data.brief) {
        setError(data.error ?? "Could not build a briefing from those pages.");
        return;
      }

      const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

      setResult(data);
    } catch {
      setError("Could not reach the analyzer. Is the server still running?");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="w-full">
        <LoadingOverlay active={pending} messages={LOADING_MESSAGES} />

        <label className="text-sm" htmlFor="brief-urls">
          <span className="mb-1 block font-semibold text-muted">Company pages</span>
        </label>
        <textarea
          id="brief-urls"
          value={urlsText}
          onChange={(event) => setUrlsText(event.target.value)}
          disabled={pending}
          rows={4}
          placeholder={"One URL per line, up to 3:\n\nhttps://acme.com/about\nhttps://acme.com/careers"}
          className="w-full rounded-lg border-2 border-transparent bg-surface-2 px-3 py-2.5 text-sm placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none"
        />
        <p className="mt-1 text-xs text-muted">
          Its homepage, About, or Careers page work best. Nothing here is saved, and nothing
          beyond these pages is looked up — there is no search behind this.
        </p>

        <button
          type="submit"
          disabled={pending || urls.length === 0}
          className="btn-brand mt-4 h-14 w-full rounded-lg px-7 font-bold disabled:cursor-not-allowed sm:w-auto"
        >
          {pending ? "Reading…" : "Build a briefing"}
        </button>

        {error && (
          <div role="alert" className="mt-3 flex gap-2.5 rounded-lg bg-bad-soft px-4 py-3 text-sm">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden />
            <p>{error}</p>
          </div>
        )}
      </form>

      {result && (
        <div className="mt-8 space-y-6">
          {result.failed.length > 0 && (
            <div className="flex gap-2.5 rounded-lg bg-warn-soft px-4 py-3 text-sm">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
              <div>
                <p className="font-semibold">
                  {result.failed.length} page{result.failed.length === 1 ? "" : "s"} could not be
                  fetched, and the briefing below does not include them:
                </p>
                <ul className="mt-1 space-y-0.5 text-ink-soft">
                  {result.failed.map((f) => (
                    <li key={f.url}>
                      {f.url} — {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold">What they do</h2>
            <p className="mt-1 text-ink-soft">{result.brief.whatTheyDo}</p>
          </div>

          {result.brief.focusAreas.length > 0 && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">Focus areas</h2>
              <HighlightList items={result.brief.focusAreas} />
            </div>
          )}

          {result.brief.cultureSignals.length > 0 && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">What they say about how they work</h2>
              <HighlightList items={result.brief.cultureSignals} />
            </div>
          )}

          {result.brief.notes.length > 0 && (
            <ul className="space-y-1 text-sm text-muted">
              {result.brief.notes.map((note) => (
                <li key={note}>— {note}</li>
              ))}
            </ul>
          )}

          <p className="border-t border-line pt-3 text-xs text-muted">
            Built by {result.brief.model} from what these pages say about themselves, not an
            independent account of the company: {result.brief.sourceUrls.join(", ")}.
          </p>
        </div>
      )}
    </div>
  );
}
