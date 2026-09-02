import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { money } from "../../../finance/_components/charts";
import PageHeader from "../../../_components/PageHeader";
import StatCard from "../../../_components/StatCard";
import TrustBadge from "../../_components/TrustBadge";
import { TYPE } from "@/lib/admin/typeScale";
import { constituentName } from "@/lib/fundraising/display";
import {
  rollupStrategy,
  statusWord,
  matchGiftLevels,
  type PlanOppRow,
  type PlanGrantRow,
} from "@/lib/fundraising/plan";
import { STAGE_KEY_LABELS, isWonStage } from "@/lib/fundraising/stage-sets";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { EditStrategyPanel, GiftTableEditor, AssignButton } from "../_components/PlanControls";

// One strategy of the Fundraising Plan: its gift-range table (the arithmetic
// underneath the goal, matched against real asks), the spine objects filed
// under it, and the pickers that link more. The strategy stores only the
// human decisions; every figure here is computed at render time.
export const dynamic = "force-dynamic";

type ConstituentLite = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
} | null;

type LinkedOpp = PlanOppRow & {
  name: string | null;
  plan_strategy_id: string | null;
  constituent: ConstituentLite;
};

type LinkedGrant = PlanGrantRow & { name: string; plan_strategy_id: string | null };

const oppLabel = (o: LinkedOpp) =>
  o.name ?? (o.constituent ? constituentName(o.constituent) : "Unnamed ask");

