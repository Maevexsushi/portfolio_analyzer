"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setError(null);
    setPending(true);
    setStage(0);

    timer.current = setInterval(() => {
      setStage((current) => Math.min(current + 1, STAGES.length - 1));
    }, 1400);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, checkLinks }),
      });
      const data = (await response.json()) as
        | { result: { id: string } }
        | { error: string };

      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "That page could not be analyzed.");
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

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="portfolio-url" className="sr-only">
          Portfolio URL
        </label>
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
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base placeholder:text-muted disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending || url.trim().length === 0}
          className="rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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

        {pending && (
          <p aria-live="polite" className="text-sm text-muted">
            {STAGES[stage]}
          </p>
        )}
      </div>

      {error && (
        <p
          id="url-error"
          role="alert"
          className="mt-3 rounded-xl border border-bad/40 bg-bad-soft px-4 py-3 text-sm text-ink"
        >
          {error}
        </p>
      )}
    </form>
  );
}
