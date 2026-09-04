"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  V2_CUTOVER_DESTINATIONS,
  activeShellKey,
  type ShellDestination,
  type ShellNav,
} from "@/lib/admin/v2shellNav";
import SectionSubNav from "../SectionSubNav";

/**
 * Spec B, stage B3 — the shell's tab slot. One rule per destination:
 *
 *   - CUT OVER (its key in V2_CUTOVER_DESTINATIONS): the V2 single tab row —
 *     one row, never a second level, never wraps (DoD 7: flex-nowrap +
 *     overflow-x-auto make wrapping structurally impossible at ANY tenant's
 *     tab count — tab row width is a per-tenant variable).
 *   - UNMIGRATED (every destination at B3): the V1 secondary nav renders for
 *     that destination, exactly as it does in the V1 chrome, so every V1
 *     screen a merge will later absorb (Friday close, prospects, the queue…)
 *     stays reachable while its V1 page is hosted in the shell.
 */

export function V2TabRow({ dest, pathname }: { dest: ShellDestination; pathname: string }) {
  const path = pathname.split("?")[0];
  return (
    <div className="sticky admin-sticky-top z-30 bg-ink/95 backdrop-blur-sm border-b border-hairline">
      <nav
        aria-label={`${dest.label} tabs`}
        className="max-w-7xl px-4 lg:px-8 py-3 flex flex-nowrap items-center gap-1.5 text-xs overflow-x-auto"
      >
        {dest.tabs.map((t) => {
          const isActive = path === t.href || path.startsWith(t.href + "/");
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 px-3 py-1.5 rounded-full border transition-colors ${
                isActive
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
  );
}

export default function V2TabZone({
  nav,
  features,
  terms,
}: {
  nav: ShellNav;
  features: string[] | null;
  terms: Record<string, string> | null;
}) {
  const pathname = usePathname() ?? "";
  const key = activeShellKey(pathname, nav);
  const dest =
    key === "inbox" ? nav.inbox : nav.destinations.find((d) => d.key === key) ?? null;

  if (dest && V2_CUTOVER_DESTINATIONS.has(dest.key)) {
    return <V2TabRow dest={dest} pathname={pathname} />;
  }
  // V1 fallback for every unmigrated destination (all of them at B3).
  return <SectionSubNav features={features} terms={terms} />;
}
