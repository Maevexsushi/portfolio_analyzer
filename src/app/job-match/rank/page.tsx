import Link from "next/link";
import { RankPostingsForm } from "@/components/RankPostingsForm";

export const metadata = {
  title: "Rank job postings — Profiled",
  description:
    "Upload your resume and paste several job postings to see, in order, which one it fits best.",
};

export default function RankPostingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Link href="/job-match" className="text-sm text-brand-ink hover:underline">
        ← Match against one posting instead
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
        Rank job postings
      </h1>
      <p className="mt-3 max-w-xl text-ink-soft">
        Have more than one posting open in a tab? Upload your resume once and paste all of
        them in — required and preferred skill coverage for each, ranked best fit first. This
        is a one-off comparison: nothing here is saved to history.
      </p>

      <div className="mt-8">
        <RankPostingsForm />
      </div>
    </div>
  );
}
