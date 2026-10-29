import Link from "next/link";
import { resolveUserHandle } from "@/lib/admin/ops/identity";
import { loadCalendarSyncHealth } from "@/lib/agenda/sync-health";
import { syncBannerMessage } from "@/lib/agenda/sync-freshness";

/**
 * Stale calendar warning for Plan and My Week (Weekly Plan v2, PR 1). Renders
 * nothing when the viewer's calendar synced in the last 24 hours, or when they
 * have no calendar here at all. A failed read stays quiet: the banner is a
 * hint, never a reason for the page to break.
 */
export default async function CalendarSyncBanner({ className = "" }: { className?: string }) {
  const me = await resolveUserHandle();
  if (!me) return null;
  let message: string | null = null;
  try {
    message = syncBannerMessage(await loadCalendarSyncHealth(me.orgId, me.userId));
  } catch (e) {
    console.error("[calendar-sync-banner] health read failed:", e);
  }
  if (!message) return null;

  return (
    <div
      role="status"
      className={`rounded-panel border border-status-watch-text/30 bg-status-watch-bg px-4 py-3 text-sm text-status-watch-text flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${className}`}
    >
      <span>{message}</span>
      <Link
        href="/admin/settings"
        className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
      >
        Open Settings →
      </Link>
    </div>
  );
}
