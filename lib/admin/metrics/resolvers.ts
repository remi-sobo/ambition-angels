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
};

export const RESOLVER_KEYS = Object.keys(METRIC_RESOLVERS);
