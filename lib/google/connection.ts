import { google, type calendar_v3 } from "googleapis";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, toByteaHex, fromBytea } from "@/lib/crypto/secret-box";

/**
 * Per-user Google Calendar credentials, stored in the `connections` table
 * (provider 'google_calendar', user_id set, refresh token AES-256-GCM encrypted
 * in refresh_token_enc). This replaces the single env GOOGLE_REFRESH_TOKEN for
 * calendar reads, so a second tenant's calendars don't depend on an env var.
 *
 * `connections` is service-path only (RLS deny-all), so everything here uses the
 * service-role client and must run only from already-authed server routes.
 */

const PROVIDER = "google_calendar";

/** events.watch push-channel state, persisted in connections.meta.watch (Phase 5). */
export type WatchState = {
  channelId: string;
  resourceId: string;
  token: string;
  /** Channel expiration, epoch ms (Google caps at ~7 days). */
  expiration: number;
};

export type GoogleCalendarConnection = {
  id: string;
  orgId: string;
  userId: string;
  refreshToken: string;
  calendarId: string;
  status: string;
  /** Incremental-sync cursor (events.list nextSyncToken), null on first sync. */
  syncToken: string | null;
  /** Active push channel, if any. */
  watch: WatchState | null;
};

function readSyncToken(meta: Record<string, unknown> | null): string | null {
  const t = meta?.sync_token;
  return typeof t === "string" && t ? t : null;
}

function readWatch(meta: Record<string, unknown> | null): WatchState | null {
  const w = meta?.watch as Partial<WatchState> | undefined;
  if (!w || typeof w.channelId !== "string" || typeof w.resourceId !== "string") return null;
  return {
    channelId: w.channelId,
    resourceId: w.resourceId,
    token: typeof w.token === "string" ? w.token : "",
    expiration: typeof w.expiration === "number" ? w.expiration : 0,
  };
}

/** Read-modify-write a connection's meta jsonb (preserves other keys). */
export async function updateConnectionMeta(
  connectionId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("connections").select("meta").eq("id", connectionId).maybeSingle();
  const meta = { ...((data?.meta as Record<string, unknown> | null) ?? {}), ...patch };
  const { error } = await sb
    .from("connections")
    .update({ meta, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (error) throw new Error(`connection meta update failed: ${error.message}`);
}

/** Store (or rotate) a user's encrypted Google Calendar refresh token. */
export async function upsertGoogleCalendarConnection(args: {
  orgId: string;
  userId: string;
  refreshToken: string;
  calendarId?: string;
}): Promise<void> {
  const calendarId = args.calendarId ?? "primary";
  const enc = toByteaHex(encryptSecret(args.refreshToken));
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("connections").upsert(
    {
      org_id: args.orgId,
      user_id: args.userId,
      provider: PROVIDER,
      external_id: calendarId,
      refresh_token_enc: enc,
      status: "active",
      meta: { calendar_id: calendarId },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider,external_id" }
  );
  if (error) throw new Error(`google_calendar connection upsert failed: ${error.message}`);
}

/** All active Google Calendar connections (one per connected user), decrypted. */
export async function listActiveCalendarConnections(): Promise<GoogleCalendarConnection[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("connections")
    .select("id, org_id, user_id, external_id, refresh_token_enc, status, meta")
    .eq("provider", PROVIDER)
    .eq("status", "active");
  if (error) throw new Error(`listing google_calendar connections failed: ${error.message}`);

  return (data ?? [])
    .filter((r) => r.user_id && r.refresh_token_enc)
    .map((r) => {
      const meta = r.meta as Record<string, unknown> | null;
      return {
        id: r.id as string,
        orgId: r.org_id as string,
        userId: r.user_id as string,
        refreshToken: decryptSecret(fromBytea(r.refresh_token_enc)),
        calendarId: (meta?.calendar_id as string) ?? (r.external_id as string) ?? "primary",
        status: r.status as string,
        syncToken: readSyncToken(meta),
        watch: readWatch(meta),
      };
    });
}

/** One user's active Google Calendar connection, decrypted — for per-user writes. */
export async function getActiveCalendarConnection(
  userId: string
): Promise<GoogleCalendarConnection | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("connections")
    .select("id, org_id, user_id, external_id, refresh_token_enc, status, meta")
    .eq("provider", PROVIDER)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`loading google_calendar connection failed: ${error.message}`);
  if (!data || !data.user_id || !data.refresh_token_enc) return null;
  const meta = data.meta as Record<string, unknown> | null;
  return {
    id: data.id as string,
    orgId: data.org_id as string,
    userId: data.user_id as string,
    refreshToken: decryptSecret(fromBytea(data.refresh_token_enc)),
    calendarId: (meta?.calendar_id as string) ?? (data.external_id as string) ?? "primary",
    status: data.status as string,
    syncToken: readSyncToken(meta),
    watch: readWatch(meta),
  };
}

export type CalendarConnectionStatus = {
  connected: boolean;
  calendarId: string | null;
  lastSyncedAt: string | null;
  lastStatus: string | null;
  eventCount: number;
};

/** Connection + freshness summary for one user, for the Settings card. */
export async function getCalendarConnectionStatus(userId: string): Promise<CalendarConnectionStatus> {
  const sb = getSupabaseAdmin();
  const { data: conn } = await sb
    .from("connections")
    .select("external_id, meta, status")
    .eq("provider", PROVIDER)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const { data: job } = await sb
    .from("calendar_sync_jobs")
    .select("status, finished_at")
    .eq("owner_user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { count } = await sb
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);

  return {
    connected: !!conn,
    calendarId: conn
      ? (((conn.meta as Record<string, unknown> | null)?.calendar_id as string) ?? (conn.external_id as string) ?? "primary")
      : null,
    lastSyncedAt: (job?.finished_at as string | null) ?? null,
    lastStatus: (job?.status as string | null) ?? null,
    eventCount: count ?? 0,
  };
}

/** An authenticated Calendar v3 client for a given refresh token. */
export function calendarClientFromRefreshToken(refreshToken: string): calendar_v3.Calendar {
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth });
}
