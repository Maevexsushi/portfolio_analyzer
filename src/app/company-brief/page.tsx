import Link from "next/link";
import { CompanyBriefForm } from "@/components/CompanyBriefForm";

export const metadata = {
  title: "Company research briefing — Profiled",
  description:
    "Paste a company's own web pages and get a short, evidence-backed interview-prep briefing built only from what they publish about themselves.",
};

export default function CompanyBriefPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Link href="/job-match" className="text-sm text-brand-ink hover:underline">
        ← Back to Job match
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
        Company research briefing
      </h1>
      <p className="mt-3 max-w-xl text-ink-soft">
        Paste a company&apos;s own homepage, About, or Careers page and get a short briefing
        before an interview: what they do, and what they say about how they work — each
        claim paired with the line on the page that backs it. There is no search or news
        feed behind this: it reads exactly the pages you give it, nothing else, and says so.
      </p>

      <div className="mt-8">
        <CompanyBriefForm />
      </div>
    </div>
  );
}
