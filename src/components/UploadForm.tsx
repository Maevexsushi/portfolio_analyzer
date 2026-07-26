"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DISCIPLINE_LABELS } from "@/lib/discipline/labels";
import type { DisciplineKey } from "@/lib/types";

/**
 * File upload.
 *
 * Two things here are deliberate. The document kind and the field are both offered up
 * front as "auto", not as a required choice — asking someone to classify their own
 * document before the tool has looked at it is friction for the majority whose file is
 * exactly what it appears to be. And when detection turns out to be unsure, the report
 * says so and links back, rather than the form demanding certainty in advance.
 *
 * The other is the OCR warning. An image upload is accepted because refusing it would
 * exclude people, but it is the worst thing to send an employer, and the form says that
 * before the upload rather than after.
 */

const ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp";
const MAX_MB = 15;

const KIND_OPTIONS = [
  { value: "", label: "Detect automatically" },
  { value: "resume", label: "Resume / CV" },
  { value: "document", label: "Portfolio document" },
] as const;

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [documentKind, setDocumentKind] = useState<string>("");
  const [discipline, setDiscipline] = useState<string>("");
  const [ai, setAi] = useState(true);
  const [checkLinks, setCheckLinks] = useState(false);
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

    try {
      const body = new FormData();
      body.set("file", file);
      if (documentKind) body.set("documentKind", documentKind);
      if (discipline) body.set("discipline", discipline);
      body.set("ai", String(ai));
      body.set("checkLinks", String(checkLinks));

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
      router.push(`/r/${data.result.id}`);
    } catch {
      setError("Could not reach the analyzer. Is the server still running?");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-brand bg-brand-soft" : "border-line-strong bg-surface"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          id="portfolio-file"
          disabled={pending}
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />

        {file ? (
          <div>
            <p className="font-medium break-all">{file.name}</p>
            <p className="mt-1 text-sm text-muted">{formatSize(file.size)}</p>
            <button
              type="button"
              onClick={() => {
                choose(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              disabled={pending}
              className="mt-2 text-sm text-brand-ink hover:underline"
            >
              Choose a different file
            </button>
          </div>
        ) : (
          <div>
            <label
              htmlFor="portfolio-file"
              className="cursor-pointer font-medium text-brand-ink hover:underline"
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
        <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad-soft px-4 py-3 text-sm">
          That file is {formatSize(file!.size)}, over the {MAX_MB} MB limit. Most employer mail
          servers cap attachments at 10 MB, so it is worth shrinking regardless.
        </p>
      )}

      {isImage && !tooBig && (
        <p className="mt-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm">
          Images are read with OCR, so some words will come out wrong. Worth knowing either way:
          an image is the weakest thing to send an employer — nothing in it is searchable, and
          applicant tracking systems record it as an empty document. If you have a PDF, upload
          that instead.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">What is this?</span>
          <select
            value={documentKind}
            onChange={(event) => setDocumentKind(event.target.value)}
            disabled={pending}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-muted">Your field</span>
          <select
            value={discipline}
            onChange={(event) => setDiscipline(event.target.value)}
            disabled={pending}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
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

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
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
      </div>

      <button
        type="submit"
        disabled={!file || pending || tooBig}
        className="mt-4 w-full rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {pending ? (isImage ? "Reading the image…" : "Analyzing…") : "Analyze this file"}
      </button>

      <p className="mt-3 text-xs text-muted">
        The file itself is never saved — it is read in memory and discarded. Only the report is
        stored.
      </p>

      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad-soft px-4 py-3 text-sm">
          <p>{error}</p>
          {suggestion && <p className="mt-2 text-ink-soft">{suggestion}</p>}
        </div>
      )}
    </form>
  );
}
