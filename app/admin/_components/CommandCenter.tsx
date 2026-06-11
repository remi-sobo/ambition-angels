import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  CashFlowChart,
  Donut,
  money,
  type DonutSeg,
  type MonthBucket,
} from "../finance/_components/charts";
import StatCard, { type Delta } from "./StatCard";
import Greeting from "./Greeting";
import { todayISO } from "../ops/_types/ops";

// Command Center v1 (docs/bloomos/06-design-system.md §5): finance + ops +
// fundraising widgets computed live from existing data. The metric registry
// and kpi_snapshots move these to cached nightly values in a later chunk;
// org health stays a labeled placeholder until its composite is real.

// ── Small helpers ───────────────────────────────────────────────────────────

const fiscalYearBounds = (year: number, startMonth: number) => {
  if (startMonth === 1) return { start: `${year}-01-01`, end: `${year}-12-31` };
  const sm = String(startMonth).padStart(2, "0");
  const lastDay = new Date(year, startMonth - 1, 0).getDate();
  const em = String(startMonth - 1).padStart(2, "0");
  return { start: `${year - 1}-${sm}-01`, end: `${year}-${em}-${lastDay}` };
};

const monthLabel = (yyyymm: string) =>
  ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(yyyymm.slice(5, 7)) - 1] ?? "";

function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, 1));
  const e = new Date(end + "T00:00:00Z");
  while (cur <= e) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 0)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const humanizeStage = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const pctDelta = (now: number, prev: number): Delta | undefined => {
  if (prev <= 0) return undefined;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return { text: "flat vs last period", direction: "neutral" };
  return {
    text: `${Math.abs(pct)}% vs last period`,
    direction: pct > 0 ? "up" : "down",
  };
};

const CHART_COLORS = ["#E8500A", "#5B8DEF", "#2BB3A3", "#D9A406", "#8A93A6", "#E05C7A"];

// ── Widget chrome ───────────────────────────────────────────────────────────

