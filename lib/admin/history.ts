import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Record history straight from the audit_log ledger (Ring 1) — every admin
 * API already writes there, so profile pages get a change timeline with no
 * extra bookkeeping. Server-side only: reads go through the service-role
 * client, so callers MUST pass the session org's id (the org fence).
 */

export type HistoryEvent = {
  id: number;
  ts: string;
  action: string;
  actorName: string | null;
  /** The update patch (or insert) the API recorded — what changed. */
  after: Record<string, unknown> | null;
};

export async function getEntityHistory(
  orgId: string,
  entityType: string,
  entityId: string,
  limit = 30
): Promise<HistoryEvent[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("audit_log")
    .select("id, ts, action, actor_user_id, after")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("ts", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as Array<{
    id: number;
    ts: string;
    action: string;
    actor_user_id: string | null;
    after: Record<string, unknown> | null;
  }>;

  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => !!v))
  );
  const names: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", actorIds);
    for (const p of profiles ?? []) {
      const name = (p.display_name as string | null)?.trim();
      if (name) names[p.user_id as string] = name;
    }
  }

  return rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    action: r.action,
    actorName: r.actor_user_id ? names[r.actor_user_id] ?? null : null,
    after: r.after,
  }));
}
