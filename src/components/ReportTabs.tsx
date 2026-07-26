"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckStatus } from "@/lib/types";
import { STATUS_MARK } from "@/lib/format";

/**
 * The report, one feature per tab.
 *
 * A full report is seven to nine panels of dense findings. Stacked on one page it is a
 * two-metre scroll where the anchor nav is the only way to navigate and nothing tells
 * you where you are; the panel you want is always somewhere below the fold. Tabs make
 * each feature a place you can be, arrive at, and link to.
 *
 * Three things this has to get right to be better than the scroll it replaces:
 *
 * - **Deep links keep working.** The tab id is the URL hash, so `/r/abc#ats` opens on
 *   Machine readability, and switching tabs rewrites the hash without a navigation.
 *   Every anchor that used to scroll to a section still lands on it.
 * - **Printing shows everything.** A tab is a screen affordance. `@media print`
 *   reveals every panel and hides the strip, so the paper fallback is still complete.
 * - **The keyboard works properly.** Arrow keys move between tabs, Home/End jump to
 *   the ends, and only the active tab is in the page tab order — the ARIA pattern,
 *   not a row of buttons wearing tab roles.
 *
 * Each tab also carries the count of failing checks inside it, so the reader can see
 * where the problems are before opening anything.
 */

export interface ReportTab {
  id: string;
  label: string;
  /** Score out of 100, when the panel has one. */
  score?: number;
  /** Unresolved findings inside this panel, shown as a badge on the tab. */
  issues?: number;
  /** Worst status inside the panel, used to colour the badge. */
  tone?: CheckStatus;
  content: React.ReactNode;
}

export function ReportTabs({ tabs }: { tabs: ReportTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const stripRef = useRef<HTMLDivElement>(null);
  const ids = tabs.map((tab) => tab.id);

  // Open on the tab named by the hash, and follow later hash changes (back button,
  // or a link elsewhere on the page pointing at a section).
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (id && ids.includes(id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  const select = useCallback((id: string, focus = false) => {
    setActive(id);
    // replaceState, not a hash assignment: this should not add a history entry per
    // tab click, but the URL still has to be copyable and shareable.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
    if (focus) {
      requestAnimationFrame(() => {
        stripRef.current?.querySelector<HTMLButtonElement>(`#reporttab-${id}`)?.focus();
      });
    }
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    const index = ids.indexOf(active);
    if (index === -1) return;

    const move = (next: number) => {
      event.preventDefault();
      select(ids[(next + ids.length) % ids.length], true);
    };

    switch (event.key) {
      case "ArrowRight":
        return move(index + 1);
      case "ArrowLeft":
        return move(index - 1);
      case "Home":
        return move(0);
      case "End":
        return move(ids.length - 1);
    }
  }

  return (
    <div>
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Report sections"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="no-print sticky top-14 z-30 -mx-4 flex gap-1 overflow-x-auto border-b border-line bg-canvas/85 px-4 py-2 backdrop-blur-md"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`reporttab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`reportpanel-${tab.id}`}
              // Roving tabindex: the strip is one stop, arrows move within it.
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              className={`group flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                selected
                  ? "bg-surface text-ink shadow-[var(--shadow-sm)] ring-1 ring-line"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {tab.label}
              {tab.issues !== undefined && tab.issues > 0 && (
                <span
                  className="grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[11px] font-bold text-white tabular-nums"
                  style={{ backgroundColor: STATUS_MARK[tab.tone ?? "fail"] }}
                >
                  {tab.issues}
                  <span className="sr-only">
                    {" "}
                    issue{tab.issues === 1 ? "" : "s"} in this section
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`reportpanel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`reporttab-${tab.id}`}
            tabIndex={0}
            hidden={tab.id !== active}
            className="focus-visible:outline-none"
          >
            {/* Only visible on paper, where the tab strip is gone and each panel
                needs its own heading to be findable. */}
            <h2 className="print-heading mb-3 hidden text-lg font-semibold">{tab.label}</h2>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
