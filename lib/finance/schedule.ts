/**
 * Revenue schedule read layer (spec: bloomosrevenueschedule.md, Phase 2).
 *
 * `v_revenue_schedule` is the single dated read surface over every expected
 * inflow (pledges, awarded grants, weighted pipeline, manual commitments).
 * Finance runway, the revenue page, the pledges page and Horizon all read it,
 * so the four representations of incoming money can never disagree again.
 *
 * This module is the typed loader + the small pure transforms that turn the
 * schedule into the shapes the existing finance code already speaks (the
 * source-agnostic RunwayPledge list, source rollups, a restricted carve-out).
 * Kept DB-light and degrade-safe: a missing view (a tenant where the migration
 * hasn't landed) returns an empty schedule rather than crashing a finance page.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunwayPledge } from "@/lib/finance/runway";

export type RevenueConfidence = "committed" | "projected";
export type RevenueSourceType = "pledge" | "grant" | "pipeline" | "manual";

export type RevenueScheduleRow = {
  source_type: RevenueSourceType;
  source_id: string;
  parent_id: string;
  label: string;
  /** First of the month (YYYY-MM-DD) the inflow is expected. */
  month: string;
  /** The actual expected date (YYYY-MM-DD). */
  due_date: string;
  gross_amount: number;
  /** committed: = gross. pipeline: ask × probability%. */
  weighted_amount: number;
  confidence: RevenueConfidence;
  restricted: boolean;
  restricted_to: string | null;
  status: string;
  /** Awarded grant counted as a lump because it has no tranche schedule yet. */
  needs_schedule: boolean;
};

const num = (v: unknown) => Number(v ?? 0);

/**
 * Load the canonical schedule. `client` is whatever caller has — the
 * service-role admin client on the finance dashboard, or an RLS-scoped client
 * elsewhere; the view's security_invoker means each sees only its own rows.
 */
export async function loadRevenueSchedule(
  client: SupabaseClient
): Promise<RevenueScheduleRow[]> {
  const { data, error } = await client
    .from("v_revenue_schedule")
    .select(
      "source_type, source_id, parent_id, label, month, due_date, gross_amount, weighted_amount, confidence, restricted, restricted_to, status, needs_schedule"
    );
  if (error) {
    // Degrade gracefully — a finance page should still render if the view is
    // absent (migration not yet applied for this tenant).
    console.error("[finance] v_revenue_schedule load failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    source_type: r.source_type as RevenueSourceType,
    source_id: r.source_id as string,
    parent_id: r.parent_id as string,
    label: (r.label as string) ?? "",
    month: r.month as string,
    due_date: r.due_date as string,
    gross_amount: num(r.gross_amount),
    weighted_amount: num(r.weighted_amount),
    confidence: r.confidence as RevenueConfidence,
    restricted: Boolean(r.restricted),
    restricted_to: (r.restricted_to as string | null) ?? null,
    status: (r.status as string) ?? "",
    needs_schedule: Boolean(r.needs_schedule),
  }));
}

/**
 * Map schedule rows into the runway's source-agnostic pledge list. Committed
 * inflows carry full value (a commitment is a commitment); projected pipeline
 * carries its probability-weighted value, so the runway's projected tier reads
 * the honest expected number rather than the full ask. Restriction flows
 * straight through — summarizePledges drops restricted from every tier.
 */
export function scheduleToRunwayPledges(rows: RevenueScheduleRow[]): RunwayPledge[] {
  return rows.map((r) => ({
    amount: r.confidence === "committed" ? r.gross_amount : r.weighted_amount,
    status: r.confidence === "committed" ? "secured" : "projected",
    expected_date: r.due_date,
    restricted: r.restricted,
  }));
}

export type ScheduleRollup = {
  /** Committed (pledges, awarded grants, manual secured), unrestricted. */
  committed: number;
  /** Projected pipeline, probability-weighted, unrestricted. */
  projectedWeighted: number;
  /** Committed + projected restricted inflows, carved out of every runway tier. */
  restricted: number;
  /** Awarded grants still counted as a lump because they want tranching. */
  needsScheduleCount: number;
};

/** One pass producing the headline rollups the finance surfaces show. */
export function rollupSchedule(rows: RevenueScheduleRow[]): ScheduleRollup {
  let committed = 0;
  let projectedWeighted = 0;
  let restricted = 0;
  let needsScheduleCount = 0;
  for (const r of rows) {
    if (r.restricted) {
      restricted += r.confidence === "committed" ? r.gross_amount : r.weighted_amount;
    } else if (r.confidence === "committed") {
      committed += r.gross_amount;
    } else {
      projectedWeighted += r.weighted_amount;
    }
    if (r.needs_schedule) needsScheduleCount += 1;
  }
  return { committed, projectedWeighted, restricted, needsScheduleCount };
}
