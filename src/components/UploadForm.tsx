"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { AlertCircle, AlertTriangle, UploadCloud } from "lucide-react";
import { DISCIPLINE_LABELS } from "@/lib/discipline/labels";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import type { DisciplineKey } from "@/lib/types";

/**
 * File upload, for one declared kind of document.
 *
 * The kind is a prop rather than a control, because the tab the user picked already
 * answered it. Asking again inside the form would reopen a question they have settled
 * and imply the tool might overrule them.
 *
 * The field, by contrast, stays optional: nobody should have to classify their own
 * profession before a tool will look at their file, and detection is good enough that
 * the dropdown is a correction rather than a prerequisite.
 *
 * The OCR warning is shown before the upload, not after. An image is accepted because
 * refusing it would exclude people, but it is the worst thing to send an employer and
 * that is worth knowing while there is still time to export a PDF instead.
 */

const ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp";
const MAX_MB = 15;

type DocumentKind = "resume" | "document";

const COPY: Record<DocumentKind, { noun: string; cta: string; imageNote: string }> = {
  resume: {
    noun: "resume",
    cta: "Analyze my resume",
    imageNote:
      "A photo or screenshot of a resume is the weakest thing you can send an employer: applicant tracking systems store it as an empty record, so keyword searches never return it. It will be read here with OCR, but export a PDF for anything you actually submit.",
  },
  document: {
    noun: "portfolio file",
    cta: "Analyze my portfolio",
    imageNote:
      "A single image can only ever be one page of a portfolio, and nothing in it is searchable or clickable. It will be read here with OCR, but a PDF is what you should be sending.",
  },
};

/** However long the real work takes, the overlay stays up at least this long — a wait
 * that resolves in under a second reads as broken, not as fast. */
const MIN_LOADING_MS = 5000;

