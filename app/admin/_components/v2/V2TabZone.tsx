"use client";

import { usePathname } from "next/navigation";
import {
  activeShellKey,
  type ShellDestination,
  type ShellNav,
} from "@/lib/admin/v2shellNav";
import Tabs from "../ui/Tabs";

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
  // Visual System V3 §5 — the tab row stops being a strip of capsules. Every
  // tab was a bordered, tinted, rounded-full chip, which made the second
  // navigation level compete with the first. Now: text, generous spacing,
  // weight + a terracotta underline for the active tab, one hairline rule
  // under the row. Nothing else.
  return (
    <div className="sticky admin-sticky-top z-30 bg-app/95 backdrop-blur-sm">
      <div className="max-w-workspace px-4 lg:px-8">
        <Tabs
          label={`${dest.label} tabs`}
          items={dest.tabs.map((t) => ({ key: t.key, label: t.label, href: t.href }))}
          isActive={(t) => path === t.href || path.startsWith(t.href + "/")}
        />
      </div>
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
