"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Re-runs the analysis for the same URL and jumps to the new report. */
export function ReanalyzeButton({ url }: { url: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as { result?: { id: string }; error?: string };
      if (!response.ok || !data.result) {
        setError(data.error ?? "Re-analysis failed.");
        return;
      }
      router.push(`/r/${data.result.id}`);
    } catch {
      setError("Could not reach the analyzer.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium transition-colors hover:border-line-strong disabled:opacity-60"
      >
        {pending ? "Re-analyzing…" : "Re-analyze"}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}
