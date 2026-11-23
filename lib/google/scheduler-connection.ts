import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, toByteaHex, fromBytea } from "@/lib/crypto/secret-box";
import { googleOAuthClientFor } from "@/lib/google/oauth";
import { mayRevokeGoogleGrant } from "@/lib/google/grant";

/**
 * The org's scheduler Google account, stored in `connections` (provider
 * 'google_scheduler', one row per org, external_id 'scheduler'), refresh token
 * AES-256-GCM encrypted. lib/google/auth.ts reads it for the /meet calendar
 * and email calls, falling back to the env GOOGLE_REFRESH_TOKEN.
 *
 * `connections` is service-path only (RLS deny-all), so everything here uses
 * the service-role client. Route callers must already have checked the
 * session's org and org.manage.
 */

export const SCHEDULER_PROVIDER = "google_scheduler";
const EXTERNAL_ID = "scheduler";

export type SchedulerConnection = {
  id: string;
  orgId: string;
  accountEmail: string;
  refreshToken: string;
};

export type SchedulerConnectionStatus =
  | { state: "none" }
  | {
      state: "active" | "error";
      accountEmail: string;
      connectedByEmail: string | null;
      connectedAt: string | null;
      reason: string | null;
    };

type Meta = Record<string, unknown> | null;
const str = (meta: Meta, key: string): string | null => {
  const v = meta?.[key];
  return typeof v === "string" && v ? v : null;
};

export async function upsertSchedulerConnection(args: {
  orgId: string;
  userId: string;
  connectedByEmail: string;
  accountEmail: string;
  refreshToken: string;
  scope: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("connections")
    .upsert(
      {
        org_id: args.orgId,
        user_id: args.userId,
        provider: SCHEDULER_PROVIDER,
        external_id: EXTERNAL_ID,
        refresh_token_enc: toByteaHex(encryptSecret(args.refreshToken)),
        status: "active",
        meta: {
          account_email: args.accountEmail,
          scope: args.scope,
          connected_by_email: args.connectedByEmail,
          connected_at: now,
        },
        updated_at: now,
      },
      { onConflict: "org_id,provider,external_id" }
    );
  if (error) throw new Error(`google_scheduler connection upsert failed: ${error.message}`);
}

/** The org's working scheduler account, decrypted, or null (never connected,
 *  disconnected, or marked broken and waiting for a reconnect). */
export async function getActiveSchedulerConnection(orgId: string): Promise<SchedulerConnection | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("connections")
    .select("id, org_id, refresh_token_enc, meta")
    .eq("org_id", orgId)
    .eq("provider", SCHEDULER_PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`loading google_scheduler connection failed: ${error.message}`);
  if (!data?.refresh_token_enc) return null;
  return {
    id: data.id as string,
    orgId: data.org_id as string,
    accountEmail: str(data.meta as Meta, "account_email") ?? "",
    refreshToken: decryptSecret(fromBytea(data.refresh_token_enc)),
  };
}

/** What the Connections card shows. Never includes the token. */
export async function getSchedulerConnectionStatus(orgId: string): Promise<SchedulerConnectionStatus> {
  const { data, error } = await getSupabaseAdmin()
    .from("connections")
    .select("status, meta")
    .eq("org_id", orgId)
    .eq("provider", SCHEDULER_PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .maybeSingle();
  if (error) {
    console.error("loading scheduler connection status failed:", error.message);
    return { state: "none" };
  }
  if (!data) return { state: "none" };
  const meta = data.meta as Meta;
  return {
    state: data.status === "active" ? "active" : "error",
    accountEmail: str(meta, "account_email") ?? "",
    connectedByEmail: str(meta, "connected_by_email"),
    connectedAt: str(meta, "connected_at"),
    reason: str(meta, "error_reason"),
  };
}

/** Stop using a token Google refused (invalid_grant). The row stays so the
 *  card can say what broke; reconnecting overwrites it. Until then the
 *  scheduler falls back to the env token. */
export async function markSchedulerConnectionBroken(connectionId: string, reason: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("connections").select("meta").eq("id", connectionId).maybeSingle();
  const meta = { ...((data?.meta as Meta) ?? {}), error_reason: reason, error_at: new Date().toISOString() };
  const { error } = await admin
    .from("connections")
    .update({ status: "error", meta, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (error) console.error("marking scheduler connection broken failed:", error.message);
}

/** Disconnect: delete the row, and revoke the grant at Google only when no
 *  other BloomOS connection (or the env token) uses the same account
 *  (lib/google/grant.ts). Best effort revoke. Returns the account, for the
 *  audit log. */
export async function deleteSchedulerConnection(orgId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("connections")
    .select("id, refresh_token_enc, meta")
    .eq("org_id", orgId)
    .eq("provider", SCHEDULER_PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .maybeSingle();
  if (!data) return null;
  const accountEmail = str(data.meta as Meta, "account_email");

  if (data.refresh_token_enc && (await mayRevokeGoogleGrant(accountEmail, [data.id as string]))) {
    try {
      await googleOAuthClientFor().revokeToken(decryptSecret(fromBytea(data.refresh_token_enc)));
    } catch (err) {
      console.error("revoking scheduler grant failed (continuing):", err instanceof Error ? err.message : err);
    }
  }
  const { error } = await admin.from("connections").delete().eq("id", data.id);
  if (error) throw new Error(`deleting google_scheduler connection failed: ${error.message}`);
  return accountEmail;
}
