import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">That report isn&apos;t here</h1>
      <p className="mt-3 text-ink-soft">
        Stored analyses are kept locally, and only the most recent 50 are retained — this one
        may have been deleted or pushed out. Running the analysis again takes a few seconds.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link href="/" className="btn-brand rounded-lg px-5 py-2.5 font-bold">
          Analyze a portfolio
        </Link>
        <Link
          href="/history"
          className="btn-secondary rounded-lg px-5 py-2.5 font-bold"
        >
          View history
        </Link>
      </div>
    </div>
  );
}
