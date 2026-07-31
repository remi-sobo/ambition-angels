"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { resolveSectionNav } from "@/lib/admin/nav";

// The horizontal sub-topic bar, rendered once from the admin layout so every
// section gets it — previously each route group had to opt in by hand, which
// is why only Fundraising (and a few product tab strips) ever showed one.
//
// It derives entirely from the IA in lib/admin/nav.ts: row one is the
// section's sibling sub-topics, row two the active sub-topic's own tabs when
// it has them (Work, Meetings, Finance, Students). Sticky, so the tabs stay
// reachable while scrolling long tables and dashboards.
export default function SectionSubNav({
  features,
  terms,
}: {
  /** Enabled entitlement keys for the session org — tabs whose module the org
   *  lacks are dropped, matching the sidebar (core fence spec §6b). */
  features?: string[] | null;
  /** Resolved terminology labels (term key → display label), so the pills read
   *  "Scholars"/"Chapters" wherever the sidebar does. */
  terms?: Record<string, string> | null;
}) {
  const pathname = usePathname() ?? "";
  const nav = resolveSectionNav(pathname, { features, terms });
  if (!nav) return null;

  return (
    <div className="sticky admin-sticky-top z-30 bg-ink/95 backdrop-blur-sm border-b border-hairline">
      {nav.rows.map((row) => (
        <div
          key={row.label}
          className="max-w-7xl px-4 lg:px-8 py-3 flex items-center justify-between gap-3 flex-wrap [&+&]:pt-0"
        >
          <span className="text-[10px] uppercase tracking-[0.25em] text-orange/80">
            {row.label}
          </span>
          <nav aria-label={`${row.label} sections`} className="flex items-center gap-1.5 text-xs flex-wrap">
            {row.tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={`px-3 py-1.5 rounded-full border transition-colors ${
                  t.active
                    ? "border-orange/60 bg-orange/15 text-orange"
                    : "border-outline text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4]"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      ))}
    </div>
  );
}
