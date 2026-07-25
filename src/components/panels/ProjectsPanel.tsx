import { EmptyNote, Panel, SubHeading } from "@/components/Panel";
import { CheckList, Meter } from "@/components/viz";
import { shortenUrl } from "@/lib/format";
import type { ProjectsReport } from "@/lib/types";

/** Project Analyzer: per-project depth, since averages hide the weak entry. */
export function ProjectsPanel({ report }: { report: ProjectsReport }) {
  return (
    <Panel
      id="projects"
      title="Projects"
      description={
        report.count === 0
          ? "No projects detected on this page."
          : `${report.count} project${report.count === 1 ? "" : "s"} detected, average depth ${report.averageQuality}/100.`
      }
      score={report.score}
    >
      <CheckList checks={report.checks} />

      <div className="mt-6">
        <SubHeading>Project by project</SubHeading>
        {report.projects.length === 0 ? (
          <EmptyNote>
            Nothing matched a project card. If your projects are rendered by JavaScript after
            load, a static analyzer cannot see them — consider server-rendering them so search
            engines and reviewers&apos; link previews can too.
          </EmptyNote>
        ) : (
          <ul className="space-y-3">
            {report.projects.map((project, index) => (
              <li key={`${project.title}-${index}`} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="min-w-0 font-medium break-words">{project.title}</p>
                  <div className="w-40 shrink-0">
                    <Meter label="Depth" value={project.quality} size="sm" />
                  </div>
                </div>

                {project.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{project.description}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <span className="text-muted tabular-nums">{project.descriptionWords} words</span>
                  {project.liveUrl ? (
                    <a
                      href={project.liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-ink underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
                    >
                      Live: {shortenUrl(project.liveUrl, 32)}
                    </a>
                  ) : (
                    <span className="text-muted">No live demo</span>
                  )}
                  {project.repoUrl ? (
                    <a
                      href={project.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-ink underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
                    >
                      Code: {shortenUrl(project.repoUrl, 32)}
                    </a>
                  ) : (
                    <span className="text-muted">No repo</span>
                  )}
                  <span className="text-muted tabular-nums">
                    {project.imageCount} image{project.imageCount === 1 ? "" : "s"}
                  </span>
                </div>

                {project.techTags.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {project.techTags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-soft"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}

                {project.issues.length > 0 && (
                  <p className="mt-3 text-sm text-warn">Missing: {project.issues.join("; ")}.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
