import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { money } from "../../finance/_components/charts";
import StatCard from "../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";

// Donors v1 (Ring 2): constituent list with giving rollups, fed by the
// fundraising core schema. Gift ingestion is automatic (Stripe trigger);
// Givebutter and manual entry land in later chunks.
export const dynamic = "force-dynamic";

type Constituent = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[];
  do_not_contact: boolean;
  source: string;
};

type Gift = {
  constituent_id: string | null;
  amount: number;
  gift_date: string;
  recurring_plan_id: string | null;
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Page through the whole gifts spine so KPIs and rollups are exact, not a
// recency sample. Bounded at 50 pages (50k gifts) — revisit with SQL-side
// aggregation long before that's real.
async function fetchAllGifts(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const out: Gift[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("gifts")
      .select("constituent_id, amount, gift_date, recurring_plan_id")
      .order("gift_date", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { gifts: null, error };
    out.push(...((data ?? []) as Gift[]));
    if (!data || data.length < PAGE) break;
  }
  return { gifts: out, error: null };
}

const chunk = <T,>(arr: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

export default async function DonorsPage() {
  const supabase = getSupabaseAdmin();
  const [{ gifts: allGifts, error: giftsError }, plansRes, constituentCountRes] = await Promise.all([
    fetchAllGifts(supabase),
    supabase.from("recurring_plans").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("constituents").select("id", { count: "exact", head: true }),
  ]);

  // Tables not applied yet (the migration ships ahead of the prod apply).
  if (giftsError || allGifts === null) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-cream text-2xl mb-4">Donors</h1>
        <div className="bg-[#1a1d27] border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-gray-mid leading-relaxed">
          The fundraising tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_fundraising_core.sql</code> via Actions → Apply DB
          migration, then reload — existing Stripe donations backfill automatically.
        </div>
      </div>
    );
  }

  const gifts = allGifts.map((g) => ({ ...g, amount: Number(g.amount) }));

  type Rollup = {
    total: number;
    count: number;
    first: string;
    last: string;
    recurring: boolean;
  };
  const rollups = new Map<string, Rollup>();
  let anonTotal = 0;
  let anonCount = 0;
  for (const g of gifts) {
    if (!g.constituent_id) {
      anonTotal += g.amount;
      anonCount += 1;
      continue;
    }
    const r = rollups.get(g.constituent_id) ?? {
      total: 0, count: 0, first: g.gift_date, last: g.gift_date, recurring: false,
    };
    r.total += g.amount;
    r.count += 1;
    if (g.gift_date < r.first) r.first = g.gift_date;
    if (g.gift_date > r.last) r.last = g.gift_date;
    if (g.recurring_plan_id) r.recurring = true;
    rollups.set(g.constituent_id, r);
  }

  // Fetch exactly the constituents that have gifts, by id — no arbitrary
  // list cap can drop a donor whose gifts we counted.
  const donorIds = Array.from(rollups.keys());
  const constituents: Constituent[] = [];
  for (const ids of chunk(donorIds, 200)) {
    const { data, error } = await supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, emails, do_not_contact, source")
      .in("id", ids);
    if (error) continue;
    constituents.push(...((data ?? []) as Constituent[]));
  }

  const donors = constituents
    .filter((c) => rollups.has(c.id))
    .map((c) => ({ c, r: rollups.get(c.id)! }))
    .sort((a, b) => b.r.total - a.r.total);
  const nonDonorConstituents = Math.max((constituentCountRes.count ?? donors.length) - donors.length, 0);

  const totalRaised = gifts.reduce((s, g) => s + g.amount, 0);

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-[#13151f] border-b border-white/10 px-4 sm:px-6 lg:px-10 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center justify-between gap-3">
        <span className="font-heading font-bold text-cream text-sm sm:text-base">Donors</span>
        <span className="text-xs text-gray-mid">
          {donors.length} donor{donors.length === 1 ? "" : "s"}
          {nonDonorConstituents > 0 ? ` · ${nonDonorConstituents} constituents without gifts` : ""}
        </span>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Raised" value={money(totalRaised)} sub={`${gifts.length} gifts on the spine`} />
          <StatCard label="Donors" value={donors.length} sub={anonCount > 0 ? `+ ${anonCount} anonymous gifts` : "with at least one gift"} />
          <StatCard label="Average Gift" value={gifts.length > 0 ? money(totalRaised / gifts.length) : "—"} />
          <StatCard label="Active Recurring Plans" value={plansRes.count ?? 0} sub="monthly givers" />
        </div>

        <section className="bg-[#1a1d27] border border-white/10 rounded-card-lg overflow-hidden">
          {donors.length === 0 ? (
            <p className="p-8 text-gray-mid text-sm">
              No donors yet. Stripe donations flow in automatically; Givebutter and manual gift
              entry arrive later in Ring 2.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-b border-white/10">
                    {["Donor", "Email", "Total Given", "Gifts", "First Gift", "Latest Gift", ""].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {donors.map(({ c, r }) => (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/fundraising/donors/${c.id}`} className="flex items-center gap-3 group">
                          <span className="w-8 h-8 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0 text-orange font-bold text-xs">
                            {constituentName(c)[0]?.toUpperCase()}
                          </span>
                          <span className="font-medium text-cream group-hover:text-orange transition-colors">
                            {constituentName(c)}
                          </span>
                          {r.recurring && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
                          )}
                          {c.do_not_contact && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">Do not contact</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-gray-mid text-xs">{c.emails[0] ?? "—"}</td>
                      <td className="px-5 py-3.5 font-bold text-cream [font-variant-numeric:tabular-nums]">{money(r.total)}</td>
                      <td className="px-5 py-3.5 text-gray-mid [font-variant-numeric:tabular-nums]">{r.count}</td>
                      <td className="px-5 py-3.5 text-gray-mid text-xs whitespace-nowrap">{fmtDate(r.first)}</td>
                      <td className="px-5 py-3.5 text-gray-mid text-xs whitespace-nowrap">{fmtDate(r.last)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Link href={`/admin/fundraising/donors/${c.id}`} className="text-xs font-semibold text-orange hover:text-orange-mid">
                          Profile →
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {anonCount > 0 && (
                    <tr className="border-b border-white/5">
                      <td className="px-5 py-3.5 text-gray-mid italic">Anonymous / no identity</td>
                      <td className="px-5 py-3.5 text-gray-mid text-xs">—</td>
                      <td className="px-5 py-3.5 font-bold text-cream/70 [font-variant-numeric:tabular-nums]">{money(anonTotal)}</td>
                      <td className="px-5 py-3.5 text-gray-mid [font-variant-numeric:tabular-nums]">{anonCount}</td>
                      <td className="px-5 py-3.5" colSpan={3} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
