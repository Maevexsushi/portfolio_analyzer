import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

/*
 * The system's one specified typeface: a geometric sans that mirrors the UI's own
 * rectangles and circles. Loaded with next/font so the font file is self-hosted at
 * build time — no runtime request to Google, no layout shift while it loads.
 */
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Portfolio Analyzer — grade your portfolio before you apply",
  description:
    "Analyze any portfolio URL for missing sections, project depth, skills coverage, broken links, design and accessibility issues, and performance — then export a PDF report.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="min-h-screen">
        {/*
          Flat: a solid header on a solid page, the edge drawn by a border rather than
          blur-behind-scroll. The system bans backdrop blur outright ("None on
          elements"), and a hard bottom border is exactly the "sharp color transitions
          between sections" the system asks for in its place.
        */}
        <header className="no-print sticky top-0 z-40 border-b border-line bg-canvas">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
            {/*
              The mark carries the brand; the name is live text beside it rather than
              part of the image, so it recolors with the page and stays selectable and
              screen-reader visible without the logo needing alt text of its own.
            */}
            <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
              <Image
                src="/logo-mark.png"
                alt=""
                aria-hidden
                width={32}
                height={32}
                priority
                className="h-8 w-8"
              />
              Profiled
            </Link>
            <nav className="flex items-center gap-1 text-sm font-semibold">
              <Link
                href="/"
                className="rounded-lg px-3.5 py-2 text-ink-soft transition-colors duration-200 hover:bg-surface-2 hover:text-ink"
              >
                Analyze
              </Link>
              <Link
                href="/job-match"
                className="rounded-lg px-3.5 py-2 text-ink-soft transition-colors duration-200 hover:bg-surface-2 hover:text-ink"
              >
                Job match
              </Link>
              <Link
                href="/history"
                className="rounded-lg px-3.5 py-2 text-ink-soft transition-colors duration-200 hover:bg-surface-2 hover:text-ink"
              >
                History
              </Link>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="no-print mt-16 border-t border-line bg-surface-2 py-8">
          <div className="mx-auto max-w-7xl px-4 text-sm text-muted">
            Static analysis of the HTML a portfolio actually serves. Scores are heuristic —
            treat them as a checklist, not a verdict.
          </div>
        </footer>
      </body>
    </html>
  );
}
