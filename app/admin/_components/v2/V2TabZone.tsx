"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

/**
 * V4 Stage A2 (spec §10: "no tab wider than the screen"): the row scrolls
 * sideways inside its own box (the <Tabs> primitive is overflow-x-auto and
 * never wraps), the box clips so the row can never widen the page, and a
 * fade on the trailing edge says "more tabs this way" while any are hidden.
 * The fade follows the scroll position, so it goes once the last tab shows.
 */
function useTrailingFade(dep: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const scroller = ref.current?.querySelector("nav");
    if (!scroller) return;
    const update = () =>
      setFade(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2);
    update();
    // Keep the active tab in view on narrow screens (Tasks sits mid-row).
    const current = scroller.querySelector<HTMLElement>('[aria-current="page"]');
    if (current && current.offsetLeft + current.offsetWidth > scroller.clientWidth) {
      scroller.scrollLeft = current.offsetLeft - 16;
      update();
    }
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [dep]);
  return { ref, fade };
}

export function V2TabRow({ dest, pathname }: { dest: ShellDestination; pathname: string }) {
  const path = pathname.split("?")[0];
  const { ref, fade } = useTrailingFade(`${dest.key}:${path}`);
  // Visual System V3 §5 — the tab row stops being a strip of capsules. Every
  // tab was a bordered, tinted, rounded-full chip, which made the second
  // navigation level compete with the first. Now: text, generous spacing,
  // weight + a terracotta underline for the active tab, one hairline rule
  // under the row. Nothing else.
  return (
    <div className="sticky admin-sticky-top z-30 bg-app/95 backdrop-blur-sm">
      <div ref={ref} className="relative max-w-workspace px-4 lg:px-8 overflow-hidden">
        <Tabs
          label={`${dest.label} tabs`}
          items={dest.tabs.map((t) => ({ key: t.key, label: t.label, href: t.href }))}
          isActive={(t) => path === t.href || path.startsWith(t.href + "/")}
          className="v2-tab-scroll"
        />
        {fade && (
          <span
            aria-hidden
            data-tab-fade
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-app to-transparent"
          />
        )}
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
