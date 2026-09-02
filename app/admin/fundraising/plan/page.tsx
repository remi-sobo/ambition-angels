import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { money } from "../../finance/_components/charts";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import TrustBadge from "../_components/TrustBadge";
import { todayISO } from "../../ops/_types/ops";
import { TYPE } from "@/lib/admin/typeScale";
import {
  rollupStrategy,
  statusWord,
  groupByMonth,
  type PlanOppRow,
  type PlanGrantRow,
  type StrategyRollup,
  type AskMoment,
} from "@/lib/fundraising/plan";
import { fetchAskMoments } from "@/lib/fundraising/plan-moments";
import { NewStrategyButton } from "./_components/PlanControls";

// The Fundraising Plan (specs/fundraising-plan.md): the year's goal
// decomposed into strategies, each rolling up live from the spine. Every
// figure carries its trust label; a strategy with nothing committed shows a
// sentence, never a bar. The 90-day ask calendar sits underneath — the same
// records the pipeline, grants, and pledges pages own, laid out in time.
export const dynamic = "force-dynamic";

type StrategyRow = {
  id: string;
  plan_year: number;
  name: string;
  goal: number;
  owner: string | null;
  notes: string | null;
  sort: number;
};

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtMonth = (ym: string) =>
  new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

const MOMENT_KIND_LABELS: Record<AskMoment["kind"], string> = {
  opportunity_close: "Ask",
  grant_requirement: "Grant",
  pledge_installment: "Pledge",
};

