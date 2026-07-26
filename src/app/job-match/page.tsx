import Link from "next/link";
import { UploadForm } from "@/components/UploadForm";

export const metadata = {
  title: "Job match & cover letter — Profiled",
  description:
    "Upload your resume with a job posting to see which required and preferred skills it's missing, get a cover letter reviewed, or have one drafted from your resume.",
};

export default function JobMatchPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
        Job match &amp; cover letter
      </h1>
      <p className="mt-3 max-w-xl text-ink-soft">
        Upload your resume alongside a job posting to see exactly which required and preferred
        skills it evidences and which it's missing. Paste a cover letter you've already written
        to have it reviewed, or ask for one to be drafted from your resume — it will not invent a
        skill, employer, or number your resume doesn't already say.
      </p>

      <div className="card mt-8 p-5 sm:p-6">
        <UploadForm documentKind="resume" jobMatchMode />
      </div>

      <p className="mt-4 text-sm text-muted">
        Have more than one posting to check?{" "}
        <Link href="/job-match/rank" className="font-semibold text-brand-ink hover:underline">
          Rank several against this resume at once
        </Link>
        .
      </p>
    </div>
  );
}
