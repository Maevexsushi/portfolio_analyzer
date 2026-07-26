import { BAND_MARK, bandFor } from "@/lib/format";

/**
 * Section shell for the results page. The `id` doubles as the scroll anchor used by
 * the sticky section nav, and the optional score renders as a small labelled chip so
 * each panel states its own contribution without repeating the full meter.
 */
export function Panel({
  id,
  title,
  description,
  score,
  actions,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  score?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            {score !== undefined && (
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: BAND_MARK[bandFor(score)] }}
              />
            )}
            {title}
            {score !== undefined && (
              <span
                className="rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums"
                style={{
                  backgroundColor: `color-mix(in oklab, ${BAND_MARK[bandFor(score)]} 12%, var(--color-surface))`,
                  color: "var(--color-ink-soft)",
                }}
              >
                {score}
                <span className="text-muted">/100</span>
              </span>
            )}
          </h2>
          {description && (
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {actions}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{children}</h3>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}
