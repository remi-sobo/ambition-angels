import "server-only";
import { randomUUID } from "crypto";
import { configuredAppOrigin } from "@/lib/origins";
import {
  listActiveCalendarConnections,
  calendarClientFromRefreshToken,
  updateConnectionMeta,
  type GoogleCalendarConnection,
  type WatchState,
} from "./connection";

/**
 * Google Calendar push channels (events.watch), Phase 5 — the latency upgrade.
 *
 * A channel makes Google POST our webhook when a calendar changes, so we sync
 * within seconds instead of waiting for the 15-minute poll. This is strictly
 * additive: if no public webhook URL is configured, channels stay off and the
 * cron poll remains the source of truth. Channels expire (~7 days), so a daily
 * cron renews the ones nearing expiry.
 */

const RENEW_LEAD_MS = 2 * 86_400_000; // renew when under 2 days of life remain

function webhookUrl(): string | null {
  // The webhook base must equal whichever host owns /api/google/calendar-
  // webhook — the admin host (APP_ORIGIN). configuredAppOrigin() stays null
  // when nothing is set, so a dev machine never registers a prod channel.
  const base = configuredAppOrigin();
  return base ? `${base}/api/google/calendar-webhook` : null;
}

/** Register a push channel for one connection. Null when no webhook URL is set. */
export async function startCalendarWatch(
  conn: GoogleCalendarConnection
): Promise<WatchState | null> {
  const address = webhookUrl();
  if (!address) return null;

  const cal = calendarClientFromRefreshToken(conn.refreshToken);
  const channelId = randomUUID();
  const token = randomUUID();
  const res = await cal.events.watch({
    calendarId: conn.calendarId,
    requestBody: { id: channelId, type: "web_hook", address, token },
  });

  const watch: WatchState = {
    channelId,
    resourceId: res.data.resourceId ?? "",
    token,
    expiration: res.data.expiration ? Number(res.data.expiration) : Date.now() + 7 * 86_400_000,
  };
  await updateConnectionMeta(conn.id, { watch });
  return watch;
}

/** Stop a connection's push channel (best-effort) and clear its state. */
export async function stopCalendarWatch(conn: GoogleCalendarConnection): Promise<void> {
  if (!conn.watch) return;
  const cal = calendarClientFromRefreshToken(conn.refreshToken);
  try {
    await cal.channels.stop({
      requestBody: { id: conn.watch.channelId, resourceId: conn.watch.resourceId },
    });
  } catch {
    // Already expired/stopped on Google's side — fine.
  }
  await updateConnectionMeta(conn.id, { watch: null });
}

/** Start channels for connections without one, and renew those nearing expiry. */
export async function renewExpiringWatches(
  now: Date
): Promise<{ started: number; renewed: number; skipped: number; failed: number }> {
  const conns = await listActiveCalendarConnections();
  let started = 0;
  let renewed = 0;
  let skipped = 0;
  let failed = 0;
  for (const conn of conns) {
    const w = conn.watch;
    const needs = !w || w.expiration - now.getTime() < RENEW_LEAD_MS;
    if (!needs) {
      skipped += 1;
      continue;
    }
    try {
      if (w) {
        await stopCalendarWatch(conn);
        const fresh = await startCalendarWatch(conn);
        if (fresh) renewed += 1;
      } else {
        const fresh = await startCalendarWatch(conn);
        if (fresh) started += 1;
        else skipped += 1; // no webhook URL configured
      }
    } catch (e) {
      failed += 1;
      console.error(`watch renew failed for user ${conn.userId}:`, e);
    }
  }
  return { started, renewed, skipped, failed };
}
