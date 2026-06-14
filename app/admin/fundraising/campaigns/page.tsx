import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { money } from "../../finance/_components/charts";
import StatCard from "../../_components/StatCard";
import {
  NewCampaignForm,
  NewAppealForm,
  BulkAttributeForm,
} from "./_components/CampaignControls";

// Campaigns — the umbrella axis of three-axis attribution (campaign /
// fund / appeal, modules/03-fundraising.md). Every gift should carry a
// campaign; the bulk-attribute tool clears the unattributed backlog.
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const supabase = getSupabaseAdmin();
  const [campaignsRes, appealsRes, giftsRes, unattributedRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, goal, starts_on, ends_on")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("appeals").select("id, name, source_code, campaign_id").limit(500),
    supabase.from("gifts").select("campaign_id, appeal_id, amount").limit(10000),
    supabase
      .from("gifts")
      .select("id", { count: "exact", head: true })
      .is("campaign_id", null),
  ]);

  const campaigns = (campaignsRes.data ?? []) as Array<{
    id: string; name: string; goal: number | null; starts_on: string | null; ends_on: string | null;
  }>;
  const appeals = (appealsRes.data ?? []) as Array<{
    id: string; name: string; source_code: string | null; campaign_id: string | null;
  }>;
  const gifts = (giftsRes.data ?? []) as Array<{
    campaign_id: string | null; appeal_id: string | null; amount: number;
  }>;

  const byCampaign = new Map<string, { total: number; count: number }>();
  const byAppeal = new Map<string, { total: number; count: number }>();
  let attributedTotal = 0;
  for (const g of gifts) {
    const amt = Number(g.amount);
    if (g.campaign_id) {
      const c = byCampaign.get(g.campaign_id) ?? { total: 0, count: 0 };
      c.total += amt; c.count += 1;
      byCampaign.set(g.campaign_id, c);
      attributedTotal += amt;
    }
    if (g.appeal_id) {
      const a = byAppeal.get(g.appeal_id) ?? { total: 0, count: 0 };
      a.total += amt; a.count += 1;
      byAppeal.set(g.appeal_id, a);
    }
  }
  const unattributed = unattributedRes.count ?? 0;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl text-cream">Campaigns</h1>
          <p className="text-gray-mid text-sm mt-0.5">
            Campaign → appeal attribution · every gift should carry a campaign
          </p>
        </div>
        <NewCampaignForm />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        <StatCard label="Campaigns" value={campaigns.length} />
        <StatCard label="Attributed giving" value={money(attributedTotal)} />
        <StatCard
          label="Unattributed gifts"
          value={unattributed}
          sub={unattributed > 0 ? "assign below" : "all attributed"}
          muted={unattributed === 0}
        />
      </div>

      {unattributed > 0 && campaigns.length > 0 && (
        <div className="mb-8">
          <BulkAttributeForm
            campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
            unattributed={unattributed}
          />
        </div>
      )}

      <div className="space-y-4">
        {campaigns.map((c) => {
          const agg = byCampaign.get(c.id) ?? { total: 0, count: 0 };
          const pct = c.goal && c.goal > 0 ? Math.min(100, (agg.total / Number(c.goal)) * 100) : null;
          const campaignAppeals = appeals.filter((a) => a.campaign_id === c.id);
          return (
            <section key={c.id} className="bg-white/[0.03] border border-white/10 rounded-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-heading font-semibold text-cream">{c.name}</h2>
                <span className="text-sm text-cream/80 tabular-nums">
                  {money(agg.total)}
                  {c.goal ? <span className="text-gray-mid"> / {money(Number(c.goal))} goal</span> : null}
                  <span className="text-gray-mid"> · {agg.count} gift{agg.count === 1 ? "" : "s"}</span>
                </span>
              </div>
              {(c.starts_on || c.ends_on) && (
                <p className="text-[11px] text-gray-mid mt-0.5">
                  {c.starts_on ?? "…"} → {c.ends_on ?? "…"}
                </p>
              )}
              {pct !== null && (
                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-orange" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {campaignAppeals.map((a) => {
                  const aa = byAppeal.get(a.id) ?? { total: 0, count: 0 };
                  return (
                    <span
                      key={a.id}
                      className="text-[11px] bg-white/5 border border-white/10 rounded-full px-3 py-1 text-cream/70"
                      title={a.source_code ? `Source code ${a.source_code}` : undefined}
                    >
                      {a.name} · {money(aa.total)}
                    </span>
                  );
                })}
                <NewAppealForm campaignId={c.id} />
              </div>
            </section>
          );
        })}
        {campaigns.length === 0 && (
          <p className="text-sm text-gray-mid">
            No campaigns yet — create the first one (e.g. “FY26 Annual Fund”) and attribute your
            gift history to it.
          </p>
        )}
      </div>
    </div>
  );
}
