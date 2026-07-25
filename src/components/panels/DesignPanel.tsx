import { Panel, SubHeading } from "@/components/Panel";
import { CheckList } from "@/components/viz";
import type { DesignReport } from "@/lib/types";

/** Design Review: the checks, plus the raw visual system we extracted from the CSS. */
export function DesignPanel({ report }: { report: DesignReport }) {
  const failing = report.checks.filter((check) => check.status !== "pass").length;

  return (
    <Panel
      id="design"
      title="Design & accessibility"
      description={
        failing === 0
          ? "Every design and accessibility check passed."
          : `${failing} of ${report.checks.length} checks need attention.`
      }
      score={report.score}
    >
      <CheckList checks={report.checks} />

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <SubHeading>Colours in the CSS</SubHeading>
          {report.palette.length === 0 ? (
            <p className="text-sm text-muted">No colours could be read.</p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {report.palette.map((color) => (
                  <li key={color} className="text-center">
                    <span
                      className="block h-9 w-9 rounded-md border border-line"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    <span className="mt-1 block font-mono text-[10px] text-muted">{color}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Most-used colours first, from the stylesheets we could read.
              </p>
            </>
          )}
        </div>

        <div>
          <SubHeading>Typefaces</SubHeading>
          {report.fonts.length === 0 ? (
            <p className="text-sm text-muted">No custom typefaces detected.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {report.fonts.map((font) => (
                <li
                  key={font}
                  className="rounded-md bg-surface-2 px-2 py-1 text-sm capitalize text-ink-soft"
                >
                  {font}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5">
            <SubHeading>Landmarks used</SubHeading>
            <p className="text-sm text-ink-soft">
              {report.semanticLandmarks.length === 0
                ? "None — the page is built from generic containers."
                : report.semanticLandmarks.map((tag) => `<${tag}>`).join("  ")}
            </p>
          </div>
        </div>
      </div>

      {report.headings.length > 0 && (
        <details className="mt-6 rounded-lg border border-line">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Heading outline ({report.headings.length})
          </summary>
          <ul className="border-t border-line px-4 py-3 text-sm">
            {report.headings.map((heading, index) => (
              <li
                key={`${heading.level}-${index}-${heading.text.slice(0, 20)}`}
                style={{ paddingLeft: `${(heading.level - 1) * 1.1}rem` }}
                className="py-0.5"
              >
                <span className="mr-2 font-mono text-xs text-muted">H{heading.level}</span>
                {heading.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
