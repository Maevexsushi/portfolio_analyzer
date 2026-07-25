"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Deletes one stored analysis. Confirmation lives here so the row stays a server component. */
export function DeleteEntryButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setPending(true);
    try {
      await fetch(`/api/history/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-bad"
        aria-label={`Delete the analysis of ${label}`}
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1 text-sm">
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded-lg bg-bad px-2 py-1 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-lg px-2 py-1 text-muted hover:text-ink"
      >
        Cancel
      </button>
    </span>
  );
}

export function ClearHistoryButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function clear() {
    setPending(true);
    try {
      await fetch("/api/history", { method: "DELETE" });
      router.refresh();
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-line-strong"
      >
        Clear history
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="text-muted">Delete all {count}?</span>
      <button
        type="button"
        onClick={clear}
        disabled={pending}
        className="rounded-lg bg-bad px-3 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Clearing…" : "Yes, clear"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-lg px-2 py-2 text-muted hover:text-ink"
      >
        Cancel
      </button>
    </span>
  );
}
