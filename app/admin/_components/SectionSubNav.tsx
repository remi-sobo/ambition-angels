"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The shared section chrome for consolidated sidebar items: a sticky bar with
// the section eyebrow + pill tabs, visually identical to the Finance and
// Meetings bars. One sidebar row per product; the tabs fan out inside it.
export type SectionTab = {
  href: string;
  label: string;
  /** Extra route prefixes that count as this tab (e.g. the Monday/Friday
   *  wizards under My Week). */
  match?: string[];
};

function hit(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

function tabHit(path: string, tab: SectionTab): boolean {
  return hit(path, tab.href) || (tab.match ?? []).some((m) => hit(path, m));
}

export default function SectionSubNav({
  eyebrow,
  rootHref,
  tabs,
  exclude,
}: {
  eyebrow: string;
  /** The section's root route. The tab living at it also claims any section
   *  route no other tab matches (detail pages, unlisted admin pages), so
   *  drilling into a record keeps you oriented. */
  rootHref: string;
  tabs: SectionTab[];
  /** Route prefixes inside the section that are IA-homed elsewhere and
   *  should not show the section's tab bar at all. */
  exclude?: string[];
}) {
  const pathname = usePathname() ?? "";

  if ((exclude ?? []).some((p) => hit(pathname, p))) return null;

  function isActive(tab: SectionTab): boolean {
    const othersHit = tabs.some(
      (t) => t.href !== tab.href && tabHit(pathname, t)
    );
    if (tab.href === rootHref) {
      return (hit(pathname, rootHref) || tabHit(pathname, tab)) && !othersHit;
    }
    return tabHit(pathname, tab);
  }

  return (
    <div className="sticky admin-sticky-top z-30 bg-ink/95 backdrop-blur-sm border-b border-hairline">
      <div className="max-w-7xl px-4 lg:px-8 py-3 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.25em] text-orange/80">
          {eyebrow}
        </span>
        <nav className="flex items-center gap-1.5 text-xs flex-wrap">
          {tabs.map((t) => {
            const active = isActive(t);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "border-orange/60 bg-orange/15 text-orange"
                    : "border-outline text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
