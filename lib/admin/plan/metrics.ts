import type { SupabaseClient } from "@supabase/supabase-js";
import { FINANCE } from "@/lib/admin/thresholds";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import {
  computeSecuredFy,
  computeWeightedPipeline,
  computeCorporateRaisedFy,
  computeRunwayMonths,
} from "@/lib/admin/strategy/money";
import { getEngagedStageKeys } from "@/lib/admin/program/stages";

/**
 * BloomOS Strategy, Phase 3 — the auto-metric registry (specs/bloomos-strategy.md).
 *
 * Maps a plan_kpis.metric_key to a function that computes the KPI's current
 * value for an org from real BloomOS data. This is what keeps the strategy
 * alive: fundraising and program KPIs read true numbers with nobody typing
 * them. No AI, no per-page-load work — plain org-scoped counts and sums, run on
 * the monthly/weekly refresh (the button on the plan page + the weekly cron).
 *
 * Only the metrics a system can actually know live here. The rest
 * (fos_baseline, discovery_interviews_done, processes_documented,
 * filings_on_time, …) stay source='manual' and are entered at the review.
 */

const YEAR = new Date().getUTCFullYear();
const yearStartTs = `${YEAR}-01-01T00:00:00Z`;

const sumField = <T,>(rows: T[] | null, field: keyof T): number =>
  (rows ?? []).reduce((s, r) => s + Number((r[field] as unknown as number) ?? 0), 0);

export type PlanMetricFn = (supabase: SupabaseClient, orgId: string) => Promise<number | null>;

export const PLAN_METRICS: Record<string, PlanMetricFn> = {
  // Grant dollars secured this year — grants that reached an awarded/active/
  // closed stage. Mirrors lib/kpis.ts `grants_awarded_ytd`.
  dollars_raised_grants_ytd: async (s, org) => {
    const { data } = await s
      .from("grants")
      .select("amount_awarded")
      .eq("org_id", org)
      .in("stage", ["awarded", "active", "closed"])
      .gte("updated_at", yearStartTs)
      .limit(2000);
    return sumField(data as { amount_awarded: number | null }[] | null, "amount_awarded");
  },

  // Grant applications submitted this year — any grant that reached the
  // submitted stage or beyond. No submitted_at column exists, so updated_at
  // within the year is the proxy (same approximation lib/kpis.ts uses).
  grants_submitted_ytd: async (s, org) => {
    const { count } = await s
      .from("grants")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org)
      .in("stage", ["submitted", "awarded", "declined", "active", "closed"])
      .gte("updated_at", yearStartTs);
    return count ?? 0;
  },

  // Corporate dollars secured this year — major-gift opportunities that reached
  // stewardship (i.e. closed/secured) whose constituent is an organization.
  // opportunities has no type column, so we resolve "corporate" through the
  // org-type constituent. (Honest best-effort; revisit if AA wants a dedicated
  // corporate flag.)
  corporate_dollars_ytd: async (s, org) => {
    const { data: orgConstituents } = await s
      .from("constituents")
      .select("id")
      .eq("org_id", org)
      .eq("type", "organization")
      .limit(5000);
    const ids = (orgConstituents ?? []).map((c) => (c as { id: string }).id);
    if (ids.length === 0) return 0;
    const { data } = await s
      .from("opportunities")
      .select("ask_amount")
      .eq("org_id", org)
      .eq("stage", "steward")
      .in("constituent_id", ids)
      .gte("updated_at", yearStartTs)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .limit(2000);
    return sumField(data as { ask_amount: number | null }[] | null, "ask_amount");
  },

  // Donor updates sent this year — one sent email campaign = one update,
  // regardless of recipient count. email_campaigns is the canonical source for
  // strategic donor communications (not every row in `interactions`).
  donor_updates_sent_ytd: async (s, org) => {
    const { count } = await s
      .from("email_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org)
      .eq("status", "sent")
      .gte("sent_at", yearStartTs);
    return count ?? 0;
  },

  // Active participants — students in an engaged journey stage. Which stages
  // count as "engaged" is per-org DATA (participant_stages, program spine
  // spec #4), not a hardcoded list; getEngagedStageKeys falls back to the
  // starter template if an org has no rows.
  active_teens: async (s, org) => {
    const engaged = await getEngagedStageKeys(s, org);
    const { count } = await s
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org)
      .in("stage", engaged);
    return count ?? 0;
  },

  // ── Money metrics (2026 OGSM) — computed from the shared money module, the
  // same functions the Strategy Narrative reads, so the scorecard and the
  // narrative never disagree. One dollar, one state.
  // Raised toward the committed floor — Σ gifts received this fiscal year.
  dollars_raised_fy26: (s, org) => computeSecuredFy(s, org),
  // Raised toward the ceiling — the SAME secured dollars, measured against the
  // stretch target. Bound to the identical source so "raised toward floor" and
  // "raised toward ceiling" can never disagree (they did: $198,309 vs $196,310).
  dollars_ceiling_fy26: (s, org) => computeSecuredFy(s, org),
  // Weighted pipeline — Σ open-stage ask × probability (excludes steward/lost/won).
  weighted_pipeline_fy26: (s, org) => computeWeightedPipeline(s, org),
  // Corporate raised — Σ gifts this fiscal year from organization-type donors.
  corporate_raised: (s, org) => computeCorporateRaisedFy(s, org),
  // Cash runway — cash on hand ÷ monthly burn, from the canonical finance snapshot.
  cash_runway_months: () => computeRunwayMonths(),
};

