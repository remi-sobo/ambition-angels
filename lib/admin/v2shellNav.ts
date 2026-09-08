import {
  V2_DESTINATIONS,
  V2_INBOX,
  resolveV2Destination,
  type IconName,
  type V2Destination,
} from "./nav";
import { canonicalSeat, liveSeatFor } from "./v2routes";

/**
 * Spec B, stage B3 — the V2 shell's navigation resolution. PURE (the layout
 * feeds it entitlements + terminology; tests feed it fixtures).
 *
 * Layers B1's model resolution (first-entitled-tab, zero-tab hiding) with
 * B2's map: every rendered tab carries the LIVE seat for its canonical route
 * (liveSeatFor), and a canonical tab with no live seat yet is hidden rather
 * than linked dead — it appears the moment its destination spec builds the
 * screen and activates its map row, with no shell edit.
 *
 * Cutover state: destinations migrate one at a time. A destination in
 * V2_CUTOVER_DESTINATIONS renders the V2 single tab row; every other
 * destination hosts its V1 pages and the tab slot falls back to the V1
 * secondary nav (SectionSubNav) for that destination only, so no V1 screen
 * (Friday close, prospects, the queue …) becomes unreachable mid-transition.
 */

/** Destinations whose V2 screens have shipped — their spec adds the key
 *  here, flipping that destination's tab slot from the V1 fallback to the
 *  V2 single row. Empty at B3 by definition. */
export const V2_CUTOVER_DESTINATIONS: ReadonlySet<string> = new Set<string>();

export type ShellTab = {
  key: string;
  label: string;
  /** The live screen this tab opens TODAY (a host page, a kept-in-place
   *  path, or the V1 source of an unbuilt merge seat). */
  href: string;
  /** The canonical V2 route (the model's href) — what the tab will link
   *  once its seat exists; used for active matching. */
  canonical: string;
};

export type ShellDestination = {
  key: string;
  label: string;
  icon: IconName;
  /** Landing = the first entitled tab WITH a live seat. */
  href: string;
  tabs: ShellTab[];
};

function toShell(
  dest: V2Destination,
  features?: string[] | null,
  terms?: Record<string, string> | null,
): ShellDestination | null {
  const resolved = resolveV2Destination(dest, features, terms);
  if (!resolved) return null;
  const tabs: ShellTab[] = [];
  for (const t of resolved.tabs) {
    const seat = liveSeatFor(t.href);
    if (!seat) continue; // no screen yet — hidden until its spec ships it
    tabs.push({ key: t.key, label: t.label, href: seat, canonical: t.href });
  }
  if (tabs.length === 0) return null;
  return {
    key: resolved.key,
    label: resolved.label,
    icon: resolved.icon,
    href: tabs[0].href,
    tabs,
  };
}

export type ShellNav = {
  destinations: ShellDestination[];
  inbox: ShellDestination | null;
};

/** The whole V2 shell sidebar for an org. */
export function resolveShellNav(
  features?: string[] | null,
  terms?: Record<string, string> | null,
): ShellNav {
  return {
    destinations: V2_DESTINATIONS.map((d) => toShell(d, features, terms)).filter(
      (d): d is ShellDestination => d !== null,
    ),
    inbox: toShell(V2_INBOX, features, terms),
  };
}

/**
 * Which destination owns the current path — sidebar highlight + tab-slot
 * routing. Matches the pathname AND its canonical translation against each
 * tab's live seat and canonical route, longest match wins. "/admin" (Home's
 * pre-cutover seat) matches exactly, never as a prefix of everything.
 */
export function activeShellKey(pathname: string, nav: ShellNav): string | null {
  const path = pathname.split("?")[0];
  const canonical = canonicalSeat(path);
  const hit = (candidate: string, seat: string): boolean =>
    seat === "/admin"
      ? candidate === "/admin"
      : candidate === seat || candidate.startsWith(seat + "/");

  let best: { key: string; len: number } | null = null;
  const all = nav.inbox ? [...nav.destinations, nav.inbox] : nav.destinations;
  for (const dest of all) {
    for (const tab of dest.tabs) {
      for (const seat of [tab.href, tab.canonical]) {
        if ((hit(path, seat) || hit(canonical, seat)) && (!best || seat.length > best.len)) {
          best = { key: dest.key, len: seat.length };
        }
      }
    }
  }
  return best?.key ?? null;
}