export default async function FundraisingPlanPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Fundraising Plan" subtitle="Sign in to view the plan." />
      </div>
    );
  }
  const supabase = createServerSupabase();
  const today = todayISO();
  const currentYear = Number(today.slice(0, 4));
  const year = /^\d{4}$/.test(searchParams.year ?? "") ? Number(searchParams.year) : currentYear;

  const [strategiesRes, oppsRes, grantsRes, campaignsRes, moments] = await Promise.all([
    supabase
      .from("fr_plan_strategies")
      .select("id, plan_year, name, goal, owner, notes, sort")
      .eq("org_id", ctx.orgId)
      .eq("plan_year", year)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("opportunities")
      .select("id, stage, ask_amount, expected_close, plan_strategy_id")
      .eq("org_id", ctx.orgId)
      .limit(2000),
    supabase
      .from("grants")
      .select("id, stage, amount_requested, amount_awarded, plan_strategy_id")
      .eq("org_id", ctx.orgId)
      .limit(1000),
    supabase
      .from("campaigns")
      .select("id, name, plan_strategy_id")
      .eq("org_id", ctx.orgId)
      .not("plan_strategy_id", "is", null)
      .limit(200),
    fetchAskMoments(supabase, ctx.orgId, today, 90),
  ]);

  const strategies = (strategiesRes.data ?? []) as StrategyRow[];
  const allOpps = (oppsRes.data ?? []) as (PlanOppRow & { plan_strategy_id: string | null })[];
  const allGrants = (grantsRes.data ?? []) as (PlanGrantRow & { plan_strategy_id: string | null })[];
  const campaigns = (campaignsRes.data ?? []) as { id: string; name: string; plan_strategy_id: string }[];

  // Gifts on linked campaigns, plan year only — the verified lane.
  let campaignGifts: { amount: number; gift_date: string; campaign_id: string }[] = [];
  if (campaigns.length > 0) {
    const { data } = await supabase
      .from("gifts")
      .select("amount, gift_date, campaign_id")
      .eq("org_id", ctx.orgId)
      .in("campaign_id", campaigns.map((c) => c.id))
      .gte("gift_date", `${year}-01-01`)
      .lte("gift_date", `${year}-12-31`)
      .limit(10000);
    campaignGifts = (data ?? []) as typeof campaignGifts;
  }

  const rollups = new Map<string, StrategyRollup>();
  for (const s of strategies) {
    const campaignIds = campaigns.filter((c) => c.plan_strategy_id === s.id).map((c) => c.id);
    rollups.set(
      s.id,
      rollupStrategy({
        goal: Number(s.goal),
        planYear: year,
        opps: allOpps.filter((o) => o.plan_strategy_id === s.id),
        grants: allGrants.filter((g) => g.plan_strategy_id === s.id),
        campaignGifts: campaignGifts.filter((g) => campaignIds.includes(g.campaign_id)),
      })
    );
  }

  const totalGoal = strategies.reduce((s, r) => s + Number(r.goal), 0);
  const totalCommitted = strategies.reduce((s, r) => s + (rollups.get(r.id)?.committed ?? 0), 0);
  const totalOpen = strategies.reduce((s, r) => s + (rollups.get(r.id)?.openPipeline ?? 0), 0);
  const totalGap = Math.max(0, totalGoal - totalCommitted);

  // Money in Bloom that no strategy claims — shown so the plan can't quietly
  // understate what the pipeline pages know about.
  const unassignedRollup = rollupStrategy({
    goal: 0,
    planYear: year,
    opps: allOpps.filter((o) => !o.plan_strategy_id),
    grants: allGrants.filter((g) => !g.plan_strategy_id),
    campaignGifts: [],
  });

  const months = groupByMonth(moments);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Fundraising Plan"
        eyebrow={`Plan year ${year}`}
        subtitle="Where the money will come from — every figure rolls up live from the spine, never typed in."
        actions={
          <div className="flex items-center gap-2">
            {[year - 1, currentYear, currentYear + 1]
              .filter((y, i, a) => a.indexOf(y) === i)
              .sort()
              .map((y) => (
                <Link
                  key={y}
                  href={`/admin/fundraising/plan?year=${y}`}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border-[1.5px] transition-colors ${
                    y === year
                      ? "bg-orange text-white border-orange"
                      : "text-ink-2 border-outline hover:text-ink-1"
                  }`}
                >
                  {y}
                </Link>
              ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="The goal"
          value={money(totalGoal)}
          sub={strategies.length > 0 ? `across ${strategies.length} strategies` : "no strategies yet"}
          muted={totalGoal === 0}
        />
        <StatCard label="Committed" value={money(totalCommitted)} sub="won asks + awarded grants + gifts" muted={totalCommitted === 0} />
        <StatCard label="Still to raise" value={money(totalGap)} sub="the goal minus what is committed" />
        <StatCard label="Open pipeline" value={money(totalOpen)} sub="asks that may not land" muted={totalOpen === 0} />
      </div>

      <div className="mb-8">
        <NewStrategyButton planYear={year} />
      </div>

      {strategies.length === 0 ? (
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6 mb-8">
          <h2 className={TYPE.cardTitle}>No plan for {year} yet</h2>
          <p className="text-sm text-ink-2 mt-1 max-w-[60ch]">
            Add the year&apos;s strategies — major gifts, monthly partners, an event, grants — each with
            its own goal. Committed and gap figures compute from the asks, grants, and campaigns you
            link to each strategy, so the plan and the records can never disagree.
          </p>
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 mb-8">
            {strategies.map((s) => {
              const r = rollups.get(s.id)!;
              const goal = Number(s.goal);
              const pct = goal > 0 ? Math.min(100, Math.round((r.committed / goal) * 100)) : 0;
              return (
                <Link
                  key={s.id}
                  href={`/admin/fundraising/plan/${s.id}`}
                  className="block bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 hover:border-orange/40 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className={TYPE.cardTitle}>{s.name}</h2>
                    <span className="text-[11px] text-ink-3 whitespace-nowrap">{s.owner ?? "No owner"}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className={TYPE.cardLabel}>Goal</div>
                      <div className="font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">{money(goal)}</div>
                    </div>
                    <div>
                      <div className={TYPE.cardLabel}>Committed</div>
                      <div className="font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">{money(r.committed)}</div>
                    </div>
                    <div>
                      <div className={TYPE.cardLabel}>Gap</div>
                      <div className="font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">{money(r.gap)}</div>
                    </div>
                  </div>
                  {r.committed > 0 && goal > 0 ? (
                    <div className="mt-3 h-1.5 rounded-full bg-hairline overflow-hidden">
                      <div className="h-full bg-revenue" style={{ width: `${pct}%` }} />
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-ink-3">
                      Nothing committed yet — the bar appears with the first won ask, awarded grant, or
                      campaign gift linked here.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-ink-2">
                    {statusWord(r, goal)}
                    {r.openCount > 0 && (
                      <span className="text-ink-3"> · {r.openCount} in the pipeline ({money(r.openPipeline)})</span>
                    )}
                  </p>
                </Link>
              );
            })}
          </div>

          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden mb-8">
            <div className="px-5 py-3 border-b border-outline">
              <h2 className={TYPE.cardTitle}>Where the money will come from</h2>
              <p className="text-[11px] text-ink-3">
                Committed = won asks <TrustBadge level="stated" /> + awarded grants <TrustBadge level="stated" /> + campaign gifts{" "}
                <TrustBadge level="verified" />. Open pipeline is <TrustBadge level="estimated" />.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3">
                    <th className="px-5 py-2 font-semibold">Strategy</th>
                    <th className="px-3 py-2 font-semibold text-right">Goal</th>
                    <th className="px-3 py-2 font-semibold text-right">Committed</th>
                    <th className="px-3 py-2 font-semibold text-right">Gap</th>
                    <th className="px-5 py-2 font-semibold">Where it stands</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline [font-variant-numeric:tabular-nums]">
                  {strategies.map((s) => {
                    const r = rollups.get(s.id)!;
                    return (
                      <tr key={s.id}>
                        <td className="px-5 py-2.5">
                          <Link href={`/admin/fundraising/plan/${s.id}`} className="font-medium text-ink-1 hover:text-orange transition-colors">
                            {s.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-right">{money(Number(s.goal))}</td>
                        <td className="px-3 py-2.5 text-right">{money(r.committed)}</td>
                        <td className="px-3 py-2.5 text-right">{money(r.gap)}</td>
                        <td className="px-5 py-2.5 text-xs text-ink-2">{statusWord(r, Number(s.goal))}</td>
                      </tr>
                    );
                  })}
                  {(unassignedRollup.committed > 0 || unassignedRollup.openPipeline > 0) && (
                    <tr className="text-ink-2">
                      <td className="px-5 py-2.5">
                        Not in the plan
                        <span className="block text-[11px] text-ink-3">
                          Won and open value no strategy claims — open a strategy to link it.
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">—</td>
                      <td className="px-3 py-2.5 text-right">{money(unassignedRollup.committed)}</td>
                      <td className="px-3 py-2.5 text-right">—</td>
                      <td className="px-5 py-2.5 text-xs text-ink-3">
                        {money(unassignedRollup.openPipeline)} open
                      </td>
                    </tr>
                  )}
                  <tr className="font-semibold text-ink-1 bg-surface/40">
                    <td className="px-5 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right">{money(totalGoal)}</td>
                    <td className="px-3 py-2.5 text-right">{money(totalCommitted)}</td>
                    <td className="px-3 py-2.5 text-right">{money(totalGap)}</td>
                    <td className="px-5 py-2.5" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-outline">
          <h2 className={TYPE.cardTitle}>
            When the asks have to happen <span className="text-ink-3 font-normal">· next 90 days</span>
          </h2>
          <p className="text-[11px] text-ink-3">
            Expected closes, grant deadlines, and pledge installments in one calendar. The asks have to
            land before the money is needed, not in the same month.
          </p>
        </div>
        {months.length === 0 ? (
          <p className="px-5 py-4 text-ink-3 text-sm">
            Nothing scheduled in the next 90 days. Expected close dates on asks, grant deadlines, and
            pledge schedules all show up here.
          </p>
        ) : (
          <div className="divide-y divide-hairline">
            {months.map((m) => (
              <div key={m.month}>
                <div className="px-5 pt-3 pb-1 text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                  {fmtMonth(m.month)}
                </div>
                <ul>
                  {m.items.map((item, i) => (
                    <li key={`${item.kind}-${i}`} className="px-5 py-2 flex items-center gap-3 text-sm">
                      <span className="text-xs text-ink-3 w-12 flex-shrink-0 [font-variant-numeric:tabular-nums]">
                        {fmtDay(item.date)}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 w-12 flex-shrink-0">
                        {MOMENT_KIND_LABELS[item.kind]}
                      </span>
                      <Link href={item.href} className="font-medium text-ink-1 hover:text-orange transition-colors truncate">
                        {item.label}
                      </Link>
                      <span className="text-xs text-ink-2 truncate">{item.detail}</span>
                      {item.amount != null && (
                        <span className="ml-auto text-ink-1 font-semibold text-xs [font-variant-numeric:tabular-nums] whitespace-nowrap">
                          {money(item.amount)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
