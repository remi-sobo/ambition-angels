/**
 * Calendar trust signal (Weekly Plan v2, PR 1). Plan and My Week lean on the
 * synced calendar; when the sync silently stops, every meeting and open-time
 * figure goes wrong with no hint why. This decides whether to warn and what
 * to say. Pure, unit-tested in tests/sync-freshness.test.ts; the server read
 * lives in lib/agenda/sync-health.ts.
 *
 * Keyed off the age of the newest FINISHED job, never the latest job's status:
 * a dead scheduler writes nothing (the last row still says completed), and a
 * job stuck in `running` has no finished_at, so neither may hide staleness.
 */

/** Older than this and the calendar no longer reflects the week. */
export const STALE_SYNC_MS = 24 * 60 * 60 * 1000;

export type SyncHealth = {
  /** The viewer has a calendar here: an active connection, or any past sync. */
  hasCalendar: boolean;
  /** finished_at of the viewer's newest finished sync job, or null if none. */
  lastFinishedAt: string | null;
  /** That job failed or recorded errors. */
  lastFailed: boolean;
};

const ORG_TZ = "America/Los_Angeles";

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: ORG_TZ,
    month: "short",
    day: "numeric",
  });
}

/** The banner sentence, or null when the calendar is fresh (or not in use). */
export function syncBannerMessage(health: SyncHealth, now: Date = new Date()): string | null {
  if (!health.hasCalendar) return null;
  const tail = "Reconnect in Settings before planning.";
  if (!health.lastFinishedAt) return `Your calendar hasn't synced yet. ${tail}`;
  const label = dayLabel(health.lastFinishedAt);
  if (health.lastFailed) return `Your calendar sync failed on ${label}. ${tail}`;
  const age = now.getTime() - Date.parse(health.lastFinishedAt);
  if (age > STALE_SYNC_MS) return `Your calendar last synced ${label}. ${tail}`;
  return null;
}
