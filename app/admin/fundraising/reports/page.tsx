import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../finance/_components/charts";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import GiftReportFilters from "./_components/GiftReportFilters";
import { TYPE } from "@/lib/admin/typeScale";

// Epic E — reporting. A Gifts report (filter by date range / campaign / fund /
// method, with KPIs, a group-by-campaign breakdown, and CSV export), plus the
// saved donor segments for one-click constituent exports.
export const dynamic = "force-dynamic";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type GiftRow = {
  amount: number;
  gift_date: string;
  method: string;
  campaign_id: string | null;
  constituent: { type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; campaign_id?: string; fund_id?: string; method?: string };
}) {
  const from = searchParams.from && isDate(searchParams.from) ? searchParams.from : "";
  const to = searchParams.to && isDate(searchParams.to) ? searchParams.to : "";
  const campaignId = searchParams.campaign_id && isUuid(searchParams.campaign_id) ? searchParams.campaign_id : "";
  const fundId = searchParams.fund_id && isUuid(searchParams.fund_id) ? searchParams.fund_id : "";
  const method = searchParams.method ?? "";

  const supabase = createServerSupabase();
  let giftQuery = supabase
    .from("gifts")
    .select(
      "amount, gift_date, method, campaign_id, constituent:constituents ( type, first_name, last_name, org_name )"
    )
    .order("gift_date", { ascending: false })
    .limit(10000);
  if (from) giftQuery = giftQuery.gte("gift_date", from);
  if (to) giftQuery = giftQuery.lte("gift_date", to);
  if (campaignId) giftQuery = giftQuery.eq("campaign_id", campaignId);
  if (fundId) giftQuery = giftQuery.eq("fund_id", fundId);
  if (method) giftQuery = giftQuery.eq("method", method);

  const [giftsRes, campaignsRes, fundsRes, segmentsRes] = await Promise.all([
    giftQuery,
    supabase.from("campaigns").select("id, name").order("name"),
    supabase.from("funds").select("id, name").order("name"),
    supabase.from("segments").select("id, name, definition").order("created_at", { ascending: false }).limit(100),
  ]);

  if (giftsRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Reports</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The fundraising tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_fundraising_core.sql</code>, then reload.
        </div>
      </div>
    );
  }

  const gifts = ((giftsRes.data ?? []) as unknown as GiftRow[]).map((g) => ({ ...g, amount: Number(g.amount) }));
  const campaigns = (campaignsRes.data ?? []) as Array<{ id: string; name: string }>;
  const funds = (fundsRes.data ?? []) as Array<{ id: string; name: string }>;
  const segments = (segmentsRes.data ?? []) as Array<{ id: string; name: string; definition: Record<string, string> }>;
  const campName = new Map(campaigns.map((c) => [c.id, c.name]));

  const total = gifts.reduce((s, g) => s + g.amount, 0);
  const count = gifts.length;
  const avg = count > 0 ? total / count : 0;

  // Group by campaign (the most useful money-in cut).
  const byCampaign = new Map<string, { total: number; count: number }>();
  for (const g of gifts) {
    const key = g.campaign_id ?? "__none__";
    const cur = byCampaign.get(key) ?? { total: 0, count: 0 };
    cur.total += g.amount;
    cur.count += 1;
    byCampaign.set(key, cur);
  }
  const groups = Array.from(byCampaign.entries())
    .map(([key, v]) => ({ name: key === "__none__" ? "Unattributed" : campName.get(key) ?? "Unknown", ...v }))
    .sort((a, b) => b.total - a.total);

  const segQuery = (def: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(def)) if (v) p.set(k, v);
    return p.toString();
  };

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          title="Reports"
          subtitle="Money-in reporting and saved donor segments"
          actions={
            <Link
              href="/admin/fundraising/donors"
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
            >
              Donors →
            </Link>
          }
        />

        <GiftReportFilters
          initial={{ from, to, campaign_id: campaignId, fund_id: fundId, method }}
          campaigns={campaigns}
          funds={funds}
        />

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total Raised" value={money(total)} sub={`${count} gift${count === 1 ? "" : "s"} in range`} />
          <StatCard label="Average Gift" value={count > 0 ? money(avg) : "—"} />
          <StatCard label="Campaigns" value={groups.filter((g) => g.name !== "Unattributed").length} sub="with gifts in range" />
        </div>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline">
            <h2 className="font-heading font-bold text-ink-1 text-sm">By campaign</h2>
          </div>
          {groups.length === 0 ? (
            <p className="p-6 text-ink-2 text-sm">No gifts match these filters.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {groups.map((g) => (
                <li key={g.name} className="px-5 py-3 flex items-center gap-4">
                  <span className="text-sm text-ink-1 flex-1 truncate">{g.name}</span>
                  <span className="text-xs text-ink-2 [font-variant-numeric:tabular-nums]">{g.count} gift{g.count === 1 ? "" : "s"}</span>
                  <span className="font-bold text-ink-1 w-28 text-right [font-variant-numeric:tabular-nums]">{money(g.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline">
            <h2 className="font-heading font-bold text-ink-1 text-sm">Recent gifts in range</h2>
          </div>
          {gifts.length === 0 ? (
            <p className="p-6 text-ink-2 text-sm">No gifts match these filters.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {gifts.slice(0, 50).map((g, i) => (
                <li key={i} className="px-5 py-2.5 flex items-center gap-4">
                  <span className="text-xs text-ink-2 w-24 flex-shrink-0">{fmtDate(g.gift_date)}</span>
                  <span className="text-sm text-ink-1 flex-1 truncate">{g.constituent ? constituentName(g.constituent) : "Anonymous"}</span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-3">{g.method}</span>
                  <span className="font-bold text-ink-1 w-24 text-right [font-variant-numeric:tabular-nums]">{money(g.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {gifts.length > 50 && (
            <p className="px-5 py-3 text-[11px] text-ink-3 border-t border-outline">
              Showing 50 of {gifts.length}. Export CSV for the full set.
            </p>
          )}
        </section>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline">
            <h2 className="font-heading font-bold text-ink-1 text-sm">Saved donor segments</h2>
          </div>
          {segments.length === 0 ? (
            <p className="p-6 text-ink-2 text-sm">
              No saved segments yet. Build and save one from the Donors page (Segments &amp; export).
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {segments.map((s) => (
                <li key={s.id} className="px-5 py-3 flex items-center gap-4">
                  <span className="text-sm text-ink-1 flex-1 truncate">{s.name}</span>
                  <a
                    href={`/api/admin/donors/export?${segQuery(s.definition)}`}
                    className="text-xs font-semibold text-orange hover:text-orange-dark transition-colors"
                  >
                    Export CSV
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