const LOADING_MESSAGES: Record<"resume" | "document" | "jobmatch", readonly string[]> = {
  resume: [
    "Reading your resume…",
    "Checking structure and formatting…",
    "Scoring experience and impact…",
    "Putting the report together…",
  ],
  document: [
    "Reading your file…",
    "Reviewing the work…",
    "Checking presentation and deliverability…",
    "Putting the report together…",
  ],
  jobmatch: [
    "Reading your resume…",
    "Matching required skills against the posting…",
    "Checking preferred skills…",
    "Reviewing your cover letter…",
  ],
};

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadForm({
  documentKind,
  jobMatchMode = false,
}: {
  documentKind: DocumentKind;
  /** Shows the job posting and cover letter fields instead of the resume-rewrite option. */
  jobMatchMode?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const copy = COPY[documentKind];
  // Both forms exist in the tab markup, so the file input needs a distinct id per kind.
  const inputId = `upload-${documentKind}`;

  const [file, setFile] = useState<File | null>(null);
  const [discipline, setDiscipline] = useState<string>("");
  const [ai, setAi] = useState(true);
  const [checkLinks, setCheckLinks] = useState(false);
  const [rewrite, setRewrite] = useState(documentKind === "resume" && !jobMatchMode);
  const [jobDescription, setJobDescription] = useState("");
  const [coverLetterText, setCoverLetterText] = useState("");
  const [coverLetterDraft, setCoverLetterDraft] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const isImage = file ? /\.(png|jpe?g|webp)$/i.test(file.name) : false;
  const tooBig = file ? file.size > MAX_MB * 1024 * 1024 : false;

  function choose(next: File | null) {
    setError(null);
    setSuggestion(null);
    setFile(next);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) choose(dropped);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || pending || tooBig) return;

    setError(null);
    setSuggestion(null);
    setPending(true);
    const startedAt = Date.now();

    try {
      const body = new FormData();
      body.set("file", file);
      // Always sent, never inferred: the tab already settled what this document is.
      body.set("documentKind", documentKind);
      if (discipline) body.set("discipline", discipline);
      // The "Your edge" AI review has no tab to appear in on the Job Match page, so
      // there is no reason to spend the model call generating it there.
      body.set("ai", String(ai && !jobMatchMode));
      body.set("checkLinks", String(checkLinks));
      body.set("rewrite", String(rewrite && documentKind === "resume" && !jobMatchMode));
      if (jobDescription.trim()) body.set("jobDescription", jobDescription.trim());
      if (coverLetterText.trim()) body.set("coverLetterText", coverLetterText.trim());
      body.set("coverLetterDraft", String(coverLetterDraft && documentKind === "resume"));
      if (jobMatchMode) body.set("focus", "jobmatch");

      const response = await fetch("/api/analyze/file", { method: "POST", body });
      const data = (await response.json()) as {
        result?: { id: string };
        error?: string;
        suggestion?: string | null;
      };

      if (!response.ok || !data.result) {
        setError(data.error ?? "That file could not be analyzed.");
        setSuggestion(data.suggestion ?? null);
        return;
      }

      // The overlay stays up at least MIN_LOADING_MS regardless of how fast the real
      // work finished — only on the success path, so an error never makes someone wait
      // out a countdown to see the thing that went wrong.
      const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

      router.push(`/r/${data.result.id}`);
    } catch {
      setError("Could not reach the analyzer. Is the server still running?");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <LoadingOverlay
        active={pending}
        messages={LOADING_MESSAGES[jobMatchMode ? "jobmatch" : documentKind]}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
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
          id={inputId}
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
            <label
              htmlFor={inputId}
              className="cursor-pointer font-bold text-brand-ink hover:underline"
            >
              Choose a file
            </label>
            <span className="text-ink-soft"> or drag it here</span>
            <p className="mt-2 text-sm text-muted">
              PDF, DOCX, PNG, JPG or WEBP · up to {MAX_MB} MB
            </p>
          </div>
        )}
      </div>

      {tooBig && (
        <div role="alert" className="mt-3 flex gap-2.5 rounded-lg bg-bad-soft px-4 py-3 text-sm">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <p>
            That file is {formatSize(file!.size)}, over the {MAX_MB} MB limit. Most employer mail
            servers cap attachments at 10 MB, so it is worth shrinking regardless.
          </p>
        </div>
      )}

      {isImage && !tooBig && (
        <div className="mt-3 flex gap-2.5 rounded-lg bg-warn-soft px-4 py-3 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p>{copy.imageNote}</p>
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

      {documentKind === "resume" && jobMatchMode && (
        <div className="mt-4">
          <label className="text-sm" htmlFor={`${inputId}-jd`}>
            <span className="mb-1 block font-semibold text-muted">
              Job posting <span className="font-normal">(optional)</span>
            </span>
          </label>
          <textarea
            id={`${inputId}-jd`}
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            disabled={pending}
            rows={4}
            placeholder="Paste the full job posting text here to check how your resume matches it — required and preferred skills, matched and missing."
            className="w-full rounded-lg border-2 border-transparent bg-surface-2 px-3 py-2.5 text-sm placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none"
          />
        </div>
      )}

      {documentKind === "resume" && jobMatchMode && (
        <div className="mt-4">
          <label className="text-sm" htmlFor={`${inputId}-cl`}>
            <span className="mb-1 block font-semibold text-muted">
              Cover letter <span className="font-normal">(optional)</span>
            </span>
          </label>
          <textarea
            id={`${inputId}-cl`}
            value={coverLetterText}
            onChange={(event) => setCoverLetterText(event.target.value)}
            disabled={pending}
            rows={4}
            placeholder="Paste a cover letter you already wrote to get it reviewed — length, greeting, clichés, and whether it names the role and company."
            className="w-full rounded-lg border-2 border-transparent bg-surface-2 px-3 py-2.5 text-sm placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none"
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={coverLetterDraft}
              onChange={(event) => setCoverLetterDraft(event.target.checked)}
              disabled={pending}
              className="h-4 w-4 rounded border-line-strong accent-brand"
            />
            Draft a cover letter for me instead
          </label>
          {coverLetterDraft && (
            <p className="mt-1 text-xs text-muted">
              Written only from what your resume actually says — pasting the job posting above
              lets it connect your real experience to this specific role.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {!jobMatchMode && (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={ai}
              onChange={(event) => setAi(event.target.checked)}
              disabled={pending}
              className="h-4 w-4 rounded border-line-strong accent-brand"
            />
            AI read of your work (sends the file&apos;s text to Groq)
          </label>
        )}
        {!jobMatchMode && (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={checkLinks}
              onChange={(event) => setCheckLinks(event.target.checked)}
              disabled={pending}
              className="h-4 w-4 rounded border-line-strong accent-brand"
            />
            Check the links inside it (slower)
          </label>
        )}

        {documentKind === "resume" && !jobMatchMode && (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={rewrite}
              onChange={(event) => setRewrite(event.target.checked)}
              disabled={pending || !ai}
              className="h-4 w-4 rounded border-line-strong accent-brand"
            />
            Draft an improved version
          </label>
        )}
      </div>

      {documentKind === "resume" && !jobMatchMode && rewrite && ai && (
        <p className="mt-2 text-xs text-muted">
          The draft rewrites what your resume already says and marks every missing fact as a gap
          for you to fill — it will not invent numbers. Unlike the file itself, the draft is
          stored with the report, and is deleted with it.
        </p>
      )}

      {documentKind === "resume" && !jobMatchMode && (
        <p className="mt-2 text-xs text-muted">
          Want to check this resume against a job posting, or get a cover letter reviewed or
          drafted?{" "}
          <Link href="/job-match" className="font-semibold text-brand-ink hover:underline">
            Use the Job Match page
          </Link>
          .
        </p>
      )}

      <button
        type="submit"
        disabled={!file || pending || tooBig}
        className="btn-brand mt-4 h-14 w-full rounded-lg px-7 font-bold disabled:cursor-not-allowed sm:w-auto"
      >
        {pending ? (isImage ? "Reading the image…" : "Analyzing…") : copy.cta}
      </button>

      <p className="mt-3 text-xs text-muted">
        Your {copy.noun} is never saved — it is read in memory and discarded. Only the report is
        stored.
      </p>

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
  );
}