/**
 * Per-metric health overrides. Most auto metrics are YTD-accumulating ("up is
 * good", paced by fraction-of-year — see kpiHealth). A few are point-in-time
 * levels where pacing makes no sense; they read their status from the central
 * thresholds instead. Falls back to kpiHealth when a key isn't listed here.
 */
export const PLAN_METRIC_HEALTH: Record<string, (value: number, target: number | null) => string> = {
  // Runway is a level, not a YTD accumulation: read the finance cutoffs directly.
  cash_runway_months: (v) =>
    v <= FINANCE.runwayCriticalMonths ? "behind" : v <= FINANCE.runwayWatchMonths ? "at_risk" : "on_track",
};

/**
 * Health for an auto KPI from its current value vs target, time-paced so a
 * year-to-date number isn't unfairly flagged mid-year. "On pace" compares
 * current against (target × fraction-of-year-elapsed). All auto metrics here
 * are "up is good".
 */
export function kpiHealth(current: number, target: number | null): string {
  if (target === null || target <= 0) return "not_started";
  if (current >= target) return "on_track"; // target already met
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const end = Date.UTC(now.getUTCFullYear() + 1, 0, 1);
  const frac = Math.max((now.getTime() - start) / (end - start), 0.01);
  if (current === 0 && frac < 0.1) return "not_started";
  const ratio = current / (target * frac);
  if (ratio >= 0.9) return "on_track";
  if (ratio >= 0.6) return "at_risk";
  return "behind";
}

export type RefreshResult = { updated: number; results: { key: string; value: number }[] };

/**
 * Recompute every auto KPI for one org and write current + last_updated_at +
 * derived status. Pass a service-role client (the caller authorizes). A null
 * computed value (metric not wired or source missing) is skipped, leaving the
 * prior value untouched.
 */
export async function refreshOrgPlanMetrics(
  supabase: SupabaseClient,
  orgId: string
): Promise<RefreshResult> {
  const { data: kpis } = await supabase
    .from("plan_kpis")
    .select("id, metric_key, target, metric_id")
    .eq("org_id", orgId)
    .eq("source", "auto")
    .not("metric_key", "is", null);

  const results: { key: string; value: number }[] = [];
  for (const k of (kpis ?? []) as { id: string; metric_key: string; target: number | null; metric_id: string | null }[]) {
    const fn = PLAN_METRICS[k.metric_key];
    if (!fn) continue;
    const value = await fn(supabase, orgId);
    if (value === null) continue;
    const { error } = await supabase
      .from("plan_kpis")
      .update({
        current: value,
        last_updated_at: new Date().toISOString(),
        status: (PLAN_METRIC_HEALTH[k.metric_key] ?? kpiHealth)(value, k.target),
      })
      .eq("id", k.id)
      .eq("org_id", orgId);
    if (!error) {
      results.push({ key: k.metric_key, value });
      // Record a daily snapshot so the scorecard can draw the trend.
      await supabase
        .from("plan_kpi_snapshots")
        .upsert(
          { org_id: orgId, kpi_id: k.id, captured_on: new Date().toISOString().slice(0, 10), value },
          { onConflict: "kpi_id,captured_on" }
        );
      // Mirror into the Metric Catalog's one history table. This function is
      // the single writer for both sides of a plan-linked metric, so
      // plan_kpis.current and the catalog's latest snapshot cannot diverge
      // (the spec's transition failure mode).
      if (k.metric_id) {
        await supabase
          .from("metric_snapshots")
          .upsert(
            { org_id: orgId, metric_id: k.metric_id, captured_on: new Date().toISOString().slice(0, 10), value },
            { onConflict: "metric_id,captured_on" }
          );
      }
    }
  }
  return { updated: results.length, results };
}

