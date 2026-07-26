"use client";

import { useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Check, ChevronDown, UploadCloud, X } from "lucide-react";
import { DISCIPLINE_LABELS } from "@/lib/discipline/labels";
import { ToolResultsCard } from "@/components/ToolResultsCard";
import { CheckList } from "@/components/viz";
import type { JobMatchReport, JobMatchSkillEvidence } from "@/lib/types";

/**
 * One resume against several job postings, ranked by fit.
 *
 * Deliberately its own small form rather than a mode bolted onto UploadForm: the result
 * here is not a stored report to navigate to, it is a ranked list rendered on this same
 * page, so the submit behaviour (POST, render inline, no `router.push`) is different
 * enough from every other upload flow that sharing the component would mean branching
 * its core contract rather than its fields.
 *
 * Form and results sit in their own cards side by side rather than stacked, so the
 * reader keeps the form they just filled in — the file chosen, the postings pasted —
 * in view at the same time as what came back from it, instead of it scrolling out of
 * sight the moment results appear underneath.
 */

const ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp";
const MAX_MB = 15;
const MIN_LOADING_MS = 5000;

const LOADING_MESSAGES = [
  "Reading your resume…",
  "Fetching any posting links you gave…",
  "Matching skills against each one…",
  "Ranking by fit…",
] as const;

interface RankedPosting {
  index: number;
  jobTitle: string | null;
  sourceUrl: string | null;
  jobMatch: JobMatchReport;
}

interface FailedFetch {
  url: string;
  error: string;
}

interface RankResponse {
  discipline: { key: string; label: string };
  droppedCount: number;
  failed: FailedFetch[];
  postings: RankedPosting[];
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SkillChips({
  matched,
  missing,
}: {
  matched: JobMatchSkillEvidence[];
  missing: string[];
}) {
  if (matched.length === 0 && missing.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {matched.map((skill) => (
        <li
          key={`m-${skill.name}`}
          title={
            skill.declared
              ? `Listed in your skills section · mentioned ${skill.mentions} time${skill.mentions === 1 ? "" : "s"}`
              : `Mentioned ${skill.mentions} time${skill.mentions === 1 ? "" : "s"} in your resume`
          }
          className="flex items-center gap-1 rounded-full border border-good/40 bg-good-soft px-2 py-0.5 text-xs text-ink"
        >
          <Check size={11} strokeWidth={3} aria-hidden className="text-good" />
          {skill.name}
          {skill.declared && <span className="text-good">*</span>}
          <span className="text-muted">· {skill.mentions}×</span>
        </li>
      ))}
      {missing.map((name) => (
        <li
          key={`x-${name}`}
          className="flex items-center gap-1 rounded-full border border-bad/40 bg-bad-soft px-2 py-0.5 text-xs text-bad"
        >
          <X size={11} strokeWidth={3} aria-hidden />
          {name}
        </li>
      ))}
    </ul>
  );
}

function RankedRow({ posting, rank }: { posting: RankedPosting; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const { jobMatch } = posting;
  const totalRequired = jobMatch.matchedRequired.length + jobMatch.missingRequired.length;
  const totalPreferred = jobMatch.matchedPreferred.length + jobMatch.missingPreferred.length;
  const requiredPct = totalRequired > 0 ? Math.round((jobMatch.matchedRequired.length / totalRequired) * 100) : null;
  const preferredPct =
    totalPreferred > 0 ? Math.round((jobMatch.matchedPreferred.length / totalPreferred) * 100) : null;

  const coverageParts: string[] = [];
  if (requiredPct !== null) {
    coverageParts.push(`${requiredPct}% of required (${jobMatch.matchedRequired.length} of ${totalRequired})`);
  }
  if (preferredPct !== null) {
    coverageParts.push(`${preferredPct}% of preferred (${jobMatch.matchedPreferred.length} of ${totalPreferred})`);
  }

  return (
    <li className="rounded-lg border border-line overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-muted">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {posting.jobTitle ?? posting.sourceUrl ?? `Posting ${posting.index + 1}`}
          </p>
          <p className="truncate text-xs text-muted">
            {totalRequired > 0
              ? `${jobMatch.matchedRequired.length}/${totalRequired} required · ${jobMatch.matchedPreferred.length}/${totalPreferred} preferred`
              : "Nothing recognisable could be pulled from this posting"}
            {posting.jobTitle && posting.sourceUrl ? ` · fetched from ${posting.sourceUrl}` : ""}
          </p>
        </div>
        {jobMatch.score !== null ? (
          <span className="shrink-0 rounded-lg bg-surface-2 px-2.5 py-1 text-sm font-bold tabular-nums">
            {jobMatch.score}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted">no score</span>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
          {jobMatch.score !== null && (
            <p className="rounded-lg bg-surface-2/50 px-3 py-2 text-sm text-ink-soft">
              Required skills carry {Math.round(jobMatch.requiredWeight * 100)}% of this score,
              preferred the other {Math.round(jobMatch.preferredWeight * 100)}%.
              {coverageParts.length > 0 && ` You cover ${coverageParts.join(" and ")}.`}
            </p>
          )}
          {totalRequired > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                Required
              </p>
              <SkillChips matched={jobMatch.matchedRequired} missing={jobMatch.missingRequired} />
            </div>
          )}
          {totalPreferred > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                Preferred
              </p>
              <SkillChips matched={jobMatch.matchedPreferred} missing={jobMatch.missingPreferred} />
            </div>
          )}
          {(jobMatch.matchedRequired.some((s) => s.declared) ||
            jobMatch.matchedPreferred.some((s) => s.declared)) && (
            <p className="text-xs text-muted">
              * listed in your resume&apos;s skills section; the rest were mentioned elsewhere in
              the text.
            </p>
          )}
          <CheckList checks={jobMatch.checks} />
        </div>
      )}
    </li>
  );
}

