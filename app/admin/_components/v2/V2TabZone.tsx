"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  activeShellKey,
  type ShellDestination,
  type ShellNav,
} from "@/lib/admin/v2shellNav";

/**
 * Spec B, stage B3 — the shell's tab slot: the V2 single tab row — one row,
 * never a second level, never wraps (DoD 7: flex-nowrap + overflow-x-auto
 * make wrapping structurally impossible at ANY tenant's tab count — tab row
 * width is a per-tenant variable).
 *
 * The V1 SectionSubNav fallback (for destinations not yet cut over) was
 * deleted with NAV_SECTIONS once every destination joined
 * V2_CUTOVER_DESTINATIONS (Spec Inbox X2) — the set survives in v2shellNav
 * as the cutover record; nothing branches on it any more. A path outside
 * every destination (settings, howto, …) renders no tab row until its own
 * destination exists.
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

export default function V2TabZone({ nav }: { nav: ShellNav }) {
  const pathname = usePathname() ?? "";
  const key = activeShellKey(pathname, nav);
  const dest =
    key === "inbox" ? nav.inbox : nav.destinations.find((d) => d.key === key) ?? null;

  if (!dest) return null;
  return <V2TabRow dest={dest} pathname={pathname} />;
}
