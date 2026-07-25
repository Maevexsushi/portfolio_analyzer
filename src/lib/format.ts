import type { CheckStatus } from "./types";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(iso);
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Trim a URL to something that fits in a table cell without a tooltip. */
export function shortenUrl(url: string, max = 48): string {
  const display = url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  return display.length <= max ? display : `${display.slice(0, max - 1)}…`;
}

export type ScoreBand = "good" | "warn" | "bad";

/** One place decides which band a 0-100 score falls in, so colour never drifts. */
export function bandFor(score: number): ScoreBand {
  if (score >= 80) return "good";
  if (score >= 60) return "warn";
  return "bad";
}

export const BAND_MARK: Record<ScoreBand, string> = {
  good: "var(--viz-good)",
  warn: "var(--viz-warn)",
  bad: "var(--viz-bad)",
};

/** Text-safe equivalents of the mark colours (the mark palette is fill-only). */
export const BAND_TEXT: Record<ScoreBand, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
};

export const BAND_LABEL: Record<ScoreBand, string> = {
  good: "Strong",
  warn: "Needs work",
  bad: "Weak",
};

export const STATUS_MARK: Record<CheckStatus, string> = {
  pass: "var(--viz-good)",
  warn: "var(--viz-warn)",
  fail: "var(--viz-bad)",
};

/** Text label + glyph so a check's state never depends on colour alone. */
export const STATUS_GLYPH: Record<CheckStatus, string> = {
  pass: "✓",
  warn: "!",
  fail: "✕",
};

export const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail",
};
