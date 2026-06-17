import Link from "next/link";
import SegmentExportPanel from "./_components/SegmentExportPanel";
import DonorsTable, { type DonorRow } from "./_components/DonorsTable";
import { NewDonorForm } from "./_components/ConstituentControls";
import FilterTabs from "../_components/FilterTabs";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { money } from "../../finance/_components/charts";
import StatCard, { type Delta } from "../../_components/StatCard";
import PageHeader from "../../_components/PageHeader";
import { constituentName } from "@/lib/fundraising/display";
import { analyzeDonor, retentionRate, FLAG_LABELS, FLAG_HELP, type RetentionFlag } from "@/lib/fundraising/retention";
import { scoreDonor } from "@/lib/fundraising/engagement";
import { todayISO } from "../../ops/_types/ops";

// Donors v1 (Ring 2): constituent list with giving rollups, fed by the
// fundraising core schema. Gift ingestion is automatic (Stripe trigger);
// Givebutter and manual entry land in later chunks.
export const dynamic = "force-dynamic";

// $10k+ lifetime giving marks a major donor (derived segment, not a tag).
const MAJOR_DONOR_THRESHOLD = 10000;

type Constituent = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[];
  do_not_contact: boolean;
  source: string;
  archived_at: string | null;
};

type Gift = {
  constituent_id: string | null;
  amount: number;
  gift_date: string;
  recurring_plan_id: string | null;
};

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

type SegmentKey = "all" | "individual" | "organization" | "major" | "lapsed" | "archived";

