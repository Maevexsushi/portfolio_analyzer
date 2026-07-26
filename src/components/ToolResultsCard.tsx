"use client";

import type { ReactNode } from "react";
import { LoadingOverlay } from "@/components/LoadingOverlay";

/**
 * The right-hand half of a split form/results layout: one shell for the three states
 * every one of these tools passes through — nothing submitted yet, waiting on the
 * server, or done. Keeping this in one place means the idle and loading treatment reads
 * identically across Rank Postings and the Company Brief, rather than each page
 * inventing its own placeholder copy and spacing. Job Match stays single-column: it
 * navigates to a dedicated report page on success, so a right-hand results card there
 * would never show anything but idle or loading.
 */
export function ToolResultsCard({
  pending,
  loadingMessages,
  hasContent,
  idleTitle,
  idleBody,
  children,
}: {
  pending: boolean;
  loadingMessages: readonly string[];
  hasContent: boolean;
  idleTitle: string;
  idleBody: string;
  children: ReactNode;
}) {
  return (
    <div className="card min-h-[20rem] p-5 sm:p-6">
      {pending ? (
        <LoadingOverlay active messages={loadingMessages} variant="contained" />
      ) : hasContent ? (
        children
      ) : (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="font-semibold text-ink-soft">{idleTitle}</p>
          <p className="max-w-xs text-sm text-muted">{idleBody}</p>
        </div>
      )}
    </div>
  );
}
