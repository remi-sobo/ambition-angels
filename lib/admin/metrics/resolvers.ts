import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_METRICS, type PlanMetricFn } from "@/lib/admin/plan/metrics";
import { getFinanceSnapshot } from "@/lib/admin/finance";

/**
 * Metric Catalog — the source_key resolver registry (spec #3, Phase 3).
 *
 * source_key → resolver. GLOBAL CODE, ZERO TENANT CONDITIONALS: a tenant's
 * catalog (metric_definitions) is their data; what a source_key means is
 * shipped once for everyone here.
 *
 * This registry ABSORBS the existing PLAN_METRICS registry rather than
 * becoming a third one (Phase 0 recon: BloomOS already had two — PLAN_METRICS
 * org-scoped and healthy, and the org-blind lib/kpis.ts, now fully retired).
 * Every resolver reuses a canonical computation; none invents a formula:
 * cash_runway_months and monthly_burn read the same getFinanceSnapshot() the
 * Command Center status line reads, so the hub and the status line can never disagree
 * on runway (pinned by tests/metrics.test.ts).
 */

export type MetricResolver = PlanMetricFn; // (supabase, orgId) => Promise<number | null>

export const METRIC_RESOLVERS: Record<string, MetricResolver> = {
  // The nine plan-linked computed metrics, verbatim.
  ...PLAN_METRICS,

  // Trailing 3-active-month average monthly expense — the exact burn the
  // status line and the Finance dashboard show.
  monthly_burn: async () => {
    const fin = await getFinanceSnapshot();
    return fin.burn3mo ?? null;
  },

  // Gifts received month-to-date, org-scoped.
  gifts_this_month: async (s: SupabaseClient, orgId: string) => {
    const monthStart = `${new Date().toISOString().slice(0, 8)}01`;
    const { count } = await s
      .from("gifts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("gift_date", monthStart);
    return count ?? 0;
  },

  // Contract 2 seed (A6): distinct students enrolled in an ACTIVE cohort —
  // "teens on a facilitated roster, current term". Same membership read the
  // Groups page rolls up (cohort_members.status='enrolled'), scoped to
  // status='active' cohorts because "current term" is what the metric asks.
  enrolled_in_cohort: async (s: SupabaseClient, orgId: string) => {
    const { data: cohorts } = await s
      .from("cohorts")
      .select("id")
      .eq("org_id", orgId)
      .eq("status", "active");
    const ids = (cohorts ?? []).map((c) => c.id as string);
    if (ids.length === 0) return 0;
    const { data: members } = await s
      .from("cohort_members")
      .select("student_id")
      .eq("org_id", orgId)
      .eq("status", "enrolled")
      .in("cohort_id", ids);
    return new Set((members ?? []).map((m) => m.student_id as string)).size;
  },

  // Contract 2 seed (A6): attendance rate over the trailing 3 weeks, active
  // cohorts, held sessions — by the HOUSE rule (app/admin/cohorts/_lib/
  // rollups.ts): (present + late) / (present + late + absent); excused and
  // unmarked never count against anyone. Returns a 0–100 pct (unit 'pct'),
  // null when no countable marks exist in the window (an honest gap, not 0%).
  attendance_rate: async (s: SupabaseClient, orgId: string) => {
    const windowStart = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
    const { data: cohorts } = await s
      .from("cohorts")
      .select("id")
      .eq("org_id", orgId)
      .eq("status", "active");
    const cohortIds = (cohorts ?? []).map((c) => c.id as string);
    if (cohortIds.length === 0) return null;
    const { data: sessions } = await s
      .from("cohort_sessions")
      .select("id")
      .eq("org_id", orgId)
      .eq("status", "held")
      .gte("session_date", windowStart)
      .in("cohort_id", cohortIds);
    const sessionIds = (sessions ?? []).map((x) => x.id as string);
    if (sessionIds.length === 0) return null;
    const { data: marks } = await s
      .from("attendance")
      .select("status")
      .eq("org_id", orgId)
      .in("session_id", sessionIds);
    let attended = 0;
    let absent = 0;
    for (const m of marks ?? []) {
      if (m.status === "present" || m.status === "late") attended++;
      else if (m.status === "absent") absent++;
    }
    const counted = attended + absent;
    return counted > 0 ? (attended / counted) * 100 : null;
  },
};

export const RESOLVER_KEYS = Object.keys(METRIC_RESOLVERS);
