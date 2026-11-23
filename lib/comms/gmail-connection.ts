import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, toByteaHex, fromBytea } from "@/lib/crypto/secret-box";
import { googleOAuthClientFor } from "@/lib/google/oauth";
import { mayRevokeGoogleGrant } from "@/lib/google/grant";

/**
 * An org's Gmail sender, stored in `connections` (provider 'google_gmail',
 * one row per org, external_id 'sender'), refresh token AES-256-GCM encrypted.
 *
 * `connections` is service-path only (RLS deny-all), so every function here
 * uses the service-role client. Callers must already have checked the
 * session's org and permission (getOrgContext + ctxHasPermission).
 */

const PROVIDER = "google_gmail";
const EXTERNAL_ID = "sender";

export type GmailConnection = {
  id: string;
  orgId: string;
  accountEmail: string;
  refreshToken: string;
};

export type GmailConnectionStatus =
  | { state: "none" }
  | {
      state: "active" | "error";
      accountEmail: string;
      connectedByEmail: string | null;
      connectedAt: string | null;
      /** Why sending stopped, when state is 'error'. */
      reason: string | null;
    };

type Meta = Record<string, unknown> | null;
const str = (meta: Meta, key: string): string | null => {
  const v = meta?.[key];
  return typeof v === "string" && v ? v : null;
};

export async function upsertGmailConnection(args: {
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
        provider: PROVIDER,
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
  if (error) throw new Error(`google_gmail connection upsert failed: ${error.message}`);
}

/** The org's working Gmail sender, decrypted, or null when there isn't one
 *  (never connected, disconnected, or broken and waiting to be reconnected). */
export async function getActiveGmailConnection(orgId: string): Promise<GmailConnection | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("connections")
    .select("id, org_id, refresh_token_enc, meta")
    .eq("org_id", orgId)
    .eq("provider", PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`loading google_gmail connection failed: ${error.message}`);
  if (!data?.refresh_token_enc) return null;
  const accountEmail = str(data.meta as Meta, "account_email");
  if (!accountEmail) return null;
  return {
    id: data.id as string,
    orgId: data.org_id as string,
    accountEmail,
    refreshToken: decryptSecret(fromBytea(data.refresh_token_enc)),
  };
}

/** What the Comms settings card shows. Never includes the token. */
export async function getGmailConnectionStatus(orgId: string): Promise<GmailConnectionStatus> {
  const { data, error } = await getSupabaseAdmin()
    .from("connections")
    .select("status, meta")
    .eq("org_id", orgId)
    .eq("provider", PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .maybeSingle();
  if (error) {
    console.error("loading gmail connection status failed:", error.message);
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

/** Stop using a sender whose grant Google no longer honors (revoked, password
 *  changed, account suspended). The row stays so the card can say what broke;
 *  reconnecting overwrites it. */
export async function markGmailConnectionBroken(connectionId: string, reason: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("connections").select("meta").eq("id", connectionId).maybeSingle();
  const meta = { ...((data?.meta as Meta) ?? {}), error_reason: reason, error_at: new Date().toISOString() };
  const { error } = await admin
    .from("connections")
    .update({ status: "error", meta, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (error) console.error("marking gmail connection broken failed:", error.message);
}

/** Disconnect: delete the row, and revoke the grant at Google only when no
 *  other BloomOS connection uses the same account (see lib/google/grant.ts:
 *  revoking would also kill that account's calendar connection). The revoke
 *  is best effort, so a token Google has already dropped doesn't block the
 *  disconnect. Returns the account that was connected, for the audit log. */
export async function deleteGmailConnection(orgId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("connections")
    .select("id, refresh_token_enc, meta")
    .eq("org_id", orgId)
    .eq("provider", PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .maybeSingle();
  if (!data) return null;
  const accountEmail = str(data.meta as Meta, "account_email");

  if (data.refresh_token_enc && (await mayRevokeGoogleGrant(accountEmail, [data.id as string]))) {
    try {
      await googleOAuthClientFor().revokeToken(decryptSecret(fromBytea(data.refresh_token_enc)));
    } catch (err) {
      console.error("revoking gmail grant failed (continuing):", err instanceof Error ? err.message : err);
    }
  }
  const { error } = await admin.from("connections").delete().eq("id", data.id);
  if (error) throw new Error(`deleting google_gmail connection failed: ${error.message}`);
  return accountEmail;
}
