import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * When it is safe to revoke a Google grant.
 *
 * Google keeps one grant per (OAuth client, Google account). Revoking any
 * token from that grant revokes every token in it. BloomOS uses one OAuth
 * client for sign-in, Connect Gmail, Connect Calendar, the scheduler Google
 * account (/meet, lib/google/scheduler-connection.ts) and the env
 * GOOGLE_REFRESH_TOKEN the Gmail interaction sync reads with, so revoking
 * on one disconnect used to break the others for the same account (Nov 2026:
 * disconnecting Gmail silently killed that account's calendar connection, and
 * work-block deletes then failed to reach Google).
 *
 * Rule: a disconnect always deletes BloomOS's own stored token. It revokes
 * the grant at Google only when nothing else BloomOS holds uses that account.
 * When it can't tell, it doesn't revoke; the person can still remove the
 * grant at myaccount.google.com/permissions.
 */

export const GOOGLE_PROVIDERS = ["google_gmail", "google_calendar", "google_scheduler"] as const;

export type GrantRow = {
  id: string;
  status: string | null;
  meta: Record<string, unknown> | null;
};

const norm = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase() : "");

/** Pure decision, exported for tests. True when the account's grant must stay. */
export function googleAccountStillInUse(args: {
  accountEmail: string | null;
  /** Connection rows being removed by this disconnect. */
  excludeIds: string[];
  /** Every google_gmail / google_calendar / google_scheduler connection row. */
  rows: GrantRow[];
  /** Mailbox the env GOOGLE_REFRESH_TOKEN belongs to, if known. */
  envAccountEmail: string | null;
  envTokenConfigured: boolean;
}): boolean {
  const email = norm(args.accountEmail);
  if (!email) return true; // unknown account: don't risk another connection

  const exclude = new Set(args.excludeIds);
  const otherConnection = args.rows.some(
    (r) =>
      !exclude.has(r.id) &&
      (r.status === "active" || r.status === "pending") &&
      norm(r.meta?.account_email) === email
  );
  if (otherConnection) return true;

  if (args.envTokenConfigured) {
    const env = norm(args.envAccountEmail);
    if (!env || env === email) return true;
  }
  return false;
}

/** True when the disconnect may revoke the account's grant at Google. */
export async function mayRevokeGoogleGrant(
  accountEmail: string | null,
  excludeIds: string[]
): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("connections")
    .select("id, status, meta")
    .in("provider", [...GOOGLE_PROVIDERS]);
  if (error) {
    console.error("checking google grant use failed (not revoking):", error.message);
    return false;
  }

  const envTokenConfigured = !!process.env.GOOGLE_REFRESH_TOKEN;
  let envAccountEmail: string | null = null;
  if (envTokenConfigured) {
    // The env token's mailbox is recorded on every Gmail sync run.
    const { data: job } = await sb
      .from("gmail_sync_jobs")
      .select("mailbox")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    envAccountEmail = (job?.mailbox as string | null) ?? null;
  }

  return !googleAccountStillInUse({
    accountEmail,
    excludeIds,
    rows: (data ?? []) as GrantRow[],
    envAccountEmail,
    envTokenConfigured,
  });
}