/**
 * Refresh auto KPIs across every org that has them — for the weekly cron, which
 * runs without a session. Service-role client required.
 */
export async function refreshAllPlanMetrics(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("plan_kpis")
    .select("org_id")
    .eq("source", "auto")
    .not("metric_key", "is", null);
  const orgIds = Array.from(new Set(((data ?? []) as { org_id: string }[]).map((r) => r.org_id)));
  let total = 0;
  for (const org of orgIds) total += (await refreshOrgPlanMetrics(supabase, org)).updated;
  return total;
}

// The metric_keys this registry can compute — handy for UI hints.
export const AUTO_METRIC_KEYS = Object.keys(PLAN_METRICS);

// ── Metrics Library (Phase C) ───────────────────────────────────────────────
// Display metadata for the bindable metrics, so the KPI editor's "Track
// automatically" picker and the Unassigned tray can render a label, a unit, and
// a live preview value. Only the metrics this registry can actually refresh are
// offered — binding to one always yields a number that stays live (never a
// fake "auto" badge on a value nothing updates).

export type PlanMetricMeta = { label: string; unit: string; hint?: string };

export const PLAN_METRIC_META: Record<string, PlanMetricMeta> = {
  dollars_raised_grants_ytd: { label: "Grant dollars raised (YTD)", unit: "$" },
  grants_submitted_ytd: { label: "Grant applications submitted (YTD)", unit: "" },
  corporate_dollars_ytd: { label: "Corporate dollars secured (YTD)", unit: "$" },
  donor_updates_sent_ytd: { label: "Donor updates sent (YTD)", unit: "" },
  active_teens: { label: "Active teens", unit: "" },
  dollars_raised_fy26: { label: "Raised toward the committed floor", unit: "$" },
  dollars_ceiling_fy26: { label: "Raised toward the ceiling", unit: "$" },
  weighted_pipeline_fy26: { label: "Weighted pipeline (FY26)", unit: "$" },
  corporate_raised: { label: "Corporate raised", unit: "$" },
  cash_runway_months: { label: "Cash runway (months)", unit: "months" },
};

export type PlanMetricOption = {
  key: string;
  label: string;
  unit: string;
  /** Live value now, or null if it couldn't be computed. */
  value: number | null;
  /** Already attached to a plan KPI in this org. */
  bound: boolean;
};

/** Every bindable metric with its live value and whether it's already attached. */
export async function getPlanMetricOptions(
  supabase: SupabaseClient,
  orgId: string,
): Promise<PlanMetricOption[]> {
  const { data } = await supabase
    .from("plan_kpis")
    .select("metric_key")
    .eq("org_id", orgId)
    .not("metric_key", "is", null);
  const bound = new Set(
    ((data ?? []) as { metric_key: string | null }[]).map((r) => r.metric_key).filter((k): k is string => !!k),
  );
  return Promise.all(
    Object.keys(PLAN_METRICS).map(async (key) => {
      const meta = PLAN_METRIC_META[key] ?? { label: key, unit: "" };
      let value: number | null = null;
      try {
        value = await PLAN_METRICS[key](supabase, orgId);
      } catch {
        value = null;
      }
      return { key, label: meta.label, unit: meta.unit, value, bound: bound.has(key) };
    }),
  );
}

/** Bindable metrics not yet attached to any goal — the Unassigned vital signs tray. */
export async function getUnassignedPlanMetrics(
  supabase: SupabaseClient,
  orgId: string,
): Promise<PlanMetricOption[]> {
  return (await getPlanMetricOptions(supabase, orgId)).filter((m) => !m.bound);
}
