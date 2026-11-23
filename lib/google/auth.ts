import { google, type calendar_v3, type gmail_v1 } from "googleapis";
import { isInvalidGrant } from "@/lib/google/log-safe";

// The org and connection lookups are imported lazily: lib/google/gmail-read.ts
// imports this module for the env-only getGmailClient, and must not pull in
// server-only modules (or a database client) it never uses.

/**
 * Google clients for the public /meet scheduler (lib/google/calendar.ts,
 * lib/google/gmail.ts): booking events, confirmation/reschedule/cancel and
 * reminder emails, admin cancels.
 *
 * Token order:
 *  1. The org's stored scheduler Google account (Settings → Connections →
 *     Scheduler Google account; connections provider 'google_scheduler'),
 *     reconnectable with one click.
 *  2. The env GOOGLE_REFRESH_TOKEN, the old hand-copied token, as a fallback.
 *
 * The scheduler belongs to the resident org (lib/meet/host.ts only lets the
 * resident org book), so the stored token is read for that org.
 *
 * A new client is constructed per call rather than cached, to avoid shared
 * mutable state across concurrent requests in Vercel Fluid Compute; the
 * googleapis library refreshes the access token on each call.
 */

export type SchedulerTokenSource = "stored" | "env" | "none";

export type SchedulerToken = {
  refreshToken: string | null;
  source: SchedulerTokenSource;
  /** The stored connection's row id, when source is 'stored'. */
  connectionId: string | null;
};

/** Pure choice, exported for tests: stored first, then env, else none. */
export function pickSchedulerToken(
  stored: { id: string; refreshToken: string } | null,
  envToken: string | undefined
): SchedulerToken {
  if (stored?.refreshToken) {
    return { refreshToken: stored.refreshToken, source: "stored", connectionId: stored.id };
  }
  const env = (envToken ?? "").trim();
  if (env) return { refreshToken: env, source: "env", connectionId: null };
  return { refreshToken: null, source: "none", connectionId: null };
}

/** The refresh token the scheduler should use right now. A failed lookup of
 *  the stored token (database down, encryption key missing) falls back to the
 *  env token rather than failing the booking. */
export async function resolveSchedulerToken(): Promise<SchedulerToken> {
  let stored: { id: string; refreshToken: string } | null = null;
  try {
    const [{ getResidentOrgId }, { getActiveSchedulerConnection }] = await Promise.all([
      import("@/lib/admin/orgs"),
      import("@/lib/google/scheduler-connection"),
    ]);
    stored = await getActiveSchedulerConnection(await getResidentOrgId());
  } catch (err) {
    console.error(
      "loading scheduler Google account failed (using env fallback):",
      err instanceof Error ? err.message : String(err)
    );
  }
  return pickSchedulerToken(stored, process.env.GOOGLE_REFRESH_TOKEN);
}

function oauthClientWith(refreshToken: string | null | undefined) {
  const client = new google.auth.OAuth2(
    (process.env.GOOGLE_CLIENT_ID || "").trim(),
    (process.env.GOOGLE_CLIENT_SECRET || "").trim()
  );
  client.setCredentials({ refresh_token: refreshToken ?? undefined });
  return client;
}

export type SchedulerClient<T> = { client: T; token: SchedulerToken };

/** Calendar v3 client for the scheduler. Operations target the account's
 *  primary calendar, or GOOGLE_CALENDAR_ID if set. */
export async function getCalendarClient(): Promise<SchedulerClient<calendar_v3.Calendar>> {
  const token = await resolveSchedulerToken();
  return { client: google.calendar({ version: "v3", auth: oauthClientWith(token.refreshToken) }), token };
}

/** Gmail v1 client for scheduler sends. users.messages.send with userId 'me'
 *  sends from the authenticated account, so no From header is needed. */
export async function getGmailSendClient(): Promise<SchedulerClient<gmail_v1.Gmail>> {
  const token = await resolveSchedulerToken();
  return { client: google.gmail({ version: "v1", auth: oauthClientWith(token.refreshToken) }), token };
}

/**
 * Gmail v1 client on the env GOOGLE_REFRESH_TOKEN only, for the Gmail
 * interaction (read) sync in lib/google/gmail-read.ts. It needs
 * gmail.readonly, which the scheduler account is never granted, so it must
 * not switch to the stored scheduler token.
 */
export function getGmailClient(): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth: oauthClientWith(process.env.GOOGLE_REFRESH_TOKEN) });
}

/**
 * Run one scheduler Google call. When Google refuses the stored token itself
 * (invalid_grant: revoked, expired, password changed) the connection is marked
 * broken, so Settings → Connections says "Reconnect" and later calls fall back
 * to the env token. The error is rethrown unchanged for the caller.
 */
export async function withSchedulerToken<T>(
  token: SchedulerToken,
  call: () => Promise<T>
): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (token.source === "stored" && token.connectionId && isInvalidGrant(err)) {
      const { markSchedulerConnectionBroken } = await import("@/lib/google/scheduler-connection");
      await markSchedulerConnectionBroken(
        token.connectionId,
        "Google stopped accepting this account's permission (revoked or expired). Reconnect it."
      );
    }
    throw err;
  }
}
