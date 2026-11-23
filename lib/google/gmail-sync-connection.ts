import type { gmail_v1 } from "googleapis";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, toByteaHex, fromBytea } from "@/lib/crypto/secret-box";
import { gmailReadClientFor, isGmailSyncClientConfigured } from "@/lib/google/gmail-sync-oauth";

/**
 * The mailbox the Gmail read sync reads, stored in `connections` (provider
 * 'google_gmail_read', external_id 'mailbox', one row per org) with the
 * refresh token AES-256-GCM encrypted. The token was minted by the Internal
 * OAuth client (lib/google/gmail-sync-oauth.ts), never by "bloom / meet".
 *
 * `connections` is service-path only (RLS deny-all). Callers must already have
 * checked the org (env-owner gate) and permission.
 */

const PROVIDER = "google_gmail_read";
const EXTERNAL_ID = "mailbox";

export type GmailSyncConnectionStatus =
  | { state: "unconfigured" }
  | { state: "none" }
  | { state: "active" | "error"; accountEmail: string; connectedAt: string | null; reason: string | null };

type Meta = Record<string, unknown> | null;
const str = (meta: Meta, key: string): string | null => {
  const v = meta?.[key];
  return typeof v === "string" && v ? v : null;
};

export async function upsertGmailSyncConnection(args: {
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
          oauth_client: "internal",
          connected_by_email: args.connectedByEmail,
          connected_at: now,
        },
        updated_at: now,
      },
      { onConflict: "org_id,provider,external_id" }
    );
  if (error) throw new Error(`google_gmail_read connection upsert failed: ${error.message}`);
}

/** A Gmail client for the org's synced mailbox, or null when the Internal
 *  client isn't configured or no mailbox is connected. Never falls back to the
 *  "bloom / meet" env token. */
export async function getGmailReadClient(orgId: string): Promise<gmail_v1.Gmail | null> {
  if (!isGmailSyncClientConfigured()) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("connections")
    .select("refresh_token_enc")
    .eq("org_id", orgId)
    .eq("provider", PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`loading google_gmail_read connection failed: ${error.message}`);
  if (!data?.refresh_token_enc) return null;
  return gmailReadClientFor(decryptSecret(fromBytea(data.refresh_token_enc)));
}

/** What the Today's Moves button shows. Never includes the token. */
export async function getGmailSyncConnectionStatus(orgId: string): Promise<GmailSyncConnectionStatus> {
  if (!isGmailSyncClientConfigured()) return { state: "unconfigured" };
  const { data, error } = await getSupabaseAdmin()
    .from("connections")
    .select("status, meta")
    .eq("org_id", orgId)
    .eq("provider", PROVIDER)
    .eq("external_id", EXTERNAL_ID)
    .maybeSingle();
  if (error) {
    console.error("loading gmail sync connection status failed:", error.message);
    return { state: "none" };
  }
  if (!data) return { state: "none" };
  const meta = data.meta as Meta;
  return {
    state: data.status === "active" ? "active" : "error",
    accountEmail: str(meta, "account_email") ?? "",
    connectedAt: str(meta, "connected_at"),
    reason: str(meta, "error_reason"),
  };
}
