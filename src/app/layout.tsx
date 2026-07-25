import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio Analyzer — grade your portfolio before you apply",
  description:
    "Analyze any portfolio URL for missing sections, project depth, skills coverage, broken links, design and accessibility issues, and performance — then export a PDF report.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="no-print sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm font-bold text-white"
              >
                PA
              </span>
              Portfolio Analyzer
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Analyze
              </Link>
              <Link
                href="/history"
                className="rounded-lg px-3 py-1.5 text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
              >
                History
              </Link>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="no-print mt-16 border-t border-line py-8">
          <div className="mx-auto max-w-6xl px-4 text-sm text-muted">
            Static analysis of the HTML a portfolio actually serves. Scores are heuristic —
            treat them as a checklist, not a verdict.
          </div>
        </footer>
      </body>
    </html>
  );
}
