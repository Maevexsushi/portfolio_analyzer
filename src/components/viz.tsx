import { AlertTriangle, Check, X } from "lucide-react";
import type { Check as CheckType, CheckStatus } from "@/lib/types";
import { BAND_LABEL, BAND_MARK, STATUS_LABEL, STATUS_MARK, bandFor } from "@/lib/format";

/** One icon per state, per the system's iconography — never color alone. */
const STATUS_ICON: Record<CheckStatus, typeof Check> = {
  pass: Check,
  warn: AlertTriangle,
  fail: X,
};

/**
 * Visualization primitives.
 *
 * Rules held constant across every mark here: marks are thin (≤10px meters, 2px
 * lines), fills use the mark palette while all text uses text tokens, and every mark
 * ships a visible value plus a text label — so nothing depends on colour alone. The
 * unfilled meter track is a lighter step of the fill's own colour via color-mix.
 */

export function Meter({
  label,
  value,
  caption,
  weight,
  size = "md",
}: {
  label: string;
  value: number;
  caption?: string;
  /** Rendered as "18% of score" when the meter is part of a weighted total. */
  weight?: number;
  size?: "sm" | "md";
}) {
  const band = bandFor(value);
  const fill = BAND_MARK[band];
  const height = size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={size === "sm" ? "text-sm text-ink-soft" : "font-medium"}>{label}</span>
        <span className="flex items-baseline gap-2">
          {weight !== undefined && (
            <span className="text-xs text-muted">{Math.round(weight * 100)}% of score</span>
          )}
          <span className="text-sm font-semibold tabular-nums">{value}</span>
        </span>
      </div>
      <div
        className={`mt-2 w-full overflow-hidden rounded-full ${height}`}
        style={{ backgroundColor: `color-mix(in oklab, ${fill} 16%, var(--color-surface))` }}
        role="img"
        aria-label={`${label}: ${value} out of 100 — ${BAND_LABEL[band]}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(1.5, Math.min(100, value))}%`, backgroundColor: fill }}
        />
      </div>
      {caption && <p className="mt-2 text-sm leading-relaxed text-muted">{caption}</p>}
    </div>
  );
}

/** Plain magnitude bar (single hue) for counts that carry no good/bad meaning. */
export function CountBar({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const width = max <= 0 ? 0 : (value / max) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm text-ink-soft" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(1.5, width)}%`, backgroundColor: "var(--viz-seq)" }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-ink-soft">
        {value.toLocaleString()}
        {suffix ? ` ${suffix}` : ""}
      </span>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: CheckStatus;
}) {
  return (
    /*
     * A tile is a hero number, not a chart, so it carries no plot and no hover layer.
     * The status rail on the left edge does the colour work: a full-height 3px bar
     * reads at a glance across a row of six far better than a 8px dot, and it never
     * competes with the figure for attention.
     */
    <div className="card relative overflow-hidden p-4 pl-4.5">
      {tone && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: STATUS_MARK[tone] }}
        />
      )}
      <div className="truncate text-sm text-muted">{label}</div>
      {/* Proportional figures: tabular-nums makes display-size numbers look loose. */}
      <div className="mt-1 truncate text-2xl font-semibold tracking-tight">{value}</div>
      {/* Hints carry emails and filenames, which are long and must not spill the tile. */}
      {hint && (
        <div className="mt-0.5 truncate text-xs text-muted" title={hint}>
          {hint}
        </div>
      )}
      {tone && <span className="sr-only">{STATUS_LABEL[tone]}</span>}
    </div>
  );
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white"
      style={{ backgroundColor: STATUS_MARK[status] }}
      title={STATUS_LABEL[status]}
    >
      <Icon aria-hidden size={12} strokeWidth={3} />
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function CheckList({ checks }: { checks: CheckType[] }) {
  if (checks.length === 0) {
    return <p className="text-sm text-muted">No checks ran for this section.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {checks.map((check) => (
        <li
          key={check.id}
          className="-mx-2 flex gap-3 rounded-lg px-2 py-3.5 transition-colors first:pt-0 last:pb-0 hover:bg-surface-2/60"
        >
          <StatusBadge status={check.status} />
          <div className="min-w-0">
            <p className="font-medium">{check.label}</p>
            <p className="mt-1 text-sm leading-relaxed break-words text-ink-soft">{check.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Score trend. One series, so no legend — the caption names it. Only the latest point
 * gets a direct label; the rest are in the history table.
 */
export function Sparkline({
  points,
  width = 260,
  height = 56,
}: {
  points: { analyzedAt: string; overallScore: number }[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const padding = { top: 8, right: 10, bottom: 8, left: 10 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Fixed 0-100 domain: an auto-scaled y-axis would exaggerate a two-point wobble.
  const x = (index: number) =>
    padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (score: number) => padding.top + (1 - score / 100) * plotHeight;

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.overallScore).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];
  const first = points[0];
  const delta = last.overallScore - first.overallScore;

  return (
    <div className="flex items-center gap-3">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Score trend across ${points.length} analyses: ${points
          .map((point) => point.overallScore)
          .join(", ")}`}
        className="shrink-0"
      >
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--viz-grid)"
          strokeWidth={1}
        />
        <path d={path} fill="none" stroke="var(--viz-seq)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* 2px surface ring keeps the end marker legible where it crosses the line. */}
        <circle
          cx={x(points.length - 1)}
          cy={y(last.overallScore)}
          r={4}
          fill="var(--viz-seq)"
          stroke="var(--color-surface)"
          strokeWidth={2}
        />
      </svg>
      <div className="text-sm">
        <div className="font-semibold tabular-nums">{last.overallScore}</div>
        <div className="text-muted">
          {delta === 0
            ? "no change"
            : `${delta > 0 ? "+" : ""}${delta} since first run`}
        </div>
      </div>
    </div>
  );
}
