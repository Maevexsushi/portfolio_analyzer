import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">That report isn&apos;t here</h1>
      <p className="mt-3 text-ink-soft">
        Stored analyses are kept locally, and only the most recent 50 are retained — this one
        may have been deleted or pushed out. Running the analysis again takes a few seconds.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-brand px-5 py-2.5 font-semibold text-white transition-opacity hover:opacity-90"
        >
          Analyze a portfolio
        </Link>
        <Link
          href="/history"
          className="rounded-xl border border-line px-5 py-2.5 font-medium transition-colors hover:border-line-strong"
        >
          View history
        </Link>
      </div>
    </div>
  );
}
