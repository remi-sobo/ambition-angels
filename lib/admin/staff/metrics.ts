import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * BloomOS Staff — the personal auto-KPI registry (specs/bloomos-staff.md, Phase 2).
 *
 * The BloomOS advantage: because the app is the system of record, many personal
 * KPIs don't need to be hand-entered. A staff_kpis row with source='auto' and a
 * linked_metric_key reads its value straight from the spine on refresh — no one
 * types it. For a CEO/ED the personal KPI often IS an org number (runway,
 * dollars raised), so these keys map onto the strategy metric resolvers
 * (lib/admin/plan/metrics.ts) rather than duplicating them.
 *
 * STAFF_METRIC_META (the curated key list) is the pure, import-clean source of
 * truth — client props and tests read it. The heavy resolver registry is pulled
 * in only at refresh time via a dynamic import, so this module (and every route
 * that validates a key) stays free of the strategy module's server-only,
 * React-cache-wrapped finance code.
 */

export type StaffMetricMeta = { label: string; unit: string; direction: "up" | "down" };

/** Curated keys a person can bind a KPI to. All resolve org-scoped from the spine. */
export const STAFF_METRIC_META: Record<string, StaffMetricMeta> = {
  cash_runway_months: { label: "Months of runway", unit: "months", direction: "up" },
  dollars_raised_fy26: { label: "Dollars raised (FY26)", unit: "usd", direction: "up" },
  weighted_pipeline_fy26: { label: "Weighted pipeline (FY26)", unit: "usd", direction: "up" },
  corporate_raised: { label: "Corporate raised (FY26)", unit: "usd", direction: "up" },
  grants_submitted_ytd: { label: "Grants submitted (YTD)", unit: "count", direction: "up" },
  donor_updates_sent_ytd: { label: "Donor updates sent (YTD)", unit: "count", direction: "up" },
  active_teens: { label: "Active teens", unit: "count", direction: "up" },
};

export const isAutoMetricKey = (key: string | null | undefined): key is string =>
  !!key && key in STAFF_METRIC_META;

/**
 * Health from a value vs target. Auto or manual, a KPI with a target reads its
 * status by how close it is (up-is-good ratio); without a target it can only be
 * "on track once it has a value". Mirrors the plan health scale so a staff KPI
 * chip means the same as every other chip.
 */
export function kpiStatusFor(
  current: number | null,
  target: number | null,
  direction: "up" | "down" = "up"
): string {
  if (current == null) return "not_started";
  if (target == null || target === 0) return "on_track";
  const ratio = direction === "up" ? current / target : target / current;
  if (ratio >= 1) return "done";
  if (ratio >= 0.7) return "on_track";
  if (ratio >= 0.4) return "at_risk";
  return "behind";
}

export type StaffKpiRow = {
  id: string;
  org_id: string;
  staff_id: string;
  target: number | null;
  source: string;
  linked_metric_key: string | null;
};

/**
 * Recompute every auto KPI for a staff member from the spine, on the SESSION
 * client (RLS gates which KPIs the caller may touch). For each: compute the new
 * value, write current + last_updated_at + derived status, and upsert today's
 * snapshot so the trend line grows. Returns how many were refreshed.
 */
export async function refreshStaffKpis(
  supabase: SupabaseClient,
  staffId: string,
  today: string
): Promise<number> {
  const { data } = await supabase
    .from("staff_kpis")
    .select("id, org_id, staff_id, target, source, linked_metric_key")
    .eq("staff_id", staffId)
    .eq("source", "auto");

  const rows = (data ?? []) as StaffKpiRow[];
  if (rows.length === 0) return 0;

  // Pull the strategy resolvers only now (they carry server-only finance code).
  const { PLAN_METRICS } = await import("@/lib/admin/plan/metrics");
  let refreshed = 0;

  for (const kpi of rows) {
    if (!isAutoMetricKey(kpi.linked_metric_key)) continue;
    const resolver = PLAN_METRICS[kpi.linked_metric_key];
    if (!resolver) continue; // advertised in META but no resolver — skip, don't guess
    const value = await resolver(supabase, kpi.org_id);
    if (value == null) continue;

    const meta = STAFF_METRIC_META[kpi.linked_metric_key];
    const status = kpiStatusFor(value, kpi.target, meta?.direction ?? "up");
    const nowIso = `${today}T00:00:00Z`;

    const { error: upErr } = await supabase
      .from("staff_kpis")
      .update({ current: value, status, last_updated_at: nowIso })
      .eq("id", kpi.id);
    if (upErr) continue;

    await supabase
      .from("staff_kpi_snapshots")
      .upsert(
        { org_id: kpi.org_id, kpi_id: kpi.id, captured_on: today, value },
        { onConflict: "kpi_id,captured_on" }
      );
    refreshed += 1;
  }
  return refreshed;
}
