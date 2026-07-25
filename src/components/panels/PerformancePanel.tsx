import { Panel, SubHeading } from "@/components/Panel";
import { CheckList, CountBar, StatTile } from "@/components/viz";
import { formatBytes, formatMs } from "@/lib/format";
import type { PerformanceReport } from "@/lib/types";

/**
 * Performance Report. Everything shown here was measured from response headers and
 * transfer sizes — there is no browser in the loop, so no paint metrics are claimed.
 */
export function PerformancePanel({ report }: { report: PerformanceReport }) {
  const maxCount = Math.max(1, ...report.resources.map((group) => group.count));

  return (
    <Panel
      id="performance"
      title="Performance"
      description={`${formatMs(report.ttfbMs)} to first byte · ${report.requestCount} requests referenced · ${formatBytes(report.htmlBytes)} of HTML.`}
      score={report.score}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Time to first byte" value={formatMs(report.ttfbMs)} />
        <StatTile label="HTML size" value={formatBytes(report.htmlBytes)} />
        <StatTile
          label="Compression"
          value={report.compression ?? "none"}
          tone={report.compression ? "pass" : "fail"}
        />
        <StatTile
          label="Render-blocking"
          value={report.renderBlockingScripts + report.renderBlockingStyles}
          hint={`${report.renderBlockingScripts} js · ${report.renderBlockingStyles} css`}
          tone={report.renderBlockingScripts === 0 ? "pass" : "warn"}
        />
      </div>

      <div className="mt-6">
        <CheckList checks={report.checks} />
      </div>

      {report.resources.length > 0 && (
        <div className="mt-6">
          <SubHeading>Requests by type</SubHeading>
          <div className="space-y-2">
            {report.resources.map((group) => (
              <CountBar
                key={group.type}
                label={group.type}
                value={group.count}
                max={maxCount}
                suffix={group.thirdParty > 0 ? `(${group.thirdParty} 3rd-party)` : ""}
              />
            ))}
          </div>
        </div>
      )}

      <dl className="mt-6 grid gap-x-6 gap-y-2 border-t border-line pt-5 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Server</dt>
          <dd className="truncate">{report.server ?? "not disclosed"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Cache-Control</dt>
          <dd className="truncate">{report.cacheControl ?? "none"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Inline CSS + JS</dt>
          <dd className="tabular-nums">
            {formatBytes(report.inlineStyleBytes + report.inlineScriptBytes)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Images</dt>
          <dd className="tabular-nums">
            {report.imagesTotal} total · {report.imagesLazy} lazy ·{" "}
            {report.imagesMissingDimensions} without dimensions
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
