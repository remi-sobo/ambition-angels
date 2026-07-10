import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { resolveEntities } from "@/lib/admin/entities";

/**
 * Operating Spine — "Needs You" queue loader (spec #1, Phase 3).
 *
 * Reads v_action_items (the security_invoker union over the five action
 * sources) through the SESSION client, so RLS already scopes rows to the
 * caller's org and permission set — a board_viewer simply gets no ops or
 * finance rows back. On top of that this applies the entitlement gate
 * (a module explicitly disabled in org_entitlements is hidden; absent rows
 * mean enabled, matching today's default-on core modules), resolves each
 * row's linked entity through the registry, and ranks.
 *
 * Ranking is deterministic and explainable: overdue first (oldest due date
 * at the top), then due-dated items soonest-first, then undated items by
 * priority. No model calls.
 */

export type ActionItemRow = {
  org_id: string;
  source:
    | "ops_task"
    | "grant_requirement"
    | "compliance_item"
    | "acknowledgment"
    | "reconciliation_item"
    | "document_renewal"
    | "metric_stale";
  source_id: string;
  title: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  owner_ref: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  module: string;
};

export type QueueItem = {
  source: ActionItemRow["source"];
  sourceId: string;
  title: string;
  module: string;
  dueDate: string | null;
  priority: string;
  status: string;
  ownerRef: string | null;
  /** Resolved linked entity, when the row carries one the registry knows. */
  entity: { label: string; typeLabel: string; url: string | null } | null;
  /** Deep link for the row itself. */
  href: string;
};

// Where a row leads when it has no (routable) linked entity — each source's
// own surface, where the item can actually be worked.
const SOURCE_FALLBACK_HREF: Record<ActionItemRow["source"], string> = {
  ops_task: "/admin/ops",
  grant_requirement: "/admin/fundraising/grants",
  compliance_item: "/admin/compliance",
  acknowledgment: "/admin/fundraising/acknowledgments",
  reconciliation_item: "/admin/finance/reconcile",
  document_renewal: "/admin/documents",
  metric_stale: "/admin/kpis",
};

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function rank(a: QueueItem, b: QueueItem): number {
  // Due-dated before undated; then earliest due first (overdue floats up).
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate == null) return 1;
    if (b.dueDate == null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  const pa = PRIORITY_RANK[a.priority] ?? 2;
  const pb = PRIORITY_RANK[b.priority] ?? 2;
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title);
}

export const getActionQueue = cache(async (): Promise<QueueItem[]> => {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const supabase = createServerSupabase();

  const [{ data: rows }, { data: entitlements }] = await Promise.all([
    supabase
      .from("v_action_items")
      .select(
        "org_id, source, source_id, title, entity_type, entity_id, entity_label, owner_ref, due_date, priority, status, module",
      )
      .eq("org_id", ctx.orgId)
      .limit(500),
    supabase.from("org_entitlements").select("feature_key, enabled").eq("org_id", ctx.orgId),
  ]);

  const disabled = new Set(
    ((entitlements ?? []) as { feature_key: string; enabled: boolean }[])
      .filter((e) => !e.enabled)
      .map((e) => e.feature_key),
  );

  const visible = ((rows ?? []) as ActionItemRow[]).filter((r) => !disabled.has(r.module));

  // Resolve linked entities in one batched pass (rows without a link skip it).
  const linked = visible
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.entity_type != null);
  const resolved = await resolveEntities(
    linked.map(({ r }) => ({ type: r.entity_type!, id: r.entity_id, label: r.entity_label })),
  );
  const resolvedByRow = new Map(linked.map(({ i }, k) => [i, resolved[k]]));

  const items = visible.map((r, i): QueueItem => {
    const entity = resolvedByRow.get(i) ?? null;
    return {
      source: r.source,
      sourceId: r.source_id,
      title: r.title,
      module: r.module,
      dueDate: r.due_date,
      priority: r.priority,
      status: r.status,
      ownerRef: r.owner_ref,
      entity: entity ? { label: entity.label, typeLabel: entity.typeLabel, url: entity.url } : null,
      href: entity?.url ?? SOURCE_FALLBACK_HREF[r.source],
    };
  });

  return items.sort(rank);
});
