import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Application audit log writer (BloomOS Ring 1).
 *
 * Appends to the partitioned audit_log table created by
 * supabase/migrations/create_audit_log.sql — the FERPA §99.32 disclosure
 * ledger. Writes go through the service-role client (clients never insert
 * directly; the table is append-only for app roles).
 *
 * Failure policy: auditing must never break the audited request. Every
 * error is swallowed and logged to console for the platform logs.
 *
 * Action naming: dotted domain.entity.verb — 'auth.login',
 * 'finance.rule.delete', 'program.attendance.record'. Keep verbs aligned
 * with the audit_log.action comment (create/update/delete/export/…).
 */

type AuditEntry = {
  action: string;
  entityType: string;
  /** Must be a UUID (column type) — put non-UUID identifiers in `after`. */
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  /**
   * Omit to attribute to the current session (the normal case).
   * Pass explicitly (or null) when there is no usable session yet —
   * e.g. login attempts, where the request cookies predate the sign-in.
   */
  actorUserId?: string | null;
};

// The resident tenant, for events that happen outside any session (failed
// logins). Cached for the lifetime of the lambda.
let residentOrg: string | null = null;
async function residentOrgId(): Promise<string | null> {
  if (residentOrg) return residentOrg;
  const { data } = await getSupabaseAdmin()
    .from("orgs")
    .select("id")
    .eq("slug", "ambition-angels")
    .maybeSingle();
  residentOrg = (data?.id as string | undefined) ?? null;
  return residentOrg;
}

// Good-enough guard so a malformed X-Forwarded-For can't fail the insert
// against the inet column.
const IP_SHAPE = /^[0-9a-fA-F:.]+$/;

export async function audit(req: NextRequest | null, entry: AuditEntry): Promise<void> {
  try {
    let actor: string | null = null;
    let orgId: string | null = null;
    if (entry.actorUserId === undefined) {
      const ctx = await getOrgContext().catch(() => null);
      actor = ctx?.userId ?? null;
      orgId = ctx?.orgId ?? null;
    } else {
      actor = entry.actorUserId;
    }
    orgId = orgId ?? (await residentOrgId());
    if (!orgId) return; // nothing sane to attribute the event to

    const fwd = req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const { error } = await getSupabaseAdmin().from("audit_log").insert({
      org_id: orgId,
      actor_user_id: actor,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: IP_SHAPE.test(fwd) ? fwd : null,
      user_agent: req?.headers.get("user-agent")?.slice(0, 500) ?? null,
      request_id: req?.headers.get("x-vercel-id") ?? null,
    });
    if (error) console.error("audit_log insert failed:", error.message);
  } catch (e) {
    console.error("audit_log write failed:", e);
  }
}
