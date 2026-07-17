/**
 * The money math — ONE place the fundraising dollars are computed, so a dollar
 * is counted in exactly one state and every surface agrees (spec: "one shared
 * computation module for the money math, reused by this surface and any forecast
 * view"). The Strategy Narrative reads these; the auto-metric registry
 * (lib/admin/plan/metrics.ts) refreshes the scorecard KPIs from the same
 * functions — so the scorecard, the plan, and the narrative can never drift.
 *
 * One dollar, one state: the weighted pipeline whitelists open stages only;
 * steward / lost / won are excluded by construction (never double-counted
 * against realized gifts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFinanceSnapshot, fiscalYearBounds } from "@/lib/admin/finance";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { OPEN_STAGE_KEYS } from "@/lib/fundraising/stage-sets";

/** Open stages across both taxonomies (legacy funnel + ten-stage Sales). */
export const MONEY_OPEN_STAGES = OPEN_STAGE_KEYS;

/** Fiscal-year bounds for an org, from its fin_config (defaults to calendar). */
async function fyBounds(sb: SupabaseClient, orgId: string): Promise<{ start: string; end: string }> {
  const { data } = await sb
    .from("fin_config")
    .select("current_year, fiscal_year_start_month")
    .eq("org_id", orgId)
    .maybeSingle();
  const year = typeof data?.current_year === "number" ? data.current_year : new Date().getUTCFullYear();
  const sm = typeof data?.fiscal_year_start_month === "number" ? data.fiscal_year_start_month : 1;
  return fiscalYearBounds(year, sm);
}

/** Realized dollars: Σ gifts received this fiscal year. */
export async function computeSecuredFy(sb: SupabaseClient, orgId: string): Promise<number> {
  const fy = await fyBounds(sb, orgId);
  const { data } = await sb
    .from("gifts")
    .select("amount")
    .eq("org_id", orgId)
    .gte("gift_date", fy.start)
    .lte("gift_date", fy.end);
  return (data ?? []).reduce((s, g) => s + Number((g as { amount: number | null }).amount ?? 0), 0);
}

/** Open-weighted dollars: Σ open-stage ask × probability/100. Excludes steward/lost/won. */
export async function computeWeightedPipeline(sb: SupabaseClient, orgId: string): Promise<number> {
  const { data } = await sb
    .from("opportunities")
    .select("ask_amount, probability")
    .eq("org_id", orgId)
    .in("stage", MONEY_OPEN_STAGES as unknown as string[])
    .or(EXCLUDE_PARTNERSHIP_OPPS);
  return (data ?? []).reduce((s, o) => {
    const r = o as { ask_amount: number | null; probability: number | null };
    const p = r.probability == null ? 50 : Number(r.probability);
    return s + Number(r.ask_amount ?? 0) * (p / 100);
  }, 0);
}

/** Corporate raised: Σ gifts this fiscal year from organization-type donors. */
export async function computeCorporateRaisedFy(sb: SupabaseClient, orgId: string): Promise<number> {
  const fy = await fyBounds(sb, orgId);
  const [giftsRes, orgsRes] = await Promise.all([
    sb.from("gifts").select("amount, constituent_id").eq("org_id", orgId).gte("gift_date", fy.start).lte("gift_date", fy.end),
    sb.from("constituents").select("id").eq("org_id", orgId).eq("type", "organization").limit(20000),
  ]);
  const orgIds = new Set((orgsRes.data ?? []).map((c) => (c as { id: string }).id));
  return (giftsRes.data ?? []).reduce((s, g) => {
    const r = g as { amount: number | null; constituent_id: string | null };
    return r.constituent_id && orgIds.has(r.constituent_id) ? s + Number(r.amount ?? 0) : s;
  }, 0);
}

/** Cash runway in months, from the canonical finance snapshot (cash ÷ burn). */
export async function computeRunwayMonths(): Promise<number | null> {
  const fin = await getFinanceSnapshot();
  return fin.runwayMonths;
}