export function RankPostingsForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [discipline, setDiscipline] = useState("");
  const [postingsText, setPostingsText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [result, setResult] = useState<RankResponse | null>(null);
  const [dragging, setDragging] = useState(false);

  const tooBig = file ? file.size > MAX_MB * 1024 * 1024 : false;

  function choose(next: File | null) {
    setError(null);
    setSuggestion(null);
    setFile(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || pending || tooBig || postingsText.trim().length === 0) return;

    setError(null);
    setSuggestion(null);
    setResult(null);
    setPending(true);
    const startedAt = Date.now();

    try {
      const body = new FormData();
      body.set("file", file);
      if (discipline) body.set("discipline", discipline);
      body.set("postings", postingsText.trim());

      const response = await fetch("/api/jobmatch/rank", { method: "POST", body });
      const data = (await response.json()) as RankResponse & {
        error?: string;
        suggestion?: string | null;
      };

      if (!response.ok || !data.postings) {
        setError(data.error ?? "That could not be ranked.");
        setSuggestion(data.suggestion ?? null);
        return;
      }

      const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

      setResult(data);
    } catch {
      setError("Could not reach the analyzer. Is the server still running?");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <form onSubmit={submit} className="card w-full p-5 sm:p-6">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) choose(dropped);
          }}
          className={`rounded-lg border-2 border-dashed px-4 py-10 text-center transition-all duration-200 ${
            dragging
              ? "scale-[1.01] border-brand bg-brand-soft"
              : "border-line-strong bg-surface-2 hover:border-brand/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            id="rank-file"
            disabled={pending}
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
          />
          {file ? (
            <div>
              <p className="font-bold break-all">{file.name}</p>
              <p className="mt-1 text-sm text-muted">{formatSize(file.size)}</p>
              <button
                type="button"
                onClick={() => {
                  choose(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                disabled={pending}
                className="mt-2 text-sm font-semibold text-brand-ink hover:underline"
              >
                Choose a different file
              </button>
            </div>
          ) : (
            <div>
              <UploadCloud size={28} className="mx-auto mb-2 text-muted" aria-hidden />
              <label htmlFor="rank-file" className="cursor-pointer font-bold text-brand-ink hover:underline">
                Choose your resume
              </label>
              <span className="text-ink-soft"> or drag it here</span>
              <p className="mt-2 text-sm text-muted">PDF, DOCX, PNG, JPG or WEBP · up to {MAX_MB} MB</p>
            </div>
          )}
        </div>

        {tooBig && (
          <div role="alert" className="mt-3 flex gap-2.5 rounded-lg bg-bad-soft px-4 py-3 text-sm">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden />
            <p>That file is {formatSize(file!.size)}, over the {MAX_MB} MB limit.</p>
          </div>
        )}

        <div className="mt-4 max-w-sm">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-muted">Your field</span>
            <select
              value={discipline}
              onChange={(event) => setDiscipline(event.target.value)}
              disabled={pending}
              className="w-full rounded-lg border-2 border-transparent bg-surface-2 px-3 py-2.5 focus:border-brand focus:bg-surface focus:outline-none"
            >
              <option value="">Detect automatically</option>
              {Object.entries(DISCIPLINE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <label className="text-sm" htmlFor="rank-postings">
            <span className="mb-1 block font-semibold text-muted">Job postings</span>
          </label>
          <textarea
            id="rank-postings"
            value={postingsText}
            onChange={(event) => setPostingsText(event.target.value)}
            disabled={pending}
            rows={10}
            placeholder={"Paste the full text of each posting, or just its link. Separate more than one with a line of dashes:\n\nhttps://acme.example/jobs/123\n\n---\n\nSecond posting, pasted in full..."}
            className="w-full rounded-lg border-2 border-transparent bg-surface-2 px-3 py-2.5 text-sm placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted">
            A line that is only a link (starting with http:// or https://) is fetched; anything
            else is used as pasted text. Up to 10 postings. Nothing here is saved.
          </p>
        </div>

        <button
          type="submit"
          disabled={!file || pending || tooBig || postingsText.trim().length === 0}
          className="btn-brand mt-4 h-14 w-full rounded-lg px-7 font-bold disabled:cursor-not-allowed"
        >
          {pending ? "Ranking…" : "Rank these postings"}
        </button>

        {error && (
          <div role="alert" className="mt-3 flex gap-2.5 rounded-lg bg-bad-soft px-4 py-3 text-sm">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden />
            <div>
              <p>{error}</p>
              {suggestion && <p className="mt-2 text-ink-soft">{suggestion}</p>}
            </div>
          </div>
        )}
      </form>

      <ToolResultsCard
        pending={pending}
        loadingMessages={LOADING_MESSAGES}
        hasContent={result !== null}
        idleTitle="Your ranked postings will appear here"
        idleBody="Choose a resume and paste in the postings you want ranked against it."
      >
        {result && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {result.postings.length} posting{result.postings.length === 1 ? "" : "s"}, ranked
              </h2>
              <span className="text-sm text-muted">Read as {result.discipline.label}</span>
            </div>
            {result.droppedCount > 0 && (
              <p className="mb-3 text-sm text-muted">
                Only the first 10 postings were ranked; {result.droppedCount} more were pasted in
                and dropped.
              </p>
            )}
            {result.failed.length > 0 && (
              <div className="mb-3 flex gap-2.5 rounded-lg bg-warn-soft px-4 py-3 text-sm">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                <div>
                  <p className="font-semibold">
                    {result.failed.length} link{result.failed.length === 1 ? "" : "s"} could not
                    be fetched, and {result.failed.length === 1 ? "it isn't" : "they aren't"}{" "}
                    included below:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-ink-soft">
                    {result.failed.map((f) => (
                      <li key={f.url}>
                        {f.url} — {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <ul className="space-y-2">
              {result.postings.map((posting, rank) => (
                <RankedRow key={posting.index} posting={posting} rank={rank + 1} />
              ))}
            </ul>
          </div>
        )}
      </ToolResultsCard>
    </div>
  );
}
