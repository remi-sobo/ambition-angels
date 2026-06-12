import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The code-defined metric registry (docs/bloomos/03-architecture.md §7).
 * Every KPI is computed from the spine — no hand-entered values. The
 * scorecard renders these, the weekly cron snapshots them (trends), and
 * the AI briefing will read the same registry instead of writing SQL.
 *
 * Values are computed for the current calendar year where "YTD" applies.
 */

export type KpiValue = {
  key: string;
  label: string;
  value: number;
  /** 'usd' | 'count' | 'pct' */
  unit: "usd" | "count" | "pct";
  /** Which way is good. */
  direction: "up" | "down";
  hint?: string;
};

const yearStart = () => `${new Date().getUTCFullYear()}-01-01`;
const lastYearStart = () => `${new Date().getUTCFullYear() - 1}-01-01`;

export async function computeKpis(supabase: SupabaseClient): Promise<KpiValue[]> {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getUTCFullYear();

  const [
    giftsYtd,
    donorsThisYear,
    donorsLastYear,
    openOpps,
    grantsAwarded,
    pendingAcks,
    complianceOverdue,
    overdueMoves,
    boardActive,
    openTasks,
  ] = await Promise.all([
    supabase.from("gifts").select("amount, constituent_id").gte("gift_date", yearStart()).limit(10000),
    supabase.from("gifts").select("constituent_id").gte("gift_date", yearStart()).not("constituent_id", "is", null).limit(10000),
    supabase.from("gifts").select("constituent_id").gte("gift_date", lastYearStart()).lt("gift_date", yearStart()).not("constituent_id", "is", null).limit(10000),
    supabase.from("opportunities").select("ask_amount, probability").in("stage", ["identify", "qualify", "cultivate", "solicit"]).limit(2000),
    supabase.from("grants").select("amount_awarded").in("stage", ["awarded", "active", "closed"]).gte("updated_at", `${year}-01-01T00:00:00Z`).limit(1000),
    supabase.from("gifts").select("id", { count: "exact", head: true }).eq("acknowledgment_status", "pending"),
    supabase.from("compliance_items").select("id", { count: "exact", head: true }).in("status", ["upcoming", "in_progress"]).lt("due_date", today),
    supabase.from("opportunities").select("id", { count: "exact", head: true }).lt("next_step_due", today).not("next_step_due", "is", null).not("stage", "in", "(steward,lost)"),
    supabase.from("board_members").select("constituent_id, coi_signed_at").eq("status", "active").limit(100),
    supabase.from("ops_tasks").select("id", { count: "exact", head: true }).neq("status", "done"),
  ]);

  const gifts = (giftsYtd.data ?? []) as Array<{ amount: number; constituent_id: string | null }>;
  const revenueYtd = gifts.reduce((s, g) => s + Number(g.amount), 0);

  const thisYearDonors = new Set(
    ((donorsThisYear.data ?? []) as Array<{ constituent_id: string }>).map((g) => g.constituent_id)
  );
  const lastYearDonors = new Set(
    ((donorsLastYear.data ?? []) as Array<{ constituent_id: string }>).map((g) => g.constituent_id)
  );
  let retained = 0;
  for (const id of Array.from(lastYearDonors)) if (thisYearDonors.has(id)) retained += 1;
  const retention = lastYearDonors.size > 0 ? (retained / lastYearDonors.size) * 100 : 0;

  const opps = (openOpps.data ?? []) as Array<{ ask_amount: number | null; probability: number | null }>;
  const pipeline = opps.reduce((s, o) => s + Number(o.ask_amount ?? 0), 0);
  const weighted = opps.reduce(
    (s, o) => s + (Number(o.ask_amount ?? 0) * Number(o.probability ?? 50)) / 100,
    0
  );

  const awarded = ((grantsAwarded.data ?? []) as Array<{ amount_awarded: number | null }>).reduce(
    (s, g) => s + Number(g.amount_awarded ?? 0),
    0
  );

  const board = (boardActive.data ?? []) as Array<{
    constituent_id: string | null; coi_signed_at: string | null;
  }>;
  const boardGave = board.filter(
    (b) => b.constituent_id && thisYearDonors.has(b.constituent_id)
  ).length;
  const boardGivingPct = board.length > 0 ? (boardGave / board.length) * 100 : 0;
  const coiCurrent = board.filter(
    (b) => b.coi_signed_at && b.coi_signed_at >= yearStart()
  ).length;
  const coiPct = board.length > 0 ? (coiCurrent / board.length) * 100 : 0;

  return [
    { key: "revenue_ytd", label: `Giving revenue (${year})`, value: revenueYtd, unit: "usd", direction: "up" },
    { key: "donors_ytd", label: `Donors (${year})`, value: thisYearDonors.size, unit: "count", direction: "up" },
    { key: "donor_retention", label: "Donor retention", value: retention, unit: "pct", direction: "up", hint: "gave last year and again this year · FEP sector avg ≈ 43%" },
    { key: "pipeline_open", label: "Open major-gift pipeline", value: pipeline, unit: "usd", direction: "up" },
    { key: "pipeline_weighted", label: "Weighted pipeline", value: weighted, unit: "usd", direction: "up", hint: "ask × probability" },
    { key: "grants_awarded_ytd", label: `Grants awarded (${year})`, value: awarded, unit: "usd", direction: "up" },
    { key: "board_giving_pct", label: "Board giving", value: boardGivingPct, unit: "pct", direction: "up", hint: "funders ask for 100%" },
    { key: "coi_coverage_pct", label: "Board COI coverage", value: coiPct, unit: "pct", direction: "up", hint: "Form 990 Part VI Q12" },
    { key: "pending_acks", label: "Gifts awaiting acknowledgment", value: pendingAcks.count ?? 0, unit: "count", direction: "down", hint: "IRS ≥$250 contemporaneous receipts" },
    { key: "overdue_moves", label: "Overdue major-gift moves", value: overdueMoves.count ?? 0, unit: "count", direction: "down" },
    { key: "compliance_overdue", label: "Overdue compliance items", value: complianceOverdue.count ?? 0, unit: "count", direction: "down" },
    { key: "open_tasks", label: "Open tasks", value: openTasks.count ?? 0, unit: "count", direction: "down" },
  ];
}

/** Weekly snapshot for trends (called by the Monday digest cron). */
export async function snapshotKpis(supabase: SupabaseClient): Promise<void> {
  const kpis = await computeKpis(supabase);
  const captured_on = new Date().toISOString().slice(0, 10);
  const rows = kpis.map((k) => ({
    metric_key: k.key,
    captured_on,
    value: Math.round(k.value * 100) / 100,
  }));
  const { error } = await supabase
    .from("kpi_snapshots")
    .upsert(rows, { onConflict: "org_id,metric_key,captured_on" });
  if (error) console.error("snapshotKpis failed:", error.message);
}

export function formatKpi(k: Pick<KpiValue, "unit">, v: number): string {
  if (k.unit === "usd")
    return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (k.unit === "pct") return `${Math.round(v)}%`;
  return String(Math.round(v));
}