function Widget({
  title,
  href,
  hrefLabel,
  children,
  className,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-[#1a1d27] border border-white/10 rounded-card-lg overflow-hidden ${className ?? ""}`}>
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
        <h2 className="font-heading font-bold text-cream text-sm">{title}</h2>
        {href && (
          <Link href={href} className="text-xs font-semibold text-orange hover:text-orange-mid transition-colors whitespace-nowrap">
            {hrefLabel ?? "View"} →
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-gray-mid text-sm">{children}</p>
);

// ── Data ────────────────────────────────────────────────────────────────────

type Donation = {
  created_at: string;
  amount: number;
  recurring: boolean | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  status: string | null;
};

async function loadData() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d14 = new Date(now.getTime() - 14 * 86400000).toISOString();

  const cfgRes = await supabase
    .from("fin_config")
    .select("current_year, fiscal_year_start_month, fundraising_goal, cash_starting_balance, cash_starting_date")
    .eq("id", 1)
    .maybeSingle();
  const cfg = {
    year: typeof cfgRes.data?.current_year === "number" ? cfgRes.data.current_year : now.getFullYear(),
    startMonth:
      typeof cfgRes.data?.fiscal_year_start_month === "number" ? cfgRes.data.fiscal_year_start_month : 1,
    goal: Number(cfgRes.data?.fundraising_goal ?? 0),
    startBal: Number(cfgRes.data?.cash_starting_balance ?? 0),
    startDate: (cfgRes.data?.cash_starting_date as string | null) ?? null,
  };
  const fy = fiscalYearBounds(cfg.year, cfg.startMonth);

  const [txnsRes, cashRes, monthDonationsRes, recentDonationsRes, tasksRes, openTasksRes, dealsRes, quizRes, pv7Res, pv14Res] =
    await Promise.all([
      supabase.from("fin_transactions").select("txn_date, amount").gte("txn_date", fy.start).lte("txn_date", fy.end),
      cfg.startDate
        ? supabase.from("fin_transactions").select("amount").gt("txn_date", cfg.startDate)
        : Promise.resolve({ data: [] as Array<{ amount: number }>, error: null }),
      // Month-window rows for the donor KPIs (server-side filtered so the
      // math never depends on a recency cap)…
      supabase
        .from("donations")
        .select("created_at, amount, recurring, first_name, last_name, name, email, status")
        .gte("created_at", prevMonthStart)
        .order("created_at", { ascending: false })
        .limit(2000),
      // …and a separate small fetch for the recent-donations feed.
      supabase
        .from("donations")
        .select("created_at, amount, recurring, first_name, last_name, name, email, status")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("ops_tasks")
        .select("id, title, category, due_date")
        .neq("status", "done")
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(5),
      supabase.from("ops_tasks").select("id", { count: "exact", head: true }).neq("status", "done"),
      supabase.from("hs_deals").select("stage, amount").limit(1000),
      supabase
        .from("quiz_submissions")
        .select("created_at, career_matches")
        .order("created_at", { ascending: false })
        .limit(400),
      supabase.from("page_views").select("id", { count: "exact", head: true }).gte("created_at", d7),
      supabase.from("page_views").select("id", { count: "exact", head: true }).gte("created_at", d14).lt("created_at", d7),
    ]);

  // ── Finance ──
  const txns = (txnsRes.data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
  const revenueYTD = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenseYTD = txns.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const cashOnHand = cfg.startBal + (cashRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

  const monthMap = new Map<string, { revenue: number; expense: number }>();
  monthsBetween(fy.start, fy.end).forEach((m) => monthMap.set(m, { revenue: 0, expense: 0 }));
  for (const t of txns) {
    const b = monthMap.get(t.txn_date.slice(0, 7));
    if (!b) continue;
    if (t.amount > 0) b.revenue += t.amount;
    else b.expense -= t.amount;
  }
  let running = cfg.startBal;
  const monthBuckets: MonthBucket[] = Array.from(monthMap.entries()).map(([m, b]) => {
    running += b.revenue - b.expense;
    return { label: monthLabel(m), revenue: b.revenue, expense: b.expense, ending: running };
  });
  const active = monthBuckets.filter((b) => b.revenue > 0 || b.expense > 0);
  const burn3mo = active.slice(-3).reduce((s, b) => s + b.expense, 0) / Math.max(active.slice(-3).length, 1);
  const runwayMonths = burn3mo > 0 ? cashOnHand / burn3mo : null;

  // ── Donations ──
  const succeeded = (rows: Donation[] | null) =>
    (rows ?? [])
      .map((d) => ({ ...d, amount: Number(d.amount) }))
      .filter((d) => !d.status || d.status === "succeeded");
  const monthDonations = succeeded(monthDonationsRes.data as Donation[] | null);
  const donations = succeeded(recentDonationsRes.data as Donation[] | null);
  const thisMonth = monthDonations.filter((d) => d.created_at >= monthStart);
  const prevMonth = monthDonations.filter((d) => d.created_at < monthStart);
  // Distinct donors by email (then name); all fully-anonymous gifts
  // collapse into one donor rather than inflating the count.
  const donorKey = (d: Donation) => d.email?.toLowerCase() || d.name || "anonymous";
  const donorsThisMonth = new Set(thisMonth.map(donorKey)).size;
  const donorsPrevMonth = new Set(prevMonth.map(donorKey)).size;

  // ── Pipeline ──
  const stageAgg = new Map<string, { count: number; total: number }>();
  for (const d of dealsRes.data ?? []) {
    if (!d.stage) continue;
    const cur = stageAgg.get(d.stage) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(d.amount ?? 0);
    stageAgg.set(d.stage, cur);
  }
  const stages = Array.from(stageAgg.entries())
    .map(([stage, v]) => ({ stage: humanizeStage(stage), ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const pipelineTotal = Array.from(stageAgg.values()).reduce((s, v) => s + v.total, 0);

  // ── Career interests ──
  const careerCounts = new Map<string, number>();
  for (const q of quizRes.data ?? []) {
    const matches = (q.career_matches as Array<{ title?: string }> | null) ?? [];
    const top = matches[0]?.title;
    if (top) careerCounts.set(top, (careerCounts.get(top) ?? 0) + 1);
  }
  const topCareers = Array.from(careerCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  // Center number = submissions the donut actually summarizes (same window
  // as the segments), not a different period.
  const quizCounted = Array.from(careerCounts.values()).reduce((s, n) => s + n, 0);

  return {
    cfg,
    revenueYTD,
    expenseYTD,
    cashOnHand,
    runwayMonths,
    monthBuckets,
    donations,
    donorsThisMonth,
    donorsPrevMonth,
    thisMonthCount: thisMonth.length,
    tasks: tasksRes.data ?? [],
    openTaskCount: openTasksRes.count ?? 0,
    stages,
    pipelineTotal,
    topCareers,
    quizCounted,
    pv7: pv7Res.count ?? 0,
    pv14: pv14Res.count ?? 0,
  };
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function CommandCenter() {
  const d = await loadData();
  // Same "today" the ops module uses for due-date math (server-local day,
  // not UTC), so badges here always agree with the Tasks pages.
  const today = todayISO();

  const donorName = (x: Donation) =>
    [x.first_name, x.last_name].filter(Boolean).join(" ") || x.name || x.email || "Anonymous";

  const careerSegs: DonutSeg[] = d.topCareers.map(([label, value], i) => ({
    label,
    value,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 space-y-6">
        <Greeting org="Ambition Angels" />

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Revenue Raised"
            value={money(d.revenueYTD)}
            sub={d.cfg.goal > 0 ? `of ${money(d.cfg.goal)} FY goal` : `FY ${d.cfg.year}`}
            delta={
              d.cfg.goal > 0
                ? { text: `${Math.round((d.revenueYTD / d.cfg.goal) * 100)}% of goal`, direction: "neutral" }
                : undefined
            }
          />
          <StatCard
            label="Months of Runway"
            value={d.runwayMonths === null ? "—" : d.runwayMonths.toFixed(1)}
            sub={`${money(d.cashOnHand)} cash on hand`}
            spark={d.monthBuckets.filter((b) => b.revenue > 0 || b.expense > 0).map((b) => b.ending)}
          />
          <StatCard
            label="Donors This Month"
            value={d.donorsThisMonth}
            sub={`${d.thisMonthCount} gift${d.thisMonthCount === 1 ? "" : "s"}`}
            delta={pctDelta(d.donorsThisMonth, d.donorsPrevMonth)}
          />
          <StatCard
            label="Weekly Engagement"
            value={d.pv7.toLocaleString()}
            sub="site page views, 7 days"
            delta={pctDelta(d.pv7, d.pv14)}
          />
          <StatCard
            label="Organizational Health"
            value={<span>—<span className="text-white/20 text-lg">/100</span></span>}
            sub="composite lands with the metric registry"
            muted
          />
        </div>

        {/* ── Row: financial health + pipeline ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Widget title="Financial Health" href="/admin/finance" hrefLabel="Finance" className="lg:col-span-7">
            <div className="grid grid-cols-3 gap-4 mb-5">
              {[
                { label: "Revenue YTD", value: money(d.revenueYTD), cls: "text-green-400" },
                { label: "Expenses YTD", value: money(d.expenseYTD), cls: "text-red-400" },
                {
                  label: "Net Surplus",
                  value: money(d.revenueYTD - d.expenseYTD),
                  cls: d.revenueYTD - d.expenseYTD >= 0 ? "text-green-400" : "text-red-400",
                },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-[11px] uppercase tracking-wider text-white/35 font-semibold mb-1">{s.label}</div>
                  <div className={`font-heading font-semibold text-lg [font-variant-numeric:tabular-nums] ${s.cls}`}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
            {d.monthBuckets.some((b) => b.revenue > 0 || b.expense > 0) ? (
              <div className="overflow-x-auto">
                <CashFlowChart data={d.monthBuckets} width={760} height={200} />
              </div>
            ) : (
              <Empty>No transactions recorded for FY {d.cfg.year} yet — import them under Finance.</Empty>
            )}
          </Widget>

          <Widget title="Fundraising Pipeline" href="/admin/fundraising" hrefLabel="Major Gifts" className="lg:col-span-5">
            {d.stages.length === 0 ? (
              <Empty>No deals synced yet. Run a HubSpot sync from the sidebar to populate the pipeline.</Empty>
            ) : (
              <>
                <div className="mb-4">
                  <span className="font-heading font-semibold text-cream text-xl [font-variant-numeric:tabular-nums]">
                    {money(d.pipelineTotal)}
                  </span>
                  <span className="text-xs text-gray-mid ml-2">total pipeline</span>
                </div>
                <div className="space-y-3">
                  {d.stages.map((s) => {
                    const pct = d.pipelineTotal > 0 ? Math.max((s.total / d.pipelineTotal) * 100, 2) : 2;
                    return (
                      <div key={s.stage}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-cream/80 font-medium truncate">{s.stage}</span>
                          <span className="text-gray-mid whitespace-nowrap ml-2 [font-variant-numeric:tabular-nums]">
                            {s.count} · {money(s.total)}
                          </span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-orange" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Widget>
        </div>

        {/* ── Row: priorities + donations + careers ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Widget title="Upcoming Priorities" href="/admin/ops" hrefLabel={`All tasks (${d.openTaskCount})`} className="lg:col-span-4">
            {d.tasks.length === 0 ? (
              <Empty>
                {d.openTaskCount > 0
                  ? `${d.openTaskCount} open task${d.openTaskCount === 1 ? "" : "s"}, none with a due date — set dates under Operations → Tasks to surface them here.`
                  : "Nothing due — add tasks under Operations → Tasks."}
              </Empty>
            ) : (
              <ul className="space-y-2.5">
                {d.tasks.map((t) => {
                  const overdue = t.due_date! < today;
                  const isToday = t.due_date === today;
                  return (
                    <li key={t.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-cream/90 font-medium truncate">{t.title}</div>
                        <div className="text-[11px] text-gray-mid capitalize">{t.category}</div>
                      </div>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          overdue
                            ? "bg-red-500/15 text-red-400"
                            : isToday
                            ? "bg-orange/15 text-orange"
                            : "bg-white/5 text-gray-mid"
                        }`}
                      >
                        {overdue ? "Overdue" : isToday ? "Today" : t.due_date}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Widget>

          <Widget title="Recent Donations" href="/admin/legacy" hrefLabel="Full history" className="lg:col-span-4">
            {d.donations.length === 0 ? (
              <Empty>No donations recorded yet.</Empty>
            ) : (
              <ul className="space-y-1">
                {d.donations.slice(0, 5).map((x, i) => (
                  <li key={i} className="flex items-center gap-3 py-1.5">
                    <div className="w-8 h-8 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-orange font-bold text-xs">{donorName(x)[0]?.toUpperCase() ?? "$"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-cream/90 font-medium truncate block">{donorName(x)}</span>
                      <span className="text-[11px] text-gray-mid">{timeAgo(x.created_at)}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-cream [font-variant-numeric:tabular-nums]">{money(x.amount)}</div>
                      {x.recurring && <div className="text-[10px] text-orange font-semibold">Monthly</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          <Widget title="Top Career Interests" href="/admin/legacy" hrefLabel="Quiz data" className="lg:col-span-4">
            {careerSegs.length === 0 ? (
              <Empty>No career-quiz submissions yet.</Empty>
            ) : (
              <Donut
                segments={careerSegs}
                size={140}
                thickness={20}
                centerLabel="recent quizzes"
                centerValue={String(d.quizCounted)}
                formatValue={(n) => n.toLocaleString()}
              />
            )}
          </Widget>
        </div>

        <div className="text-xs text-gray-mid pt-2">
          Looking for the quiz and donation tables?{" "}
          <Link href="/admin/legacy" className="text-orange hover:text-orange-mid font-semibold">
            Open the legacy dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}
