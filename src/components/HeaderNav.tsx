"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The page each link owns exactly — no prefix matching, so two items never light up together. */
const LINKS = [
  { href: "/", label: "Analyze" },
  { href: "/job-match", label: "Job match" },
  { href: "/job-match/rank", label: "Rank postings" },
  { href: "/company-brief", label: "Company brief" },
  { href: "/history", label: "History" },
] as const;

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-sm font-semibold">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3.5 py-2 transition-colors duration-200 ${
              active ? "bg-surface-2 text-ink" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
