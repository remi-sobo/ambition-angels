import Link from "next/link";
import SegmentExportPanel from "./_components/SegmentExportPanel";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../finance/_components/charts";
import StatCard from "../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import { analyzeDonor, retentionRate, FLAG_LABELS, FLAG_HELP, type RetentionFlag } from "@/lib/fundraising/retention";
import { todayISO } from "../../ops/_types/ops";

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
async function fetchAllGifts(supabase: ReturnType<typeof createServerSupabase>) {
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

// Paginate active plans fully — the flag-suppression set must never be a
// sample, or on-schedule monthly donors could get false lapse flags.
async function fetchActivePlans(supabase: ReturnType<typeof createServerSupabase>) {
  const ids: Array<string | null> = [];
  const PAGE = 1000;
  let count: number | null = null;
  for (let page = 0; page < 10; page++) {
    const { data, count: c, error } = await supabase
      .from("recurring_plans")
      .select("constituent_id", { count: "exact" })
      .eq("status", "active")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) break;
    if (c !== null) count = c;
    ids.push(...((data ?? []).map((p) => p.constituent_id as string | null)));
    if (!data || data.length < PAGE) break;
  }
  return { ids, count };
}

const chunk = <T,>(arr: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

export default async function DonorsPage() {
  const supabase = createServerSupabase();
  const [{ gifts: allGifts, error: giftsError }, plansRes, constituentCountRes, pendingAcksRes] = await Promise.all([
    fetchAllGifts(supabase),
    fetchActivePlans(supabase),
    supabase.from("constituents").select("id", { count: "exact", head: true }),
    supabase.from("gifts").select("id", { count: "exact", head: true }).eq("acknowledgment_status", "pending"),
  ]);

  // Tables not applied yet (the migration ships ahead of the prod apply).
  if (giftsError || allGifts === null) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-ink-1 text-2xl mb-4">Donors</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
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
    dates: string[];
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
      total: 0, count: 0, first: g.gift_date, last: g.gift_date, recurring: false, dates: [],
    };
    r.dates.push(g.gift_date);
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
  let constituentFetchFailed = false;
  for (const ids of chunk(donorIds, 200)) {
    const { data, error } = await supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, emails, do_not_contact, source")
      .in("id", ids);
    if (error) {
      constituentFetchFailed = true;
      continue;
    }
    constituents.push(...((data ?? []) as Constituent[]));
  }

  const donors = constituents
    .filter((c) => rollups.has(c.id))
    .map((c) => ({ c, r: rollups.get(c.id)! }))
    .sort((a, b) => b.r.total - a.r.total);
  const nonDonorConstituents = Math.max((constituentCountRes.count ?? donors.length) - donors.length, 0);

  const totalRaised = gifts.reduce((s, g) => s + g.amount, 0);

  // ── Retention intelligence (modules/03 §Donors 5) ──
  const today = todayISO();
  const activePlanDonors = new Set(
    plansRes.ids.filter((id): id is string => id !== null)
  );
  const flagsByDonor = new Map<string, RetentionFlag[]>();
  for (const [id, r] of Array.from(rollups.entries())) {
    const { flags } = analyzeDonor(r.dates, today, activePlanDonors.has(id));
    if (flags.length > 0) flagsByDonor.set(id, flags);
  }
  const retention = retentionRate(
    Array.from(rollups.values()).map((r) => r.dates),
    today
  );
  // Chips can only render loaded constituents, but counts must reflect the
  // true flagged total (the partial-load banner explains any gap).
  const bucket = (flag: RetentionFlag) => ({
    members: donors.filter(({ c }) => flagsByDonor.get(c.id)?.includes(flag)),
    trueCount: Array.from(flagsByDonor.values()).filter((fl) => fl.includes(flag)).length,
  });
  const FLAG_STYLES: Record<RetentionFlag, string> = {
    lybunt: "bg-[#F4E8D0] text-[#A56A1B]",
    sybunt: "bg-tile text-ink-2",
    cadence_lapsed: "bg-expense-bg text-expense",
    second_gift_watch: "bg-blue-500/15 text-blue-400",
  };
  const RETENTION_BUCKETS: RetentionFlag[] = ["lybunt", "cadence_lapsed", "second_gift_watch", "sybunt"];

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3">
        <span className="font-heading font-bold text-ink-1 text-sm sm:text-base">Donors</span>
        <Link
          href="/admin/fundraising/acknowledgments"
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
            (pendingAcksRes.count ?? 0) > 0
              ? "text-orange bg-orange/10 border border-orange/30 hover:bg-orange/20"
              : "text-ink-2 hover:text-ink-1"
          }`}
        >
          Acknowledgments{(pendingAcksRes.count ?? 0) > 0 ? ` (${pendingAcksRes.count})` : ""}
        </Link>
        <span className="text-xs text-ink-2 ml-auto">
          {donors.length} donor{donors.length === 1 ? "" : "s"}
          {nonDonorConstituents > 0 ? ` · ${nonDonorConstituents} constituents without gifts` : ""}
        </span>
      </div>

      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="flex justify-end">
          <SegmentExportPanel />
        </div>
        {constituentFetchFailed && (
          <div className="bg-expense-bg border border-expense/30 rounded-xl px-5 py-3 text-expense text-sm">
            Some donor records failed to load — the table below may be missing donors that the
            totals include. Reload to retry.
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Raised" value={money(totalRaised)} sub={`${gifts.length} gifts on the spine`} />
          <StatCard label="Donors" value={donors.length} sub={anonCount > 0 ? `+ ${anonCount} anonymous gifts` : "with at least one gift"} />
          <StatCard label="Average Gift" value={gifts.length > 0 ? money(totalRaised / gifts.length) : "—"} />
          <StatCard label="Active Recurring Plans" value={plansRes.count ?? 0} sub="monthly givers" />
        </div>

        {/* ── Retention intelligence ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-heading font-bold text-ink-1 text-sm">Retention Intelligence</h2>
            <div className="text-xs text-ink-2">
              {retention.rate !== null ? (
                <>
                  <span className={`font-bold ${retention.rate >= 0.43 ? "text-revenue" : "text-[#A56A1B]"}`}>
                    {Math.round(retention.rate * 100)}%
                  </span>{" "}
                  of last year&apos;s {retention.lastYearDonors} donors retained so far this year · sector benchmark ≈ 43%
                </>
              ) : (
                "Retention rate appears once there's a full prior year of giving"
              )}
            </div>
          </div>
          {flagsByDonor.size === 0 ? (
            <p className="px-5 py-5 text-ink-2 text-sm">
              No retention flags — every donor is on their usual rhythm.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-outline">
              {RETENTION_BUCKETS.map((flag) => {
                const { members, trueCount } = bucket(flag);
                return (
                  <div key={flag} className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${FLAG_STYLES[flag]}`}>
                        {FLAG_LABELS[flag]}
                      </span>
                      <span className="text-xs text-ink-2 [font-variant-numeric:tabular-nums]">{trueCount}</span>
                    </div>
                    <p className="text-[11px] text-ink-3 mb-2 leading-snug">{FLAG_HELP[flag]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.slice(0, 6).map(({ c }) => (
                        <Link
                          key={c.id}
                          href={`/admin/fundraising/donors/${c.id}`}
                          className="text-[11px] text-ink-2 hover:text-orange bg-tile border-[1.5px] border-outline rounded-full px-2 py-0.5 transition-colors truncate max-w-[150px]"
                        >
                          {constituentName(c)}
                        </Link>
                      ))}
                      {members.length > 6 && (
                        <span className="text-[11px] text-ink-3 px-1 py-0.5">+{members.length - 6} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          {donors.length === 0 ? (
            <p className="p-8 text-ink-2 text-sm">
              No donors yet. Stripe donations flow in automatically; Givebutter and manual gift
              entry arrive later in Ring 2.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-b border-outline">
                    {["Donor", "Email", "Total Given", "Gifts", "First Gift", "Latest Gift", ""].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-ink-3 uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {donors.map(({ c, r }) => (
                    <tr key={c.id} className="border-b border-hairline hover:bg-[#EFE6D4] transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/fundraising/donors/${c.id}`} className="flex items-center gap-3 group">
                          <span className="w-8 h-8 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0 text-orange font-bold text-xs">
                            {constituentName(c)[0]?.toUpperCase()}
                          </span>
                          <span className="font-medium text-ink-1 group-hover:text-orange transition-colors">
                            {constituentName(c)}
                          </span>
                          {r.recurring && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
                          )}
                          {c.do_not_contact && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-expense-bg text-expense">Do not contact</span>
                          )}
                          {(flagsByDonor.get(c.id) ?? []).map((f) => (
                            <span key={f} title={FLAG_HELP[f]} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${FLAG_STYLES[f]}`}>
                              {FLAG_LABELS[f]}
                            </span>
                          ))}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-ink-2 text-xs">{c.emails[0] ?? "—"}</td>
                      <td className="px-5 py-3.5 font-bold text-ink-1 [font-variant-numeric:tabular-nums]">{money(r.total)}</td>
                      <td className="px-5 py-3.5 text-ink-2 [font-variant-numeric:tabular-nums]">{r.count}</td>
                      <td className="px-5 py-3.5 text-ink-2 text-xs whitespace-nowrap">{fmtDate(r.first)}</td>
                      <td className="px-5 py-3.5 text-ink-2 text-xs whitespace-nowrap">{fmtDate(r.last)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Link href={`/admin/fundraising/donors/${c.id}`} className="text-xs font-semibold text-orange hover:text-orange-mid">
                          Profile →
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {anonCount > 0 && (
                    <tr className="border-b border-hairline">
                      <td className="px-5 py-3.5 text-ink-2 italic">Anonymous / no identity</td>
                      <td className="px-5 py-3.5 text-ink-2 text-xs">—</td>
                      <td className="px-5 py-3.5 font-bold text-ink-2 [font-variant-numeric:tabular-nums]">{money(anonTotal)}</td>
                      <td className="px-5 py-3.5 text-ink-2 [font-variant-numeric:tabular-nums]">{anonCount}</td>
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
