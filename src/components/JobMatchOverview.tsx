import type { ResumeResult } from "@/lib/types";
import { BAND_MARK, bandFor, formatDateTime, formatMs } from "@/lib/format";
import { StatTile } from "./viz";

/**
 * The hero for a Job Match report — the counterpart to ScoreOverview, for the one case
 * where showing the full resume-quality breakdown would answer a question nobody asked.
 * Someone who came from the Job Match page wants one thing: does this resume fit this
 * posting, and is the cover letter ready. The overall resume score, the writing tab, the
 * ATS breakdown — all real, all just not what this run was for.
 */
export function JobMatchOverview({ result }: { result: ResumeResult }) {
  const { jobMatch, coverLetter, coverLetterDraft } = result;
  const score = jobMatch?.score ?? null;
  const band = score !== null ? bandFor(score) : null;

  const totalRequired = jobMatch
    ? jobMatch.matchedRequired.length + jobMatch.missingRequired.length
    : 0;

  return (
    <section id="score" className="scroll-mt-20">
      <div
        className="card overflow-hidden p-5 sm:p-7"
        style={band ? { backgroundColor: `var(--color-${band}-soft)` } : undefined}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wider text-muted uppercase">Job match score</p>

            {score !== null ? (
              <div className="mt-1.5 flex items-end gap-3">
                <span className="text-7xl leading-[0.85] font-extrabold tracking-[-0.04em]">
                  {score}
                </span>
                <span className="pb-1 text-lg text-muted">/ 100</span>
              </div>
            ) : (
              <p className="mt-2 text-lg leading-relaxed text-ink-soft">
                No job posting was pasted in with this resume, so there is nothing to score it
                against.
              </p>
            )}

            {jobMatch?.jobTitle && (
              <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
                Matched against: &ldquo;{jobMatch.jobTitle}&rdquo;.
              </p>
            )}

            {score !== null && (
              <div
                className="mt-5 h-2.5 w-full max-w-md overflow-hidden rounded-full"
                style={{
                  backgroundColor: `color-mix(in oklab, ${BAND_MARK[band!]} 16%, var(--color-surface))`,
                }}
                role="img"
                aria-label={`Job match score ${score} out of 100`}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(1.5, score)}%`, backgroundColor: BAND_MARK[band!] }}
                />
              </div>
            )}
          </div>

          <dl className="shrink-0 space-y-1.5 text-sm sm:text-right">
            <div>
              <dt className="inline text-muted">Analyzed </dt>
              <dd className="inline">{formatDateTime(result.analyzedAt)}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Took </dt>
              <dd className="inline tabular-nums">{formatMs(result.durationMs)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Required skills"
          value={totalRequired > 0 ? `${jobMatch!.matchedRequired.length}/${totalRequired}` : "—"}
          hint={
            totalRequired > 0
              ? jobMatch!.missingRequired.length > 0
                ? `missing ${jobMatch!.missingRequired.length}`
                : "all covered"
              : "no posting to match"
          }
          tone={
            totalRequired === 0
              ? "warn"
              : jobMatch!.missingRequired.length === 0
                ? "pass"
                : jobMatch!.missingRequired.length <= 2
                  ? "warn"
                  : "fail"
          }
        />
        <StatTile
          label="Cover letter"
          value={coverLetter ? `${coverLetter.score}/100` : coverLetterDraft ? "Drafted" : "None"}
          hint={coverLetter ? "your own letter, reviewed" : coverLetterDraft ? "written for you" : "not provided"}
          tone={coverLetter ? (coverLetter.score >= 70 ? "pass" : "warn") : coverLetterDraft ? "pass" : "warn"}
        />
        <StatTile
          label="Unverified skills"
          value={coverLetterDraft ? coverLetterDraft.unverifiedSkills.length : "—"}
          hint={coverLetterDraft ? "in the drafted letter" : "no draft was requested"}
          tone={
            !coverLetterDraft
              ? "warn"
              : coverLetterDraft.unverifiedSkills.length === 0
                ? "pass"
                : "warn"
          }
        />
      </div>
    </section>
  );
}
