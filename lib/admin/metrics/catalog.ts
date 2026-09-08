import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { METRIC_RESOLVERS } from "./resolvers";
import { isStale } from "./staleness";

/**
 * Metric Catalog reads + computed capture (spec #3). Freshness rules live in
 * ./staleness (pure, shared with tests and mirrored by the SQL queue arm).
 */

export { STALE_AFTER_DAYS, staleAfter, isStale } from "./staleness";

export type CatalogMetric = {
  id: string;
  metric_key: string;
  name: string;
  description: string | null;
  department: string | null;
  unit: string | null;
  direction: "up" | "down";
  cadence: string;
  source_kind: "manual" | "computed";
  source_key: string | null;
  /** Contract 2 classification (A1 column). NULL = not yet classified —
   *  pre-contract rows stay honest rather than being asserted confirmed.
   *  'conflict' | 'stale' block export under Contract 7 (A5 gate). */
  confirmed_state: "confirmed" | "unconfirmed" | "conflict" | "stale" | null;
  target: number | null;
  baseline: number | null;
  owner_id: string | null;
  active: boolean;
  latest: { value: number; captured_on: string } | null;
  stale: boolean;
  /** Computed definition with no registered resolver (or no source_key):
   *  its value can never refresh. A finding, surfaced everywhere the catalog
   *  renders (Contract 2, A4) — never a silent no-op. */
  unresolved: boolean;
  /** Oldest→newest, for trend sparks. */
  history: { captured_on: string; value: number }[];
};

/**
 * The org's catalog with latest value, freshness, and spark history — read
 * through the SESSION client so metrics.read RLS applies (board_viewer
 * included, open decision D).
 */
export const getMetricCatalog = cache(async (): Promise<CatalogMetric[]> => {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const supabase = createServerSupabase();

  const [{ data: defs }, { data: snaps }] = await Promise.all([
    supabase
      .from("metric_definitions")
      .select(
        "id, metric_key, name, description, department, unit, direction, cadence, source_kind, source_key, confirmed_state, target, baseline, owner_id, active",
      )
      .eq("org_id", ctx.orgId)
      .order("department")
      .order("name"),
    supabase
      .from("metric_snapshots")
      .select("metric_id, captured_on, value")
      .eq("org_id", ctx.orgId)
      .order("captured_on", { ascending: false })
      .limit(3000),
  ]);

  const historyByMetric = new Map<string, { captured_on: string; value: number }[]>();
  for (const s of (snaps ?? []) as { metric_id: string; captured_on: string; value: number }[]) {
    const list = historyByMetric.get(s.metric_id) ?? [];
    if (list.length < 26) list.push({ captured_on: s.captured_on, value: Number(s.value) });
    historyByMetric.set(s.metric_id, list);
  }

  return ((defs ?? []) as Omit<CatalogMetric, "latest" | "stale" | "history">[]).map((d) => {
    const desc = historyByMetric.get(d.id) ?? []; // newest first
    const latest = desc[0] ?? null;
    return {
      ...d,
      target: d.target != null ? Number(d.target) : null,
      baseline: d.baseline != null ? Number(d.baseline) : null,
      latest,
      stale: d.active ? isStale(latest?.captured_on ?? null, d.cadence) : false,
      unresolved: d.source_kind === "computed" && (!d.source_key || !(d.source_key in METRIC_RESOLVERS)),
      history: [...desc].reverse(),
    };
  });
});

/**
 * Capture computed metrics that have NO plan_kpis link (monthly_burn,
 * gifts_this_month, and future catalog-only metrics). Plan-linked computed
 * metrics are captured by refreshOrgPlanMetrics — the single writer that
 * keeps plan_kpis.current and the catalog in lockstep — so they are excluded
 * here rather than double-computed. Service-role client; caller authorizes
 * (the cron route).
 */
export type CaptureResult = {
  written: number;
  /** source_keys marked computed with no registered resolver — findings
   *  (Contract 2, A4), error-logged and returned, never silently skipped. */
  unresolved: string[];
};

export async function captureUnlinkedComputedMetrics(admin: SupabaseClient): Promise<CaptureResult> {
  const [{ data: defs }, { data: linked }] = await Promise.all([
    admin
      .from("metric_definitions")
      .select("id, org_id, source_key")
      .eq("source_kind", "computed")
      .eq("active", true)
      .not("source_key", "is", null),
    admin.from("plan_kpis").select("metric_id").not("metric_id", "is", null),
  ]);
  const linkedIds = new Set(((linked ?? []) as { metric_id: string }[]).map((r) => r.metric_id));
  const today = new Date().toISOString().slice(0, 10);

  let written = 0;
  const unresolved: string[] = [];
  for (const d of (defs ?? []) as { id: string; org_id: string; source_key: string }[]) {
    if (linkedIds.has(d.id)) continue;
    const resolver = METRIC_RESOLVERS[d.source_key];
    if (!resolver) {
      unresolved.push(d.source_key);
      console.error(
        `[metrics] computed definition "${d.source_key}" has NO resolver — it can never capture. ` +
          "Register one in METRIC_RESOLVERS or set the definition to source_kind='manual'.",
      );
      continue;
    }
    const value = await resolver(admin, d.org_id);
    if (value == null) continue;
    const { error } = await admin.from("metric_snapshots").upsert(
      {
        org_id: d.org_id,
        metric_id: d.id,
        captured_on: today,
        value: Math.round(Number(value) * 100) / 100,
      },
      { onConflict: "metric_id,captured_on" },
    );
    if (error) console.error(`[metrics] snapshot upsert failed for ${d.source_key}:`, error.message);
    else written += 1;
  }
  return { written, unresolved };
}
