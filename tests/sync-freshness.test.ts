import { describe, expect, test } from "vitest";
import { STALE_SYNC_MS, syncBannerMessage } from "@/lib/agenda/sync-freshness";

const NOW = new Date("2026-10-14T18:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 60 * 60 * 1000;

describe("syncBannerMessage (stale calendar threshold)", () => {
  test("a sync inside 24 hours stays quiet", () => {
    expect(
      syncBannerMessage({ hasCalendar: true, lastFinishedAt: ago(23 * HOUR), lastFailed: false }, NOW)
    ).toBeNull();
  });

  test("exactly 24 hours is still fresh; just past it warns", () => {
    expect(
      syncBannerMessage({ hasCalendar: true, lastFinishedAt: ago(STALE_SYNC_MS), lastFailed: false }, NOW)
    ).toBeNull();
    expect(
      syncBannerMessage({ hasCalendar: true, lastFinishedAt: ago(STALE_SYNC_MS + 1000), lastFailed: false }, NOW)
    ).toMatch(/last synced/);
  });

  test("Remi's case: last completed Sep 16, no errors, dates in LA time", () => {
    expect(
      syncBannerMessage(
        { hasCalendar: true, lastFinishedAt: "2026-09-16T22:15:45.258Z", lastFailed: false },
        NOW
      )
    ).toBe("Your calendar last synced Sep 16. Reconnect in Settings before planning.");
  });

  test("a recent failure warns even inside 24 hours", () => {
    expect(
      syncBannerMessage({ hasCalendar: true, lastFinishedAt: ago(2 * HOUR), lastFailed: true }, NOW)
    ).toBe("Your calendar sync failed on Oct 14. Reconnect in Settings before planning.");
  });

  test("a connected calendar that never finished a sync warns", () => {
    expect(syncBannerMessage({ hasCalendar: true, lastFinishedAt: null, lastFailed: false }, NOW)).toBe(
      "Your calendar hasn't synced yet. Reconnect in Settings before planning."
    );
  });

  test("no calendar here at all: no banner", () => {
    expect(syncBannerMessage({ hasCalendar: false, lastFinishedAt: null, lastFailed: false }, NOW)).toBeNull();
  });

  test("copy carries no em dashes", () => {
    const msg = syncBannerMessage({ hasCalendar: true, lastFinishedAt: ago(48 * HOUR), lastFailed: false }, NOW);
    expect(msg).not.toMatch(/—/);
  });
});
