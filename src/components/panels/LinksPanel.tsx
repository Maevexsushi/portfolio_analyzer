import { Panel, SubHeading } from "@/components/Panel";
import { CheckList, StatusBadge } from "@/components/viz";
import { shortenUrl } from "@/lib/format";
import type { LinkFinding, LinksReport } from "@/lib/types";

const KIND_LABELS: Record<LinkFinding["kind"], string> = {
  social: "Social",
  repo: "Repository",
  email: "Email",
  phone: "Phone",
  resume: "Resume",
  internal: "Internal",
  anchor: "Anchor",
  external: "External",
};

/** Link Checker: essentials first, then broken links, then the full probed table. */
export function LinksPanel({ report }: { report: LinksReport }) {
  const probed = report.links.filter((link) => link.checked);

  return (
    <Panel
      id="links"
      title="Links & contact"
      description={`${report.total} links found; ${report.checkedCount} probed; ${report.brokenCount} broken${
        report.unverifiedCount > 0 ? `; ${report.unverifiedCount} unverifiable` : ""
      }.`}
      score={report.score}
    >
      <SubHeading>Essential links</SubHeading>
      <ul className="grid gap-2 sm:grid-cols-2">
        {report.essentials.map((essential) => (
          <li
            key={essential.id}
            className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/50 p-3"
          >
            <StatusBadge status={essential.status} />
            <div className="min-w-0">
              <p className="font-medium">{essential.label}</p>
              <p className="mt-0.5 text-sm break-words text-muted">
                {essential.note ??
                  (essential.url ? shortenUrl(essential.url, 40) : "Not found")}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <CheckList checks={report.checks} />
      </div>

      {report.broken.length > 0 && (
        <div className="mt-6">
          <SubHeading>Broken links</SubHeading>
          <ul className="space-y-2">
            {report.broken.map((link) => (
              <li
                key={link.url}
                className="flex items-start gap-2.5 rounded-lg border border-bad/40 bg-bad-soft p-3"
              >
                <StatusBadge status="fail" />
                <div className="min-w-0">
                  <p className="text-sm break-all">{link.url}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {link.status ? `HTTP ${link.status}` : (link.error ?? "Unreachable")}
                    {link.text ? ` · linked as “${link.text}”` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.unverified.length > 0 && (
        <div className="mt-6">
          <SubHeading>Could not be verified</SubHeading>
          <p className="mb-2 text-sm text-muted">
            These hosts answered but refused an automated request, which is common for
            Medium, LinkedIn, and anything behind a bot filter. They are not counted as
            broken — open them yourself to confirm.
          </p>
          <ul className="space-y-2">
            {report.unverified.map((link) => (
              <li
                key={link.url}
                className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/50 p-3"
              >
                <StatusBadge status="warn" />
                <div className="min-w-0">
                  <p className="text-sm break-all">{link.url}</p>
                  <p className="mt-0.5 text-sm text-muted">HTTP {link.status}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {probed.length > 0 && (
        <details className="mt-6 rounded-lg border border-line">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            All {probed.length} probed links
          </summary>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    URL
                  </th>
                </tr>
              </thead>
              <tbody>
                {probed.map((link) => (
                  <tr key={link.url} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">
                      {link.blocked ? "Blocked" : link.ok ? "OK" : "Failed"}
                      {link.status ? ` · ${link.status}` : ""}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-muted">
                      {link.platform ?? KIND_LABELS[link.kind]}
                    </td>
                    <td className="max-w-md truncate px-4 py-2">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        title={link.url}
                      >
                        {shortenUrl(link.url, 60)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Panel>
  );
}
