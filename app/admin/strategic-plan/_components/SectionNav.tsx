"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Shared section navigation for every Strategic Plan sub-page, rendered from
// the section layout so new sub-pages get it for free: a back chip to the full
// plan, then one chip per section with the current page highlighted. The
// landing page links each sub-page from its labeled sub-section instead
// (Org lens), so the nav hides itself there.
// Presenter mode (narrative?present=1) is a fixed full-screen overlay and
// simply covers this bar.

const BASE = "/admin/strategic-plan";

const SECTIONS = [
  { href: `${BASE}/scorecard`, label: "KPI Scorecard" },
  { href: `${BASE}/narrative`, label: "Narrative" },
  { href: `${BASE}/setup`, label: "Set up" },
  { href: `${BASE}/people`, label: "People" },
  { href: `${BASE}/review`, label: "Monthly review" },
];

export default function SectionNav() {
  const pathname = usePathname();
  if (!pathname || pathname === BASE) return null;

  return (
    <nav
      aria-label="Strategic Plan sections"
      className="px-4 lg:px-8 pt-6 -mb-1 flex items-center gap-2 flex-wrap"
    >
      <Link
        href={BASE}
        className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors"
      >
        ← Strategic Plan
      </Link>
      {SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={`text-xs font-semibold px-4 py-2 rounded-full transition-colors ${
              active
                ? "bg-orange text-white"
                : "text-ink-1 bg-tile hover:bg-[#EFE6D4]"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
