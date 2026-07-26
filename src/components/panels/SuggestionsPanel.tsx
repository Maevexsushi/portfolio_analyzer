import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { EmptyNote, Panel } from "@/components/Panel";
import { CATEGORY_LABELS } from "@/lib/analyzer";
import type { CategoryKey, Severity, Suggestion } from "@/lib/types";

const SEVERITY_STYLE: Record<
  Severity,
  { chip: string; mark: string; label: string; icon: typeof AlertOctagon }
> = {
  critical: {
    chip: "bg-bad-soft text-bad border-bad/40",
    mark: "var(--viz-bad)",
    label: "Critical",
    icon: AlertOctagon,
  },
  important: {
    chip: "bg-warn-soft text-warn border-warn/40",
    mark: "var(--viz-warn)",
    label: "Important",
    icon: AlertTriangle,
  },
  polish: {
    chip: "bg-surface-2 text-muted border-line",
    mark: "var(--color-line-strong)",
    label: "Polish",
    icon: Info,
  },
};

const ORDER: Severity[] = ["critical", "important", "polish"];

/**
 * Suggestions Generator output, grouped by severity so the fix list reads as a plan:
 * everything critical first, in descending order of estimated score recovered.
 */
export function SuggestionsPanel({ suggestions }: { suggestions: Suggestion[] }) {
  const grouped = ORDER.map((severity) => ({
    severity,
    items: suggestions.filter((suggestion) => suggestion.severity === severity),
  })).filter((group) => group.items.length > 0);

  const totalImpact = suggestions.reduce((sum, suggestion) => sum + suggestion.impact, 0);

  return (
    <Panel
      id="suggestions"
      title="What to fix"
      description={
        suggestions.length === 0
          ? "Nothing to fix — every check passed."
          : `${suggestions.length} recommendation${suggestions.length === 1 ? "" : "s"}, worth roughly ${totalImpact} points if you address them all.`
      }
    >
      {suggestions.length === 0 ? (
        <EmptyNote>
          No issues found. Re-run the analysis after any change to keep it that way.
        </EmptyNote>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => {
            const style = SEVERITY_STYLE[group.severity];
            const Icon = style.icon;
            return (
              <div key={group.severity}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <Icon size={16} style={{ color: style.mark }} aria-hidden />
                  {style.label}
                  <span className="text-muted tabular-nums">{group.items.length}</span>
                </h3>
                <ol className="space-y-2">
                  {group.items.map((suggestion) => (
                    <li
                      key={suggestion.id}
                      className="rounded-lg border border-line p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 font-bold">{suggestion.title}</p>
                        <span className="flex shrink-0 items-center gap-2 text-xs">
                          <span
                            className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${style.chip}`}
                          >
                            <Icon size={12} aria-hidden />
                            {style.label}
                          </span>
                          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-muted tabular-nums">
                            +{suggestion.impact} pts
                          </span>
                          <span className="text-muted">
                            {CATEGORY_LABELS[suggestion.category as CategoryKey] ?? "General"}
                          </span>
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-ink-soft">{suggestion.detail}</p>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
