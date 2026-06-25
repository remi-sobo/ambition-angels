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

export type GoogleCalendarConnection = {
  id: string;
  orgId: string;
  userId: string;
  refreshToken: string;
  calendarId: string;
  status: string;
};

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
    .map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      userId: r.user_id as string,
      refreshToken: decryptSecret(fromBytea(r.refresh_token_enc)),
      calendarId: ((r.meta as Record<string, unknown> | null)?.calendar_id as string) ?? (r.external_id as string) ?? "primary",
      status: r.status as string,
    }));
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