export default async function PlanStrategyPage({ params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Fundraising Plan" subtitle="Sign in to view the plan." />
      </div>
    );
  }
  const supabase = createServerSupabase();

  const { data: strategy } = await supabase
    .from("fr_plan_strategies")
    .select("id, plan_year, name, goal, owner, notes")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!strategy) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader
          title="Strategy not found"
          subtitle={
            <>
              It may have been deleted. <Link href="/admin/fundraising/plan" className="text-orange">Back to the plan →</Link>
            </>
          }
        />
      </div>
    );
  }
  const year = strategy.plan_year as number;
  const goal = Number(strategy.goal);

  const oppSelect =
    "id, name, stage, ask_amount, expected_close, plan_strategy_id, " +
    "constituent:constituents ( id, type, first_name, last_name, org_name )";

  const [linkedOppsRes, linkedGrantsRes, linkedCampaignsRes, levelsRes, unassignedOppsRes, unassignedGrantsRes, unassignedCampaignsRes] =
    await Promise.all([
      supabase.from("opportunities").select(oppSelect).eq("org_id", ctx.orgId).eq("plan_strategy_id", strategy.id).limit(500),
      supabase
        .from("grants")
        .select("id, name, stage, amount_requested, amount_awarded, plan_strategy_id")
        .eq("org_id", ctx.orgId)
        .eq("plan_strategy_id", strategy.id)
        .limit(200),
      supabase.from("campaigns").select("id, name").eq("org_id", ctx.orgId).eq("plan_strategy_id", strategy.id).limit(100),
      supabase
        .from("fr_plan_gift_levels")
        .select("amount, count_needed, sort")
        .eq("strategy_id", strategy.id)
        .order("sort", { ascending: true }),
      // Pickers: value nobody has filed under any strategy yet.
      supabase
        .from("opportunities")
        .select(oppSelect)
        .eq("org_id", ctx.orgId)
        .is("plan_strategy_id", null)
        .or(EXCLUDE_PARTNERSHIP_OPPS)
        .order("ask_amount", { ascending: false, nullsFirst: false })
        .limit(12),
      supabase
        .from("grants")
        .select("id, name, stage, amount_requested, amount_awarded, plan_strategy_id")
        .eq("org_id", ctx.orgId)
        .is("plan_strategy_id", null)
        .not("stage", "in", "(declined,closed)")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.from("campaigns").select("id, name").eq("org_id", ctx.orgId).is("plan_strategy_id", null).limit(12),
    ]);

  const linkedOpps = (linkedOppsRes.data ?? []) as unknown as LinkedOpp[];
  const linkedGrants = (linkedGrantsRes.data ?? []) as unknown as LinkedGrant[];
  const linkedCampaigns = (linkedCampaignsRes.data ?? []) as { id: string; name: string }[];
  const levels = ((levelsRes.data ?? []) as { amount: number; count_needed: number }[]).map((l) => ({
    amount: Number(l.amount),
    count_needed: l.count_needed,
  }));
  const unassignedOpps = (unassignedOppsRes.data ?? []) as unknown as LinkedOpp[];
  const unassignedGrants = (unassignedGrantsRes.data ?? []) as unknown as LinkedGrant[];
  const unassignedCampaigns = (unassignedCampaignsRes.data ?? []) as { id: string; name: string }[];

  let campaignGifts: { amount: number; gift_date: string }[] = [];
  if (linkedCampaigns.length > 0) {
    const { data } = await supabase
      .from("gifts")
      .select("amount, gift_date")
      .eq("org_id", ctx.orgId)
      .in("campaign_id", linkedCampaigns.map((c) => c.id))
      .gte("gift_date", `${year}-01-01`)
      .lte("gift_date", `${year}-12-31`)
      .limit(10000);
    campaignGifts = (data ?? []) as typeof campaignGifts;
  }

  const rollup = rollupStrategy({ goal, planYear: year, opps: linkedOpps, grants: linkedGrants, campaignGifts });
  const matched = matchGiftLevels(levels, linkedOpps, year);
  const tableCovers = levels.reduce((s, l) => s + l.amount * l.count_needed, 0);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title={strategy.name}
        eyebrow={
          <Link href={`/admin/fundraising/plan?year=${year}`} className="hover:text-orange transition-colors">
            Fundraising Plan · {year}
          </Link>
        }
        subtitle={`${statusWord(rollup, goal)}${strategy.owner ? ` · owned by ${strategy.owner}` : " · no owner yet"}`}
        actions={
          <EditStrategyPanel
            planYear={year}
            strategy={{
              id: strategy.id,
              name: strategy.name,
              goal,
              owner: strategy.owner,
              notes: strategy.notes,
            }}
          />
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Goal" value={money(goal)} sub="the strategy's target" muted={goal === 0} />
        <StatCard label="Committed" value={money(rollup.committed)} sub="rolls up from the links below" muted={rollup.committed === 0} />
        <StatCard label="Gap" value={money(rollup.gap)} />
        <StatCard label="Open pipeline" value={money(rollup.openPipeline)} sub={`${rollup.openCount} in pursuit`} muted={rollup.openCount === 0} />
      </div>

      <p className="text-xs text-ink-2 mb-8">
        Committed lanes: {money(rollup.wonOpps)} won asks <TrustBadge level="stated" /> · {money(rollup.awardedGrants)} awarded
        grants <TrustBadge level="stated" /> · {money(rollup.campaignGifts)} campaign gifts <TrustBadge level="verified" />. The
        lanes stay visible so overlap between a campaign and the asks behind it is never silent.
      </p>

      {strategy.notes && (
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 mb-8">
          <h2 className={TYPE.cardTitle}>Playbook notes</h2>
          <p className="text-sm text-ink-2 mt-1 whitespace-pre-wrap">{strategy.notes}</p>
        </section>
      )}

      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden mb-8">
        <div className="px-5 py-3 border-b border-outline">
          <h2 className={TYPE.cardTitle}>The arithmetic underneath</h2>
          <p className="text-[11px] text-ink-3">
            Gift size × how many, checked against real asks. Identified counts open linked asks at each
            level; committed counts won ones. The generated table is a proposal — edit it.
          </p>
        </div>
        {matched.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="px-5 py-2 font-semibold">Gift size</th>
                  <th className="px-3 py-2 font-semibold text-right">How many</th>
                  <th className="px-3 py-2 font-semibold text-right">Adds up to</th>
                  <th className="px-3 py-2 font-semibold text-right">Identified</th>
                  <th className="px-5 py-2 font-semibold text-right">Committed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline [font-variant-numeric:tabular-nums]">
                {matched.map((l) => (
                  <tr key={l.amount} className={l.committed >= l.count_needed ? "text-ink-3" : undefined}>
                    <td className="px-5 py-2.5 font-medium text-ink-1">{money(l.amount)}</td>
                    <td className="px-3 py-2.5 text-right">{l.count_needed}</td>
                    <td className="px-3 py-2.5 text-right">{money(l.amount * l.count_needed)}</td>
                    <td className="px-3 py-2.5 text-right">{l.identified || "—"}</td>
                    <td className="px-5 py-2.5 text-right">
                      {l.committed || "—"}
                      {l.committed >= l.count_needed && l.count_needed > 0 ? " ✓" : ""}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold text-ink-1">
                  <td className="px-5 py-2.5">Table covers</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-right">{money(tableCovers)}</td>
                  <td className="px-3 py-2.5 text-right text-[11px] font-normal text-ink-3" colSpan={2}>
                    {tableCovers >= goal ? "covers the goal" : `${money(goal - tableCovers)} short of the goal`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-4">
          <GiftTableEditor strategyId={strategy.id} goal={goal} initial={levels} />
        </div>
      </section>

      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden mb-8">
        <div className="px-5 py-3 border-b border-outline">
          <h2 className={TYPE.cardTitle}>
            In this strategy <span className="text-ink-3 font-normal">· {linkedOpps.length + linkedGrants.length + linkedCampaigns.length}</span>
          </h2>
          <p className="text-[11px] text-ink-3">The asks, grants, and campaigns whose money this strategy counts.</p>
        </div>
        {linkedOpps.length + linkedGrants.length + linkedCampaigns.length === 0 ? (
          <p className="px-5 py-4 text-ink-3 text-sm">Nothing linked yet — add from the lists below.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {linkedOpps.map((o) => (
              <li key={o.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 w-14 flex-shrink-0">Ask</span>
                <Link
                  href={o.constituent ? `/admin/fundraising/donors/${o.constituent.id}` : "/admin/fundraising"}
                  className="font-medium text-ink-1 hover:text-orange transition-colors truncate"
                >
                  {oppLabel(o)}
                </Link>
                <span className="text-xs text-ink-2">
                  {o.ask_amount ? money(Number(o.ask_amount)) : "no amount"} · {STAGE_KEY_LABELS[o.stage] ?? o.stage}
                  {isWonStage(o.stage) ? " ✓" : ""}
                </span>
                <span className="ml-auto">
                  <AssignButton type="opportunity" id={o.id} strategyId={null} label="Unlink" />
                </span>
              </li>
            ))}
            {linkedGrants.map((g) => (
              <li key={g.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 w-14 flex-shrink-0">Grant</span>
                <Link href={`/admin/fundraising/grants/${g.id}`} className="font-medium text-ink-1 hover:text-orange transition-colors truncate">
                  {g.name}
                </Link>
                <span className="text-xs text-ink-2 capitalize">
                  {g.amount_awarded
                    ? `${money(Number(g.amount_awarded))} awarded`
                    : g.amount_requested
                    ? `${money(Number(g.amount_requested))} requested`
                    : "no amount"}{" "}
                  · {g.stage}
                </span>
                <span className="ml-auto">
                  <AssignButton type="grant" id={g.id} strategyId={null} label="Unlink" />
                </span>
              </li>
            ))}
            {linkedCampaigns.map((c) => (
              <li key={c.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 w-14 flex-shrink-0">Camp.</span>
                <Link href="/admin/fundraising/campaigns" className="font-medium text-ink-1 hover:text-orange transition-colors truncate">
                  {c.name}
                </Link>
                <span className="text-xs text-ink-2">gifts in {year} count as verified money</span>
                <span className="ml-auto">
                  <AssignButton type="campaign" id={c.id} strategyId={null} label="Unlink" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(unassignedOpps.length > 0 || unassignedGrants.length > 0 || unassignedCampaigns.length > 0) && (
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-outline">
            <h2 className={TYPE.cardTitle}>Not in any strategy yet</h2>
            <p className="text-[11px] text-ink-3">
              Value the plan isn&apos;t counting. Link what belongs here; the rest stays for other strategies.
            </p>
          </div>
          <ul className="divide-y divide-hairline">
            {unassignedOpps.map((o) => (
              <li key={o.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 w-14 flex-shrink-0">Ask</span>
                <span className="font-medium text-ink-1 truncate">{oppLabel(o)}</span>
                <span className="text-xs text-ink-2">
                  {o.ask_amount ? money(Number(o.ask_amount)) : "no amount"} · {STAGE_KEY_LABELS[o.stage] ?? o.stage}
                </span>
                <span className="ml-auto">
                  <AssignButton type="opportunity" id={o.id} strategyId={strategy.id} label="+ Add here" />
                </span>
              </li>
            ))}
            {unassignedGrants.map((g) => (
              <li key={g.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 w-14 flex-shrink-0">Grant</span>
                <span className="font-medium text-ink-1 truncate">{g.name}</span>
                <span className="text-xs text-ink-2 capitalize">
                  {g.amount_requested ? money(Number(g.amount_requested)) : "no amount"} · {g.stage}
                </span>
                <span className="ml-auto">
                  <AssignButton type="grant" id={g.id} strategyId={strategy.id} label="+ Add here" />
                </span>
              </li>
            ))}
            {unassignedCampaigns.map((c) => (
              <li key={c.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 w-14 flex-shrink-0">Camp.</span>
                <span className="font-medium text-ink-1 truncate">{c.name}</span>
                <span className="ml-auto">
                  <AssignButton type="campaign" id={c.id} strategyId={strategy.id} label="+ Add here" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
