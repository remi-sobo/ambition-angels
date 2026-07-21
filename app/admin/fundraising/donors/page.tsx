import Link from "next/link";
import SegmentExportPanel from "./_components/SegmentExportPanel";
import DonorsTable, { type DonorRow } from "./_components/DonorsTable";
import { NewDonorForm } from "./_components/ConstituentControls";
import FilterTabs from "../_components/FilterTabs";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../finance/_components/charts";
import StatCard, { type Delta } from "../../_components/StatCard";
import PageHeader from "../../_components/PageHeader";
import { constituentName } from "@/lib/fundraising/display";
import { analyzeDonor, retentionRate, FLAG_LABELS, FLAG_HELP, type RetentionFlag } from "@/lib/fundraising/retention";
import { scoreDonor } from "@/lib/fundraising/engagement";
import { deriveLifecycleStage, MAJOR_DONOR_THRESHOLD, type LifecycleStage } from "@/lib/fundraising/lifecycle";
import { todayISO } from "../../ops/_types/ops";
import { TYPE } from "@/lib/admin/typeScale";

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

// Retention flags double as URL segments so the intelligence tiles are
// clickable: ?segment=lybunt shows exactly the donors behind the count.
const RETENTION_SEGMENTS: readonly RetentionFlag[] = [
  "lybunt",
  "cadence_lapsed",
  "second_gift_watch",
  "sybunt",
];

type SegmentKey =
  | "all"
  | "individual"
  | "organization"
  | "major"
  | "lapsed"
  | "archived"
  | RetentionFlag;

// Lifecycle-stage filter values. "prospect" is deliberately absent: this
// table lists constituents with at least one gift, and prospects by
// definition have none, so a Prospect tab would always be empty here.
const STAGE_FILTERS: readonly LifecycleStage[] = ["first_time", "repeat", "recurring", "major"];