export default async function DonorsPage({
  searchParams,
}: {
  searchParams?: { year?: string; segment?: string };
}) {
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

  // ── Filters (URL-driven) ────────────────────────────────────────────────
  // Year is the calendar fiscal year and scopes KPIs + the donor table by
  // gift_date. Retention and the major/lapsed segments stay all-time/lifetime
  // because they are inherently cross-year designations.
  const currentYear = new Date().getFullYear();
  const year = searchParams?.year ?? String(currentYear);
  const segment = (searchParams?.segment ?? "all") as SegmentKey;
  const inYear = (iso: string) => year === "all" || iso.slice(0, 4) === year;

  type Rollup = {
    total: number;
    count: number;
    first: string;
    last: string;
    recurring: boolean;
    dates: string[];
  };
  // All-time rollups: lifetime total (major), full date history (retention,
  // engagement). Period rollups: total + count within the selected year.
  const rollupsAll = new Map<string, Rollup>();
  const periodRollups = new Map<string, { total: number; count: number }>();
  let anonTotal = 0;
  let anonCount = 0;
  for (const g of gifts) {
    const inPeriod = inYear(g.gift_date);
    if (!g.constituent_id) {
      if (inPeriod) {
        anonTotal += g.amount;
        anonCount += 1;
      }
      continue;
    }
    const r = rollupsAll.get(g.constituent_id) ?? {
      total: 0, count: 0, first: g.gift_date, last: g.gift_date, recurring: false, dates: [],
    };
    r.dates.push(g.gift_date);
    r.total += g.amount;
    r.count += 1;
    if (g.gift_date < r.first) r.first = g.gift_date;
    if (g.gift_date > r.last) r.last = g.gift_date;
    if (g.recurring_plan_id) r.recurring = true;
    rollupsAll.set(g.constituent_id, r);

    if (inPeriod) {
      const p = periodRollups.get(g.constituent_id) ?? { total: 0, count: 0 };
      p.total += g.amount;
      p.count += 1;
      periodRollups.set(g.constituent_id, p);
    }
  }

  // The rollup map that drives the visible list: period when a year is
  // selected, lifetime when "all time".
  const displayRollups = year === "all" ? null : periodRollups;
  const donorIds = Array.from((displayRollups ?? rollupsAll).keys());

  // Fetch exactly the constituents that have gifts, by id — no arbitrary
  // list cap can drop a donor whose gifts we counted.
  const constituents: Constituent[] = [];
  let constituentFetchFailed = false;
  for (const ids of chunk(donorIds, 200)) {
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, emails, do_not_contact, source, archived_at")
      .in("id", ids);
    if (error) {
      constituentFetchFailed = true;
      continue;
    }
    constituents.push(...((data ?? []) as Constituent[]));
  }

  // ── Retention intelligence (modules/03 §Donors 5) — always all-time ──
  const today = todayISO();
  const activePlanDonors = new Set(
    plansRes.ids.filter((id): id is string => id !== null)
  );
  const flagsByDonor = new Map<string, RetentionFlag[]>();
  for (const [id, r] of Array.from(rollupsAll.entries())) {
    const { flags } = analyzeDonor(r.dates, today, activePlanDonors.has(id));
    if (flags.length > 0) flagsByDonor.set(id, flags);
  }
  const retention = retentionRate(
    Array.from(rollupsAll.values()).map((r) => r.dates),
    today
  );

  // Segment filter (derived, not tags).
  const isLapsed = (id: string) => {
    const f = flagsByDonor.get(id) ?? [];
    return f.includes("lybunt") || f.includes("sybunt");
  };
  const matchesSegment = (c: Constituent): boolean => {
    switch (segment) {
      case "individual": return c.type === "person";
      case "organization": return c.type === "organization";
      case "major": return (rollupsAll.get(c.id)?.total ?? 0) >= MAJOR_DONOR_THRESHOLD;
      case "lapsed": return isLapsed(c.id);
      default: return true;
    }
  };

  const donors = constituents
    .filter((c) => (displayRollups ?? rollupsAll).has(c.id))
    // Archived donors are hidden everywhere except the Archived segment.
    .filter((c) => (segment === "archived" ? !!c.archived_at : !c.archived_at))
    .filter(matchesSegment)
    .map((c) => {
      const lifetime = rollupsAll.get(c.id)!;
      const shown = (displayRollups ?? rollupsAll).get(c.id)!;
      return { c, lifetime, total: shown.total, count: shown.count };
    })
    .sort((a, b) => b.total - a.total);
  const nonDonorConstituents = Math.max(
    (constituentCountRes.count ?? 0) - (displayRollups ?? rollupsAll).size,
    0
  );

  // ── KPIs (scoped to the selected year) ──
  const periodGifts = gifts.filter((g) => inYear(g.gift_date));
  const totalRaised = periodGifts.reduce((s, g) => s + g.amount, 0);
  const periodGiftCount = periodGifts.length;
  const priorYear = year === "all" ? null : String(Number(year) - 1);
  const priorRaised = priorYear
    ? gifts.filter((g) => g.gift_date.slice(0, 4) === priorYear).reduce((s, g) => s + g.amount, 0)
    : null;
  const raisedDelta: Delta | undefined =
    priorRaised && priorRaised > 0
      ? {
          text: `${totalRaised >= priorRaised ? "+" : ""}${Math.round(
            ((totalRaised - priorRaised) / priorRaised) * 100
          )}% vs ${priorYear}`,
          direction: totalRaised >= priorRaised ? "up" : "down",
        }
      : undefined;

  const yearLabel = year === "all" ? "all time" : year;
  const yearOptions = [
    { value: String(currentYear), label: "This year" },
    { value: String(currentYear - 1), label: "Last year" },
    { value: "all", label: "All time" },
  ];
  const segmentOptions = [
    { value: "all", label: "All" },
    { value: "individual", label: "Individuals" },
    { value: "organization", label: "Organizations" },
    { value: "major", label: "Major ($10k+)" },
    { value: "lapsed", label: "Lapsed" },
    { value: "archived", label: "Archived" },
  ];
  const segmentLabel = segmentOptions.find((s) => s.value === segment)?.label ?? "All";

  // Open tasks linked to donors — for the "Tasks" column. ops_tasks has RLS
  // disabled, so read it with the service-role client (the page otherwise
  // uses the session client).
  const openTaskCount = new Map<string, number>();
  const overdueTaskCount = new Map<string, number>();
  {
    const { data: taskRows } = await getSupabaseAdmin()
      .from("ops_tasks")
      .select("linked_entity_id, due_date")
      .eq("linked_entity_type", "constituent")
      .neq("status", "done")
      .limit(5000);
    for (const t of (taskRows ?? []) as Array<{ linked_entity_id: string | null; due_date: string | null }>) {
      if (!t.linked_entity_id) continue;
      openTaskCount.set(t.linked_entity_id, (openTaskCount.get(t.linked_entity_id) ?? 0) + 1);
      if (t.due_date && t.due_date < today) {
        overdueTaskCount.set(t.linked_entity_id, (overdueTaskCount.get(t.linked_entity_id) ?? 0) + 1);
      }
    }
  }

  // Plain, serializable rows for the shared DataTable (a client component).
  // Display total/count respect the year; engagement is scored over lifetime.
  const donorRows: DonorRow[] = donors.map(({ c, lifetime, total, count }) => {
    const eng = scoreDonor(lifetime.dates, lifetime.total, lifetime.recurring, today);
    return {
      id: c.id,
      name: constituentName(c),
      email: c.emails[0] ?? null,
      total,
      count,
      first: lifetime.first,
      last: lifetime.last,
      recurring: lifetime.recurring,
      doNotContact: c.do_not_contact,
      flags: flagsByDonor.get(c.id) ?? [],
      engagement: eng.score,
      band: eng.band,
      openTasks: openTaskCount.get(c.id) ?? 0,
      overdueTasks: overdueTaskCount.get(c.id) ?? 0,
    };
  });

  const FLAG_STYLES: Record<RetentionFlag, string> = {
    lybunt: "bg-[#F4E8D0] text-[#A56A1B]",
    sybunt: "bg-tile text-ink-2",
    cadence_lapsed: "bg-expense-bg text-expense",
    second_gift_watch: "bg-blue-500/15 text-blue-400",
  };
  const RETENTION_BUCKETS: RetentionFlag[] = ["lybunt", "cadence_lapsed", "second_gift_watch", "sybunt"];
  const bucket = (flag: RetentionFlag) => ({
    members: donors.filter(({ c }) => flagsByDonor.get(c.id)?.includes(flag)),
    trueCount: Array.from(flagsByDonor.values()).filter((fl) => fl.includes(flag)).length,
  });

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          title="Donors"
          subtitle={
            `${donors.length} donor${donors.length === 1 ? "" : "s"}` +
            (segment === "all" && nonDonorConstituents > 0 ? ` · ${nonDonorConstituents} constituents without gifts` : "")
          }
          actions={
            <div className="flex items-center gap-3">
              <Link href="/admin/fundraising/comms" className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors">Comms</Link>
              <Link href="/admin/fundraising/journeys" className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors">Journeys</Link>
              <Link href="/admin/fundraising/recurring" className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors">Recurring</Link>
              <Link href="/admin/fundraising/pledges" className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors">Pledges</Link>
              <Link href="/admin/fundraising/reports" className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors">Reports</Link>
              <Link href="/admin/fundraising/settings" className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors">Settings</Link>
              <Link
                href="/admin/fundraising/acknowledgments"
                className={`text-xs font-semibold px-4 py-2 rounded-full transition-colors ${
                  (pendingAcksRes.count ?? 0) > 0
                    ? "text-orange bg-orange/10 border border-orange/30 hover:bg-orange/20"
                    : "text-ink-2 hover:text-ink-1 border-[1.5px] border-outline bg-tile"
                }`}
              >
                Acknowledgments{(pendingAcksRes.count ?? 0) > 0 ? ` (${pendingAcksRes.count})` : ""}
              </Link>
              <NewDonorForm />
            </div>
          }
        />

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-3">
          <FilterTabs options={yearOptions} current={year} paramKey="year" basePath="/admin/fundraising/donors" extraParams={{ segment }} />
          <FilterTabs options={segmentOptions} current={segment} paramKey="segment" basePath="/admin/fundraising/donors" extraParams={{ year }} size="sm" />
          <div className="ml-auto">
            <SegmentExportPanel />
          </div>
        </div>

        {constituentFetchFailed && (
          <div className="bg-expense-bg border border-expense/30 rounded-xl px-5 py-3 text-expense text-sm">
            Some donor records failed to load — the table below may be missing donors that the
            totals include. Reload to retry.
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Raised" value={money(totalRaised)} sub={`${periodGiftCount} gifts · ${yearLabel}`} delta={raisedDelta} />
          <StatCard label="Donors" value={donors.length} sub={segment === "all" ? `gave ${yearLabel}` : segmentLabel} />
          <StatCard label="Average Gift" value={periodGiftCount > 0 ? money(totalRaised / periodGiftCount) : "—"} sub={yearLabel} />
          <StatCard label="Active Recurring Plans" value={plansRes.count ?? 0} sub="monthly givers" />
        </div>

        {/* ── Retention intelligence (always year-over-year) ── */}
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

        {donors.length === 0 ? (
          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <p className="p-8 text-ink-2 text-sm">
              No donors match this filter{year === "all" ? "" : ` for ${yearLabel}`}. Try a different
              year or segment.
            </p>
          </section>
        ) : (
          <>
            <DonorsTable rows={donorRows} />
            {segment === "all" && anonCount > 0 && (
              <p className="text-xs text-ink-3 px-1">
                Plus {anonCount} anonymous gift{anonCount === 1 ? "" : "s"} totaling{" "}
                <span className="font-semibold text-ink-2 [font-variant-numeric:tabular-nums]">{money(anonTotal)}</span>{" "}
                with no donor identity (not shown in the table; counted in totals above).
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
