import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "../../_components/PageHeader";
import { RefreshMetricsButton } from "../_components/PlanControls";
import ScorecardCard, { type ScorecardKpi } from "./_components/ScorecardCard";

// KPI Scorecard (BloomOS Strategy) — the owner-segmented view: each person's
// KPIs as cards with progress-to-target, paced status, and a growth sparkline.
// Read-only; editing happens on the plan. Org-scoped service-role reads.
export const dynamic = "force-dynamic";

const OWNER_ORDER = ["Remi", "Shannon"];

type KpiRow = {
  id: string; title: string; owner: string | null; unit: string | null;
  target: number | null; current: number | null; status: string; source: string;
  metric_key: string | null; last_updated_at: string | null;
  goal_id: string | null; objective_id: string | null;
};

export default async function ScorecardPage() {
  const ctx = await getOrgContext();
  if (!ctx) return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  const orgId = ctx.orgId;
  const sb = getSupabaseAdmin();

  const [objsRes, goalsRes, kpisRes, snapsRes] = await Promise.all([
    sb.from("plan_objectives").select("id, title, sort_order").eq("org_id", orgId),
    sb.from("plan_goals").select("id, title, objective_id").eq("org_id", orgId),
    sb.from("plan_kpis").select("id, title, owner, unit, target, current, status, source, metric_key, last_updated_at, goal_id, objective_id").eq("org_id", orgId),
    sb.from("plan_kpi_snapshots").select("kpi_id, value, captured_on").eq("org_id", orgId).order("captured_on", { ascending: true }),
  ]);

  const objById = new Map(
    ((objsRes.data ?? []) as { id: string; title: string; sort_order: number }[]).map((o) => [o.id, o])
  );
  const goalById = new Map(
    ((goalsRes.data ?? []) as { id: string; title: string; objective_id: string | null }[]).map((g) => [g.id, g])
  );
  const historyByKpi = new Map<string, number[]>();
  for (const s of (snapsRes.data ?? []) as { kpi_id: string; value: number }[]) {
    const arr = historyByKpi.get(s.kpi_id) ?? [];
    arr.push(Number(s.value));
    historyByKpi.set(s.kpi_id, arr);
  }

  const kpis = (kpisRes.data ?? []) as KpiRow[];
  const toCard = (k: KpiRow): ScorecardKpi & { _objSort: number } => {
    const goal = k.goal_id ? goalById.get(k.goal_id) : undefined;
    const objId = goal?.objective_id ?? k.objective_id ?? null;
    const obj = objId ? objById.get(objId) : undefined;
    return {
      id: k.id,
      title: k.title,
      unit: k.unit,
      target: k.target === null ? null : Number(k.target),
      current: k.current === null ? null : Number(k.current),
      status: k.status,
      source: k.source,
      metricKey: k.metric_key,
      lastUpdatedAt: k.last_updated_at,
      goalTitle: goal?.title ?? null,
      objectiveTitle: obj?.title ?? null,
      history: (historyByKpi.get(k.id) ?? []).slice(-12),
      _objSort: obj?.sort_order ?? 99,
    };
  };

  // Group by owner; order Remi, Shannon, then the rest.
  const byOwner = new Map<string, (ScorecardKpi & { _objSort: number })[]>();
  for (const k of kpis) {
    const owner = k.owner?.trim() || "Unassigned";
    const arr = byOwner.get(owner) ?? [];
    arr.push(toCard(k));
    byOwner.set(owner, arr);
  }
  const owners = Array.from(byOwner.keys()).sort((a, b) => {
    const ia = OWNER_ORDER.indexOf(a), ib = OWNER_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

  const flagged = (s: string) => s === "at_risk" || s === "behind";
  const onTrack = (s: string) => s === "on_track" || s === "done";

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="KPI Scorecard"
        subtitle={
          <>
            Every measure, by who owns it — progress to target, pacing, and growth · edit on the{" "}
            <Link href="/admin/strategic-plan" className="text-orange hover:underline">plan</Link>
          </>
        }
        actions={<RefreshMetricsButton />}
      />

      {kpis.length === 0 ? (
        <p className="text-sm text-ink-2">
          No measures yet — add KPIs on the{" "}
          <Link href="/admin/strategic-plan" className="text-orange hover:underline">plan</Link> or run setup.
        </p>
      ) : (
        <div className="space-y-8">
          {owners.map((owner) => {
            const cards = byOwner.get(owner)!.sort((a, b) => a._objSort - b._objSort || a.title.localeCompare(b.title));
            const on = cards.filter((c) => onTrack(c.status)).length;
            const risk = cards.filter((c) => flagged(c.status)).length;
            return (
              <section key={owner}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 rounded-full bg-orange/15 text-orange flex items-center justify-center font-bold text-sm">
                    {owner.charAt(0).toUpperCase()}
                  </span>
                  <h2 className="font-heading font-bold text-ink-1 text-lg">{owner}</h2>
                  <span className="text-[11px] text-ink-2">{cards.length} measures</span>
                  <div className="ml-auto flex items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-revenue-bg text-revenue px-2 py-0.5 font-semibold">{on} on track</span>
                    {risk > 0 && <span className="rounded-full bg-expense-bg text-expense px-2 py-0.5 font-semibold">{risk} need attention</span>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cards.map((c) => <ScorecardCard key={c.id} kpi={c} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
