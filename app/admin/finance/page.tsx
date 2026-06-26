import Link from "next/link";
import SectionHeading from "../_components/SectionHeading";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FinCategory } from "@/lib/finance/types";
import { loadHubSpotPledges } from "@/lib/finance/hubspot-pledges";
import {
  CashFlowChart,
  CircleGauge,
  Donut,
  ProgressBar,
  Sparkline,
  money,
  type DonutSeg,
} from "./_components/charts";
import PageHeader from "../_components/PageHeader";
import { getFinanceSnapshot, fiscalYearBounds } from "@/lib/admin/finance";
import { endOfMonthISO, type RunwayPledge } from "@/lib/finance/runway";
import ReconcileCard from "./_components/ReconcileCard";
import RunwayTiers from "./_components/RunwayTiers";

// ── Page ───────────────────────────────────────────────────────────────────

export default async function FinanceDashboardPage() {
  const supabase = getSupabaseAdmin();

  // Canonical numbers (cash, runway, burn, monthly series, YTD) come from the
  // shared snapshot, so the dashboard, the CEO cockpit, and the briefing engine
  // never disagree. The dashboard layers per-category detail on top.
  const snap = await getFinanceSnapshot();
  const cfg = snap.cfg;
  const fy = fiscalYearBounds(cfg.year, cfg.startMonth);

  const [
    catsRes,
    txnsRes,
    budgetRes,
    pledgesRes,
    uncatRes,
    recentRes,
    hubspotPledges,
  ] = await Promise.all([
    supabase
      .from("fin_categories")
      .select("id, group_name, display_name, kind, functional_class, sort_order, enabled")
      .eq("enabled", true)
      .order("sort_order"),
    // Fiscal-year transactions with category — for YTD-by-category, donuts, budget.
    supabase
      .from("fin_transactions")
      .select("txn_date, amount, category_id, restricted")
      .gte("txn_date", fy.start)
      .lte("txn_date", fy.end),
    supabase
      .from("fin_budget")
      .select("category_id, base_amount, contingency_t1, contingency_t2, activated_contingency")
      .eq("year", cfg.year),
    supabase
      .from("fin_revenue_commitments")
      .select("source_type, amount, status, probability, expected_date, restricted, external_ref")
      .eq("year", cfg.year),
    supabase
      .from("fin_transactions")
      .select("id", { count: "exact", head: true })
      .is("category_id", null),
    supabase
      .from("fin_transactions")
      .select("id, txn_date, description, amount, category_id")
      .order("txn_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(10),
    loadHubSpotPledges(supabase, cfg.year),
  ]);

  const categories = (catsRes.data ?? []) as FinCategory[];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const txns =
    (txnsRes.data ?? []) as Array<{
      txn_date: string;
      amount: number;
      category_id: string | null;
      restricted: boolean;
    }>;
  txns.forEach((t) => (t.amount = Number(t.amount)));

  // Canonical cash / runway / monthly series / YTD — one source of truth
  // (lib/admin/finance.ts), shared with the cockpit and the briefing.
  const { cashOnHand, burn3mo, monthBuckets, expenseYTD, netYTD } = snap;

  // ── Functional split donut (expenses by program / admin / fundraising) ──
  const functionalTotals = { program: 0, admin: 0, fundraising: 0, uncategorized: 0 };
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const cat = t.category_id ? catById.get(t.category_id) : null;
    const cls = cat?.functional_class;
    if (cls === "program") functionalTotals.program += -t.amount;
    else if (cls === "admin") functionalTotals.admin += -t.amount;
    else if (cls === "fundraising") functionalTotals.fundraising += -t.amount;
    else functionalTotals.uncategorized += -t.amount;
  }
  const functionalSegs: DonutSeg[] = [
    { label: "Program", value: functionalTotals.program, color: "#C0703C" },
    { label: "Admin", value: functionalTotals.admin, color: "#2A201A" },
    { label: "Fundraising", value: functionalTotals.fundraising, color: "#2F7D5B" },
    { label: "Uncategorized", value: functionalTotals.uncategorized, color: "#B5762A" },
  ].filter((s) => s.value > 0.0001);

  // ── Revenue source mix (from pledges + actual revenue txns) ────────────
  const pledges = (pledgesRes.data ?? []) as Array<{
    source_type: string;
    amount: number;
    status: string;
    probability: number | null;
    expected_date: string | null;
    restricted: boolean;
    external_ref: string | null;
  }>;
  // HubSpot deals adopted into Bloom (by external_ref) count from the Bloom
  // side now — drop them from the HubSpot sums + runway list to avoid double-count.
  const adoptedRefs = new Set(
    pledges.map((p) => p.external_ref).filter((r): r is string => !!r)
  );
  const visibleHubspot = hubspotPledges.filter((p) => !adoptedRefs.has(p.deal_id));
  const sourceTotals = new Map<string, number>();
  for (const p of pledges) {
    if (p.status !== "received") continue;
    sourceTotals.set(
      p.source_type,
      (sourceTotals.get(p.source_type) ?? 0) + Number(p.amount)
    );
  }
  // Augment with bank-side revenue not yet matched to a pledge — use the
  // category's id prefix to route to a source type.
  const sourceFromCat: Record<string, string> = {
    "revenue.foundations": "foundation",
    "revenue.individuals": "individual",
    "revenue.corporate": "corporate",
    "revenue.gov-grants": "government",
    "revenue.accelerator": "accelerator",
    "revenue.earned": "earned",
    "revenue.interest": "other",
    "revenue.other": "other",
  };
  for (const t of txns) {
    if (t.amount <= 0) continue;
    const cat = t.category_id ? catById.get(t.category_id) : null;
    const src = cat ? sourceFromCat[cat.id] ?? "other" : "other";
    sourceTotals.set(src, (sourceTotals.get(src) ?? 0) + t.amount);
  }
  const SOURCE_COLOR: Record<string, string> = {
    foundation: "#2F7D5B",
    individual: "#C0703C",
    corporate: "#B5762A",
    government: "#2A201A",
    accelerator: "#a78bfa",
    earned: "#60a5fa",
    other: "#9A8B7C",
  };
  const sourceSegs: DonutSeg[] = Array.from(sourceTotals.entries())
    .map(([k, v]) => ({
      label: k.charAt(0).toUpperCase() + k.slice(1),
      value: v,
      color: SOURCE_COLOR[k] ?? "#9A8B7C",
    }))
    .sort((a, b) => b.value - a.value);

  // ── Pledges summary ────────────────────────────────────────────────────
  // Manual pledges (fin_revenue_commitments) PLUS HubSpot deals that map
  // to a counted bucket. The HubSpot Sync button in the sidebar refreshes
  // the underlying hs_deals table; this just sums what's there.
  const securedTotal =
    pledges
      .filter((p) => p.status === "secured")
      .reduce((s, p) => s + Number(p.amount), 0) +
    visibleHubspot
      .filter((p) => p.status ==="secured")
      .reduce((s, p) => s + p.amount, 0);
  const receivedTotal =
    pledges
      .filter((p) => p.status === "received")
      .reduce((s, p) => s + Number(p.amount), 0) +
    visibleHubspot
      .filter((p) => p.status ==="received")
      .reduce((s, p) => s + p.amount, 0);
  const projectedWeighted =
    pledges
      .filter((p) => p.status === "projected")
      .reduce((s, p) => s + Number(p.amount) * (p.probability ?? 1), 0) +
    visibleHubspot
      .filter((p) => p.status ==="projected")
      .reduce((s, p) => s + p.amount * p.probability, 0);
  const raisedHard = receivedTotal + securedTotal;

  // ── Budget vs actual (grouped) ──────────────────────────────────────────
  const budgetRows =
    (budgetRes.data ?? []) as Array<{
      category_id: string;
      base_amount: number;
      contingency_t1: number;
      contingency_t2: number;
      activated_contingency: number;
    }>;
  const budgetByCat = new Map(
    budgetRows.map((r) => [
      r.category_id,
      Number(r.base_amount) + Number(r.activated_contingency),
    ])
  );
  const actualByCat = new Map<string, number>();
  for (const t of txns) {
    if (t.amount >= 0 || !t.category_id) continue;
    actualByCat.set(t.category_id, (actualByCat.get(t.category_id) ?? 0) + -t.amount);
  }
  const totalBudget = Array.from(budgetByCat.values()).reduce((s, v) => s + v, 0);
  // Group rollups
  const groupRows = new Map<string, { budget: number; actual: number }>();
  for (const c of categories) {
    if (c.kind !== "expense") continue;
    const g = c.group_name;
    if (!groupRows.has(g)) groupRows.set(g, { budget: 0, actual: 0 });
    const r = groupRows.get(g)!;
    r.budget += budgetByCat.get(c.id) ?? 0;
    r.actual += actualByCat.get(c.id) ?? 0;
  }
  const budgetVsActual = Array.from(groupRows.entries())
    .map(([group, r]) => ({ group, ...r }))
    .filter((r) => r.budget > 0 || r.actual > 0)
    .sort((a, b) => b.budget - a.budget);

  // ── Misc ───────────────────────────────────────────────────────────────
  const uncategorizedCount = uncatRes.count ?? 0;
  const recent =
    (recentRes.data ?? []) as Array<{
      id: string;
      txn_date: string;
      description: string;
      amount: number;
      category_id: string | null;
    }>;

  const goalPct = cfg.goal > 0 ? raisedHard / cfg.goal : 0;
  const budgetPct = totalBudget > 0 ? expenseYTD / totalBudget : 0;

  // ── Forward-runway tiers ─────────────────────────────────────────────────
  // The card recomputes the projected tier for 3/6/12-month horizons on the
  // client, so it needs the unreceived pledges (full value) plus the resolved
  // inputs the snapshot already computed.
  const now = new Date();
  const runwayPledges: RunwayPledge[] = [
    ...pledges
      .filter((p) => p.status !== "received")
      .map((p) => ({
        amount: Number(p.amount),
        status: p.status as RunwayPledge["status"],
        expected_date: p.expected_date,
        restricted: Boolean(p.restricted),
      })),
    ...visibleHubspot
      .filter((p) => p.status !== "received")
      .map((p) => ({
        amount: p.amount,
        status: p.status as RunwayPledge["status"],
        expected_date: p.close_date,
        restricted: false,
        externalRef: p.deal_id,
      })),
  ];
  const horizonEnds = {
    3: endOfMonthISO(now, 3),
    6: endOfMonthISO(now, 6),
    12: endOfMonthISO(now, 12),
  } as const;
  const ri = snap.runway.inputs;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      {/* Header — SubNav now lives in app/admin/finance/layout.tsx so it
          persists across every finance page. */}
      <PageHeader
        eyebrow={`Fiscal year ${cfg.year}`}
        title="Dashboard"
        subtitle="Live picture of cash, burn, fundraising, and budget. Numbers update as transactions are imported, categorized, and pledges are received."
      />

      {/* Cash anchor + reconcile — the trusted current-balance number, with a
          one-tap "set current balance" and a freshness indicator. */}
      <ReconcileCard computedCash={cashOnHand} anchorDate={cfg.startDate} reconciledAt={cfg.reconciledAt} />

      {/* Forward runway — three tiers from the shared engine. */}
      <RunwayTiers
        baseline={ri.baseline}
        baselineSource={ri.baselineSource}
        bankBalance={ri.bankBalance}
        mtdSpend={ri.mtdSpend}
        endCurrentMonth={endOfMonthISO(now, 0)}
        horizonEnds={horizonEnds}
        defaultHorizon={cfg.horizon}
        pledges={runwayPledges}
      />

      {/* Hero KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Hero
          label="Raised YTD"
          value={money(raisedHard)}
          sub={
            cfg.goal > 0
              ? `${Math.round(goalPct * 100)}% of ${money(cfg.goal)} goal`
              : "set a goal in Config"
          }
        >
          <CircleGauge
            pct={goalPct}
            value={`${Math.round(goalPct * 100)}%`}
            label="goal"
            color="#2F7D5B"
          />
        </Hero>
        <Hero
          label="Spent YTD"
          value={money(expenseYTD)}
          sub={
            totalBudget > 0
              ? `${Math.round(budgetPct * 100)}% of ${money(totalBudget)} budget`
              : "no budget set"
          }
        >
          <CircleGauge
            pct={budgetPct}
            value={`${Math.round(budgetPct * 100)}%`}
            label="budget"
            color={budgetPct > 1 ? "#B5482F" : budgetPct > 0.8 ? "#B5762A" : "#C0703C"}
          />
        </Hero>
      </section>

      {/* Secondary metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Mini
          label={ri.baselineSource === "config" ? "Monthly burn (baseline)" : "Monthly burn (3-mo)"}
          value={money(ri.baseline)}
          sub={ri.baselineSource === "config" ? `vs ${money(burn3mo)} trailing 3-mo` : undefined}
        />
        <Mini
          label="Net YTD"
          value={`${netYTD >= 0 ? "+" : "−"}${money(Math.abs(netYTD))}`}
          tone={netYTD >= 0 ? "good" : "warn"}
        />
        <Mini label="Pipeline (weighted)" value={money(projectedWeighted)} />
        <Mini
          label="Uncategorized"
          value={String(uncategorizedCount)}
          tone={uncategorizedCount > 0 ? "warn" : "good"}
          href="/admin/finance/transactions?category=uncategorized"
        />
      </section>

      {/* Cash flow chart */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
        <SectionHeading className="mb-1">
          Cash flow · 12 months
        </SectionHeading>
        <p className="text-xs text-ink-2 mb-4">
          Bars are revenue (up) and expense (down). The line traces ending
          balance, starting from the {money(cfg.startBal)} anchor.
        </p>
        <CashFlowChart data={monthBuckets} />
      </section>

      {/* Splits */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
          <SectionHeading className="mb-1">
            Functional split
          </SectionHeading>
          <p className="text-xs text-ink-2 mb-5">
            How {money(expenseYTD)} of expense breaks down across program,
            admin, and fundraising — the same split a Form 990 reports.
          </p>
          {functionalSegs.length > 0 ? (
            <Donut
              segments={functionalSegs}
              centerValue={`${
                functionalTotals.program /
                  Math.max(
                    1,
                    functionalTotals.program + functionalTotals.admin + functionalTotals.fundraising
                  ) *
                  100 >=
                10
                  ? Math.round(
                      (functionalTotals.program /
                        Math.max(
                          1,
                          functionalTotals.program +
                            functionalTotals.admin +
                            functionalTotals.fundraising
                        )) *
                        100
                    )
                  : "—"
              }%`}
              centerLabel="PROGRAM"
            />
          ) : (
            <Empty>
              Categorize some expenses to see the program / admin /
              fundraising split.
            </Empty>
          )}
        </div>

        <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
          <SectionHeading className="mb-1">
            Revenue by source
          </SectionHeading>
          <p className="text-xs text-ink-2 mb-5">
            Received revenue plus actuals from bank transactions, grouped by
            who it came from. Projected pipeline shown separately below.
          </p>
          {sourceSegs.length > 0 ? (
            <Donut segments={sourceSegs} centerValue={money(raisedHard)} centerLabel="RAISED" />
          ) : (
            <Empty>
              Record received pledges or upload a revenue CSV to see the
              source mix.
            </Empty>
          )}
        </div>
      </section>

      {/* Budget vs actual */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <SectionHeading>
            Budget vs actual
          </SectionHeading>
          <Link
            href="/admin/finance/budget"
            className="text-xs text-ink-2 hover:text-ink-1"
          >
            Edit budget →
          </Link>
        </div>
        {budgetVsActual.length === 0 ? (
          <Empty>Set a budget and import transactions to see this table.</Empty>
        ) : (
          <ul className="space-y-3">
            {budgetVsActual.map((r) => {
              const pct = r.budget > 0 ? r.actual / r.budget : 0;
              const intent: "ok" | "warn" | "over" =
                pct > 1 ? "over" : pct > 0.85 ? "warn" : "ok";
              return (
                <li key={r.group} className="text-xs">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="uppercase tracking-wider text-ink-1 font-medium">
                      {r.group}
                    </span>
                    <span className="font-mono text-ink-1">
                      {money(r.actual)} <span className="text-ink-2">/ {money(r.budget)}</span>
                      <span
                        className={`ml-2 ${
                          intent === "over"
                            ? "text-expense"
                            : intent === "warn"
                            ? "text-[#A56A1B]"
                            : "text-revenue"
                        }`}
                      >
                        {Math.round(pct * 100)}%
                      </span>
                    </span>
                  </div>
                  <ProgressBar pct={pct} intent={intent} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Bottom strip: pledges + recent transactions */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
          <div className="flex items-baseline justify-between mb-4">
            <SectionHeading>
              Pledge pipeline
            </SectionHeading>
            <Link
              href="/admin/finance/revenue"
              className="text-xs text-ink-2 hover:text-ink-1"
            >
              Manage →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Cell label="Received" value={money(receivedTotal)} />
            <Cell label="Secured" value={money(securedTotal)} accent />
            <Cell label="Projected" value={money(projectedWeighted)} subtle />
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
            Toward {money(cfg.goal)} goal
          </div>
          <ProgressBar pct={goalPct} intent={goalPct >= 1 ? "ok" : "warn"} height={10} />
          {cfg.goal > 0 && (
            <div className="text-xs text-ink-2 mt-2">
              {Math.round(goalPct * 100)}% hard ·{" "}
              {Math.round(((raisedHard + projectedWeighted) / cfg.goal) * 100)}% with weighted pipeline
            </div>
          )}
        </div>

        <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
          <div className="flex items-baseline justify-between mb-4">
            <SectionHeading>
              Recent transactions
            </SectionHeading>
            <Link
              href="/admin/finance/transactions"
              className="text-xs text-ink-2 hover:text-ink-1"
            >
              All →
            </Link>
          </div>
          {recent.length === 0 ? (
            <Empty>Upload a CSV to see transactions.</Empty>
          ) : (
            <ul className="text-xs">
              {recent.map((t) => {
                const c = t.category_id ? catById.get(t.category_id) : null;
                return (
                  <li
                    key={t.id}
                    className="grid grid-cols-[5rem_1fr_6rem] gap-3 py-1.5 border-t border-hairline first:border-t-0"
                  >
                    <span className="font-mono text-ink-2">{t.txn_date.slice(5)}</span>
                    <span className="text-ink-1 truncate" title={t.description}>
                      {t.description}
                      {c && (
                        <span className="text-ink-2 text-[10px] ml-2">
                          {c.display_name}
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-right font-mono ${
                        Number(t.amount) >= 0 ? "text-revenue" : "text-ink-1"
                      }`}
                    >
                      {money(Number(t.amount))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Local UI bits ──────────────────────────────────────────────────────────

function Hero({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  accent,
  sparkline,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  deltaLabel?: string;
  accent?: "orange";
  sparkline?: number[];
  children?: React.ReactNode;
}) {
  const dotClass =
    accent === "orange" ? "text-orange" : "text-ink-1";
  return (
    <div className="relative rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-ink-2">{label}</div>
          <div className={`mt-1 font-display font-black text-3xl ${dotClass} leading-none`}>
            {value}
          </div>
          {sub && <div className="mt-2 text-xs text-ink-2">{sub}</div>}
          {typeof delta === "number" && Math.abs(delta) > 0.0001 && (
            <div className="mt-1 text-xs">
              <span className={delta >= 0 ? "text-revenue" : "text-expense"}>
                {delta >= 0 ? "▲" : "▼"} {money(Math.abs(delta))}
              </span>{" "}
              <span className="text-ink-2">{deltaLabel}</span>
            </div>
          )}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mb-1">
          <Sparkline values={sparkline} width={220} height={36} color="#C0703C" />
        </div>
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
  href,
  sub,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
  href?: string;
  sub?: string;
}) {
  const valueClass =
    tone === "warn"
      ? "text-[#A56A1B]"
      : tone === "good"
      ? "text-revenue"
      : "text-ink-1";
  const inner = (
    <div className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel p-3 hover:bg-[#EFE6D4] transition-colors">
      <div className="text-[10px] uppercase tracking-widest text-ink-2 mb-1">{label}</div>
      <div className={`text-lg font-medium ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-2 mt-0.5">{sub}</div>}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-ink-2 py-8 text-center border border-dashed border-outline rounded-card">
      {children}
    </div>
  );
}

function Cell({
  label,
  value,
  accent,
  subtle,
}: {
  label: string;
  value: string;
  accent?: boolean;
  subtle?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">{label}</div>
      <div
        className={`text-lg font-medium font-mono ${
          accent ? "text-orange" : subtle ? "text-ink-2" : "text-ink-1"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
