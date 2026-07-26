"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

/**
 * Portfolio URL Analyzer input.
 *
 * An analysis takes a few seconds of real network work, so the wait gets narrated
 * rather than shown as a bare spinner. The staged labels are advisory — they describe
 * the pipeline's normal order, not observed progress, which is why the last one stays
 * up until the response lands.
 */

const STAGES = [
  "Fetching the page…",
  "Parsing the markup…",
  "Reading stylesheets and assets…",
  "Detecting sections, projects, and skills…",
  "Checking links and scoring…",
  "Reading your work for what stands out…",
];

export function UrlForm({
  autoFocus = false,
  initialUrl = "",
}: {
  autoFocus?: boolean;
  initialUrl?: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [checkLinks, setCheckLinks] = useState(true);
  const [ai, setAi] = useState(true);
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** A better URL the server worked out — offered as a one-click retry. */
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function run(target: string) {
    if (pending) return;

    setError(null);
    setSuggestion(null);
    setPending(true);
    setStage(0);

    timer.current = setInterval(() => {
      setStage((current) => Math.min(current + 1, STAGES.length - 1));
    }, 1400);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target, checkLinks, ai }),
      });
      const data = (await response.json()) as {
        result?: { id: string };
        error?: string;
        suggestion?: string | null;
      };

      if (!response.ok || !data.result) {
        setError(data.error ?? "That page could not be analyzed.");
        setSuggestion(data.suggestion ?? null);
        return;
      }
      router.push(`/r/${data.result.id}`);
    } catch {
      setError("Could not reach the analyzer. Is the server still running?");
    } finally {
      if (timer.current) clearInterval(timer.current);
      setPending(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void run(url);
  }

  function useSuggestion(target: string) {
    setUrl(target);
    void run(target);
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="portfolio-url" className="sr-only">
          Portfolio URL
        </label>
        {/*
          Flat inputs: gray-100 fill, no border, until focus swaps to a white fill with
          a hard 2px brand border — "no focus ring glow, just the hard border," per the
          system. h-14 matches the button beside it so the row reads as one control.
        */}
        <input
          id="portfolio-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoFocus={autoFocus}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="yourname.dev  ·  github.io/portfolio  ·  https://…"
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "url-error" : undefined}
          className="h-14 min-w-0 flex-1 rounded-lg border-2 border-transparent bg-surface-2 px-4 text-base placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending || url.trim().length === 0}
          className="btn-brand h-14 rounded-lg px-7 font-bold disabled:cursor-not-allowed"
        >
          {pending ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={checkLinks}
            onChange={(event) => setCheckLinks(event.target.checked)}
            disabled={pending}
            className="h-4 w-4 rounded border-line-strong accent-brand"
          />
          Check every outbound link (slower, but catches dead links)
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={ai}
            onChange={(event) => setAi(event.target.checked)}
            disabled={pending}
            className="h-4 w-4 rounded border-line-strong accent-brand"
          />
          AI read of your work (sends your page content to Groq)
        </label>

        {pending && (
          <p aria-live="polite" className="text-sm text-muted">
            {STAGES[stage]}
          </p>
        )}
      </div>

      {error && (
        <div
          id="url-error"
          role="alert"
          className="mt-3 flex gap-2.5 rounded-lg bg-bad-soft px-4 py-3 text-sm text-ink"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <div>
            <p>{error}</p>
            {suggestion && (
              <button
                type="button"
                onClick={() => useSuggestion(suggestion)}
                disabled={pending}
                className="btn-brand mt-2.5 rounded-lg px-3 py-1.5 font-semibold"
              >
                Analyze {suggestion} instead
              </button>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