export default async function DonorsPage({
  searchParams,
}: {
  searchParams?: { year?: string; segment?: string; stage?: string };
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
        <h1 className={`${TYPE.pageTitle} mb-4`}>Donors</h1>
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
  const retentionSegment = (RETENTION_SEGMENTS as readonly string[]).includes(segment)
    ? (segment as RetentionFlag)
    : null;
  const stageParam = searchParams?.stage ?? "all";
  const stageFilter = (STAGE_FILTERS as readonly string[]).includes(stageParam)
    ? (stageParam as LifecycleStage)
    : null;
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
  // selected, lifetime when "all time". Retention segments always run on
  // lifetime — a LYBUNT donor has no gifts this year by definition, so the
  // period map would render them invisible (exactly the bug the clickable
  // tiles exist to fix).
  const displayRollups = year === "all" || retentionSegment ? null : periodRollups;

  // Fetch constituents for every donor with a gift EVER (not just the
  // selected period): retention tiles and segments must be able to name
  // donors whose whole point is that they haven't given recently. No
  // arbitrary list cap can drop a donor whose gifts we counted.
  const donorIds = Array.from(rollupsAll.keys());
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

  // Lifecycle stage per donor — always over lifetime rollups (a stage is a
  // cross-year designation, like major/lapsed), same derivation the profile
  // uses so the two surfaces reconcile.
  const stageByDonor = new Map<string, LifecycleStage>();
  for (const [id, r] of Array.from(rollupsAll.entries())) {
    stageByDonor.set(
      id,
      deriveLifecycleStage({
        giftCount: r.count,
        lifetimeAmount: r.total,
        hasActiveRecurringPlan: activePlanDonors.has(id),
      })
    );
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
      case "lybunt":
      case "sybunt":
      case "cadence_lapsed":
      case "second_gift_watch":
        return (flagsByDonor.get(c.id) ?? []).includes(segment);
      default: return true;
    }
  };

  const donors = constituents
    .filter((c) => (displayRollups ?? rollupsAll).has(c.id))
    // Archived donors are hidden everywhere except the Archived segment.
    .filter((c) => (segment === "archived" ? !!c.archived_at : !c.archived_at))
    .filter(matchesSegment)
    .filter((c) => !stageFilter || stageByDonor.get(c.id) === stageFilter)
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
  const stageOptions = [
    { value: "all", label: "All stages" },
    { value: "first_time", label: "First-time" },
    { value: "repeat", label: "Repeat" },
    { value: "recurring", label: "Recurring" },
    { value: "major", label: "Major" },
  ];
  const segmentLabel = retentionSegment
    ? FLAG_LABELS[retentionSegment]
    : segmentOptions.find((s) => s.value === segment)?.label ?? "All";

  // Open tasks linked to donors — for the "Tasks" column. Read on the SESSION
  // client so RLS scopes ops_tasks to the caller's org (the service-role client
  // bypasses RLS and would count every tenant's tasks).
  const openTaskCount = new Map<string, number>();
  const overdueTaskCount = new Map<string, number>();
  {
    const { data: taskRows } = await supabase
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
      stage: stageByDonor.get(c.id) ?? "prospect",
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
  // Tile membership comes from the all-time flag map, NOT the year-filtered
  // list — under "This year" a LYBUNT donor has no period gifts, and the old
  // donors-list scan rendered a bare count with nobody behind it.
  const constituentById = new Map(constituents.map((c) => [c.id, c]));
  const bucket = (flag: RetentionFlag) =>
    Array.from(flagsByDonor.entries())
      .filter(([, fl]) => fl.includes(flag))
      .map(([id]) => ({ c: constituentById.get(id), r: rollupsAll.get(id) }))
      .filter((m): m is { c: Constituent; r: Rollup } => !!m.c && !m.c.archived_at && !!m.r)
      .sort((a, b) => b.r.total - a.r.total);
  const segmentHref = (seg: string) =>
    `/admin/fundraising/donors?year=${encodeURIComponent(year)}&segment=${encodeURIComponent(seg)}&stage=${encodeURIComponent(stageParam)}`;

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
              <Link href="/admin/imports" className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors">Import CSV</Link>
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
          <FilterTabs options={yearOptions} current={year} paramKey="year" basePath="/admin/fundraising/donors" extraParams={{ segment, stage: stageParam }} />
          <FilterTabs options={segmentOptions} current={segment} paramKey="segment" basePath="/admin/fundraising/donors" extraParams={{ year, stage: stageParam }} size="sm" />
          <FilterTabs options={stageOptions} current={stageParam} paramKey="stage" basePath="/admin/fundraising/donors" extraParams={{ year, segment }} size="sm" />
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
            <h2 className={TYPE.cardTitle}>Retention Intelligence</h2>
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
            <p className={`px-5 py-5 ${TYPE.bodyMuted}`}>
              No retention flags — every donor is on their usual rhythm.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-outline">
              {RETENTION_SEGMENTS.map((flag) => {
                const members = bucket(flag);
                const active = retentionSegment === flag;
                return (
                  <div key={flag} className={`px-5 py-4 ${active ? "bg-orange/5" : ""}`}>
                    <Link
                      href={active ? segmentHref("all") : segmentHref(flag)}
                      title={active ? "Clear this filter" : `Show all ${members.length} in the table below`}
                      className="group flex items-center gap-2 mb-2"
                    >
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${FLAG_STYLES[flag]} ${active ? "ring-1 ring-orange" : ""}`}>
                        {FLAG_LABELS[flag]}
                      </span>
                      <span className="text-xs text-ink-2 [font-variant-numeric:tabular-nums]">{members.length}</span>
                      <span className="ml-auto text-[11px] font-semibold text-orange opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {active ? "Clear ✕" : "View all →"}
                      </span>
                    </Link>
                    <p className="text-[11px] text-ink-3 mb-2 leading-snug">{FLAG_HELP[flag]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.slice(0, 6).map(({ c, r }) => (
                        <Link
                          key={c.id}
                          href={`/admin/fundraising/donors/${c.id}`}
                          title={`${money(r.total)} lifetime · last gift ${r.last}`}
                          className="text-[11px] text-ink-2 hover:text-orange bg-tile border-[1.5px] border-outline rounded-full px-2 py-0.5 transition-colors truncate max-w-[150px]"
                        >
                          {constituentName(c)}
                        </Link>
                      ))}
                      {members.length > 6 && (
                        <Link href={segmentHref(flag)} className="text-[11px] text-ink-3 hover:text-orange px-1 py-0.5">
                          +{members.length - 6} more →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Active retention filter banner ── */}
        {retentionSegment && (
          <div className="bg-orange/10 border border-orange/30 rounded-xl px-5 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-ink-1">
              Showing <span className="font-bold">{donors.length}</span>{" "}
              <span className="font-bold uppercase">{FLAG_LABELS[retentionSegment]}</span>{" "}
              donor{donors.length === 1 ? "" : "s"} — {FLAG_HELP[retentionSegment].toLowerCase()}.
              Totals below are lifetime giving. Open a profile, or select rows to create follow-up
              tasks in bulk.
            </span>
            <Link
              href={segmentHref("all")}
              className="ml-auto text-xs font-semibold text-orange hover:text-orange-dark whitespace-nowrap"
            >
              Clear filter ✕
            </Link>
          </div>
        )}

        {donors.length === 0 ? (
          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <p className={`p-8 ${TYPE.bodyMuted}`}>
              No donors match this filter{year === "all" ? "" : ` for ${yearLabel}`}. Try a different
              year or segment.
            </p>
          </section>
        ) : (
          <>
            <DonorsTable
              rows={donorRows}
              taskContext={retentionSegment ? FLAG_LABELS[retentionSegment] : undefined}
            />
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
