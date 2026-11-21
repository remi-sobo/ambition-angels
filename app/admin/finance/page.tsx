import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FinCategory } from "@/lib/finance/types";
import { CashFlowChart, money } from "./_components/charts";
import PageHeader from "../_components/PageHeader";
import PageShell from "../_components/ui/PageShell";
import Button from "../_components/ui/Button";
import Figure, { SummaryStrip } from "../_components/ui/Figure";
import Notice from "../_components/ui/Notice";
import ListRow, { ListRows } from "../_components/ui/ListRow";
import { CountBadge } from "../_components/ui/Badge";
import DataTable, { type DataTableColumn } from "../_components/ui/DataTable";
import { getFinanceSnapshot, fiscalYearBounds } from "@/lib/admin/finance";
import { endOfMonthISO } from "@/lib/finance/runway";
import { loadRevenueSchedule, loadReceivedTotal, scheduleTotals, scheduleToRunwayPledges } from "@/lib/finance/schedule";
import { loadUncategorized } from "@/lib/finance/uncategorized";
import {
  budgetRows,
  cashFigure,
  cashState,
  decisionLine,
  fiscalYearLabel,
  needsYou,
  receivedFigure,
  runwayFigures,
  spentFigure,
  type BudgetRow,
  type DashFigure,
} from "@/lib/finance/dashboard";
import { TYPE } from "@/lib/admin/typeScale";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import SnapshotActions, { type BreakdownShare } from "./_components/SnapshotActions";
import type { TableSpec } from "@/lib/admin/dataTable";

// Finance → Snapshot: the Dashboard archetype (V4 Stage G2,
// specs/v4-prototypes/Finance.dc.html). Header with one primary action; a
// decision line in plain words; a summary strip (cash on hand, runway cash
// only, runway with pledges due, received and spent this year), each with
// its source and freshness, stale offering Refresh and missing reading "No
// data yet", never 0; one chart; a "Needs you" list; one compact table
// (budget vs actual by group). The rest of the old dashboard (runway tiers
// with the projection window, set balance, the year's supporting figures,
// spending by function, money in by source) sits one click away in the
// header's More actions (SnapshotActions).
//
// Canonical numbers come from the shared snapshot (lib/admin/finance.ts) so
// this page, Today and the briefing never disagree. Read live every request.
export const dynamic = "force-dynamic";

const BASE = "/admin/finance/snapshot";
const SET_BALANCE = `${BASE}?set=balance`;
const BUDGET_TABLE: TableSpec = { sortable: [], defaultSort: null, pageSize: 200 };

const SOURCE_FROM_CAT: Record<string, string> = {
  "revenue.foundations": "Foundations",
  "revenue.individuals": "Individuals",
  "revenue.corporate": "Corporate",
  "revenue.gov-grants": "Government",
  "revenue.accelerator": "Accelerator",
  "revenue.earned": "Earned",
  "revenue.interest": "Other",
  "revenue.other": "Other",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function shares(map: Map<string, number>): BreakdownShare[] {
  const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  return Array.from(map.entries())
    .filter(([, v]) => v > 0.0001)
    .sort((a, b) => b[1] - a[1])
    .map(([label, v]) => ({ label, amount: money(v), pct: v / total }));
}

export default async function FinanceDashboardPage() {
  const roleGate = await requirePagePermission("finance.read", "Finance");
  if (!roleGate.ok) return roleGate.page;
  const supabase = getSupabaseAdmin();
  const ctx = await getOrgContext();
  const canWrite = ctx ? await ctxHasPermission(ctx, "finance.write") : false;

  const snap = await getFinanceSnapshot();
  const cfg = snap.cfg;
  const fy = fiscalYearBounds(cfg.year, cfg.startMonth);
  // Org fence: the service-role client bypasses RLS, so every read below is
  // scoped to the snapshot's org (the same org fin_config was resolved for).
  const orgId = snap.orgId;
  const now = new Date();

  const [catsRes, txnsRes, budgetRes, pledgesRes, ledgerRes, lastImportRes, reconRes, uncat, scheduleRows, received] =
    await Promise.all([
      supabase
        .from("fin_categories")
        .select("id, group_name, display_name, kind, functional_class, sort_order, enabled")
        .eq("org_id", orgId)
        .eq("enabled", true)
        .order("sort_order"),
      // Fiscal-year transactions with category, paged past PostgREST's cap:
      // category totals are sums over every row of the year.
      fetchAll<{ amount: number; category_id: string | null }>(
        () =>
          supabase
            .from("fin_transactions")
            .select("amount, category_id")
            .eq("org_id", orgId)
            .gte("txn_date", fy.start)
            .lte("txn_date", fy.end),
        { order: ["id"] },
      ),
      supabase
        .from("fin_budget")
        .select("category_id, base_amount, activated_contingency")
        .eq("org_id", orgId)
        .eq("year", cfg.year),
      supabase.from("fin_revenue_commitments").select("source_type, amount, status").eq("org_id", orgId).eq("year", cfg.year),
      supabase.from("fin_transactions").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("fin_imports").select("uploaded_at").eq("org_id", orgId).order("uploaded_at", { ascending: false }).limit(1).maybeSingle(),
      supabase
        .from("fin_reconciliation_items")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "pending"),
      loadUncategorized(supabase, orgId),
      loadRevenueSchedule(supabase, orgId),
      loadReceivedTotal(supabase, orgId, fy.start, fy.end),
    ]);

  const categories = (catsRes.data ?? []) as FinCategory[];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const txns = (txnsRes.data ?? []).map((t) => ({ amount: Number(t.amount), category_id: t.category_id }));
  const partial = snap.partial || !!txnsRes.truncated;

  // ── Budget vs actual by group ───────────────────────────────────────────
  const budgetByCat = new Map(
    ((budgetRes.data ?? []) as Array<{ category_id: string; base_amount: number; activated_contingency: number }>).map((r) => [
      r.category_id,
      Number(r.base_amount) + Number(r.activated_contingency),
    ]),
  );
  const actualByCat = new Map<string, number>();
  for (const t of txns) {
    if (t.amount >= 0 || !t.category_id) continue;
    actualByCat.set(t.category_id, (actualByCat.get(t.category_id) ?? 0) - t.amount);
  }
  const groupMap = new Map<string, { budget: number; actual: number }>();
  for (const c of categories) {
    if (c.kind !== "expense") continue;
    const g = groupMap.get(c.group_name) ?? { budget: 0, actual: 0 };
    g.budget += budgetByCat.get(c.id) ?? 0;
    g.actual += actualByCat.get(c.id) ?? 0;
    groupMap.set(c.group_name, g);
  }
  const budget = budgetRows(Array.from(groupMap.entries()).map(([group, r]) => ({ group, ...r })));
  const totalBudget = Array.from(budgetByCat.values()).reduce((s, v) => s + v, 0);
  const overBudget = budget.filter((b) => b.diffTone === "over");

  // ── Figures ────────────────────────────────────────────────────────────
  const cashIn = { cashOnHand: snap.cashOnHand, anchorDate: cfg.startDate, reconciledAt: cfg.reconciledAt, partial: snap.partial };
  const cash = cashState(cashIn, now);
  const ri = snap.runway.inputs;
  const runwayIn = {
    cashKnown: cash.known,
    cashFreshness: cash.freshness,
    cashMonths: snap.runway.cash.months,
    dueMonths: snap.runway.due.months,
    baseline: ri.baseline,
    baselineSource: ri.baselineSource,
    duePledges: ri.duePledges,
    endCurrentMonth: endOfMonthISO(now, 0),
  };
  const ledgerRows = ledgerRes.error ? null : ledgerRes.count ?? 0;
  const figures: DashFigure[] = [
    cashFigure(cashIn, now, SET_BALANCE),
    ...runwayFigures(runwayIn, SET_BALANCE),
    receivedFigure(received, cfg.goal, fy.start),
    spentFigure(
      {
        expenseYTD: snap.expenseYTD,
        partial,
        ledgerRows,
        lastImportAt: (lastImportRes.data as { uploaded_at?: string } | null)?.uploaded_at ?? null,
        totalBudget,
      },
      fy.start,
      now,
    ),
  ];
  const decision = decisionLine(runwayIn, SET_BALANCE);
  const needs = needsYou(
    {
      uncategorized: uncat,
      reconcilePending: reconRes.error ? null : reconRes.count ?? 0,
      cash,
      overBudget,
      undatedPledges: snap.undatedPledgeCount,
      lastClosedAt: cfg.lastReconciledAt,
      setBalanceHref: canWrite ? SET_BALANCE : "/admin/finance/transactions#close",
    },
    now,
  );

  // ── "Year at a glance" (More actions) ──────────────────────────────────
  const sched = scheduleTotals(scheduleRows);
  const functional = new Map<string, number>();
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const cls = t.category_id ? catById.get(t.category_id)?.functional_class : null;
    const k = cls === "program" ? "Program" : cls === "admin" ? "Admin" : cls === "fundraising" ? "Fundraising" : "Uncategorized";
    functional.set(k, (functional.get(k) ?? 0) - t.amount);
  }
  const bySource = new Map<string, number>();
  for (const p of (pledgesRes.data ?? []) as Array<{ source_type: string; amount: number; status: string }>) {
    if (p.status !== "received") continue;
    bySource.set(cap(p.source_type), (bySource.get(cap(p.source_type)) ?? 0) + Number(p.amount));
  }
  for (const t of txns) {
    if (t.amount <= 0) continue;
    const src = (t.category_id && SOURCE_FROM_CAT[t.category_id]) || "Other";
    bySource.set(src, (bySource.get(src) ?? 0) + t.amount);
  }
  const glance = [
    {
      label: ri.baselineSource === "config" ? "Monthly burn (your baseline)" : "Monthly burn (3-month average)",
      value: ri.baseline > 0 ? money(ri.baseline) : null,
      source:
        ri.baselineSource === "config"
          ? `Set in finance settings. The 3-month average is ${money(snap.burn3mo)}.`
          : "Average spending over the last three active months, one-offs left out.",
    },
    {
      label: "Net this year",
      value: ledgerRows ? `${snap.netYTD >= 0 ? "+" : "-"}${money(Math.abs(snap.netYTD))}` : null,
      source: "Money in minus money out across this year's transactions.",
    },
    {
      label: "Secured, not yet received",
      value: money(sched.committed),
      source: "Committed pledges, awarded grants and signed deals at full value.",
    },
    {
      label: "Pipeline (weighted)",
      value: money(sched.projectedWeighted),
      source: "Open asks times their chance of closing. The same figure the projected runway uses.",
    },
    {
      label: "Toward the goal",
      value: cfg.goal > 0 && !received.error ? `${Math.round(((received.total + sched.committed) / cfg.goal) * 100)}%` : null,
      source: cfg.goal > 0 ? `Received plus secured, of the ${money(cfg.goal)} goal.` : "Set a fundraising goal in finance settings.",
    },
  ];

  const budgetColumns: DataTableColumn<BudgetRow>[] = [
    {
      key: "group",
      header: "Category group",
      card: "title",
      render: (r) => <span className="font-semibold text-ink-1">{r.group}</span>,
    },
    {
      key: "budget",
      header: "Year budget",
      align: "right",
      className: "tabular-nums",
      render: (r) => (r.budget > 0 ? money(r.budget) : <span className="text-ink-2">No budget yet</span>),
    },
    { key: "actual", header: "Spent", align: "right", className: "tabular-nums", render: (r) => money(r.actual) },
    {
      key: "used",
      header: "Used",
      render: (r) =>
        r.pct === null ? (
          <span className="text-ink-2">No budget to measure</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-block w-20 h-1.5 rounded-full bg-tile overflow-hidden">
              <span
                className={`block h-full ${r.diffTone === "over" ? "bg-status-critical" : "bg-ink-2"}`}
                style={{ width: `${Math.min(100, Math.round(r.pct * 100))}%` }}
              />
            </span>
            <span className="tabular-nums text-ink-1">{Math.round(r.pct * 100)}%</span>
          </span>
        ),
    },
  ];

  const toneClass = { under: "text-status-healthy-text font-semibold", over: "text-status-critical-text font-semibold", even: "text-ink-1", none: "text-ink-2" };

  return (
    <PageShell>
      <PageHeader
        title="Finance"
        subtitle={fiscalYearLabel(cfg.year, fy)}
        primaryAction={canWrite ? <Button href="/admin/settings/finance/upload">Upload transactions</Button> : undefined}
        moreActions={
          <SnapshotActions
            canWrite={canWrite}
            computedCash={cash.known ? snap.cashOnHand : null}
            anchorDate={cfg.startDate}
            runway={{
              baseline: ri.baseline,
              baselineSource: ri.baselineSource,
              bankBalance: ri.bankBalance,
              mtdSpend: ri.mtdSpend,
              endCurrentMonth: endOfMonthISO(now, 0),
              horizonEnds: { 3: endOfMonthISO(now, 3), 6: endOfMonthISO(now, 6), 12: endOfMonthISO(now, 12) },
              defaultHorizon: cfg.horizon,
              pledges: scheduleToRunwayPledges(scheduleRows),
              restrictedInflows: snap.restrictedInflows,
            }}
            figures={glance}
            functional={shares(functional)}
            bySource={shares(bySource)}
          />
        }
      />

      {/* The decision line: where you stand, in plain words. */}
      <section aria-label="Where you stand" className="mb-4">
        <Notice
          tone={decision.tone}
          title={decision.headline}
          action={
            decision.action ? (
              <Button variant="secondary" size="sm" href={decision.action.href}>
                {decision.action.label}
              </Button>
            ) : (
              <Link href={`${BASE}?show=runway`} className="text-[13px] font-semibold underline underline-offset-2">
                How runway is figured
              </Link>
            )
          }
        >
          {decision.detail}
        </Notice>
      </section>

      {partial ? (
        <Notice tone="partial" title="Some figures are from part of the ledger." className="mb-4">
          This organization has more transactions or gifts than one read holds, so cash and the year&apos;s totals are a
          floor, not the whole answer.
        </Notice>
      ) : null}

      <SummaryStrip label="Key figures">
        {figures.map((f) => (
          <Figure
            key={f.key}
            label={f.label}
            value={f.value}
            source={f.source}
            freshness={f.freshness}
            compare={f.compare}
            href={f.href}
            refreshHref={canWrite ? f.refreshHref : undefined}
          />
        ))}
      </SummaryStrip>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 mb-4">
        <section aria-labelledby="cash-title" className="bg-surface border border-hairline rounded-panel p-5 min-w-0">
          <h2 id="cash-title" className={TYPE.cardTitle}>
            Cash flow, this fiscal year
          </h2>
          <p className={`${TYPE.bodyMuted} mt-1 mb-4`}>
            Bars are money in (up) and out (down). The line is the ending balance, from the {money(cfg.startBal)} starting
            balance.
          </p>
          <CashFlowChart data={snap.monthBuckets} />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-ink-2">
            <span>From imported transactions and the starting balance{ledgerRows === 0 ? ". No transactions yet." : "."}</span>
            <Link href="/admin/finance/forecast" className="font-semibold text-ink-1 underline underline-offset-2">
              Open forecast
            </Link>
          </div>
        </section>

        <section aria-labelledby="needs-title" className="bg-surface border border-hairline rounded-panel px-5 pt-4 pb-3 min-w-0">
          <h2 id="needs-title" className={`${TYPE.cardTitle} flex items-center gap-2`}>
            Needs you {needs.length > 0 ? <CountBadge value={needs.length} /> : null}
          </h2>
          {needs.length === 0 ? (
            <p className={`${TYPE.bodyMuted} py-6`}>Nothing needs you right now. Every transaction has a category and the books are current.</p>
          ) : (
            <ListRows>
              {needs.map((n) => (
                <ListRow
                  key={n.key}
                  title={n.title}
                  context={<span className={n.tone === "danger" ? "text-status-critical-text" : undefined}>{n.detail}</span>}
                  actions={
                    <Button variant="secondary" size="sm" href={n.href}>
                      {n.action}
                    </Button>
                  }
                />
              ))}
            </ListRows>
          )}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline text-xs text-ink-2">
            <span>Checked as of now</span>
            <Link href="/admin/finance/transactions#reconcile" className="font-semibold text-ink-1 underline underline-offset-2">
              Open reconcile
            </Link>
          </div>
        </section>
      </div>

      <section aria-labelledby="budget-title">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h2 id="budget-title" className={TYPE.cardTitle}>
              Budget vs actual
            </h2>
            <p className={`${TYPE.bodyMuted} mt-1`}>
              Budget from your {cfg.year} budget. Spending from categorized transactions this fiscal year.
              {uncat.count > 0 ? ` ${uncat.count} uncategorized transaction${uncat.count === 1 ? " is" : "s are"} not counted yet.` : ""}
            </p>
          </div>
          <Link href="/admin/finance/budget" className="text-[13px] font-semibold text-ink-1 underline underline-offset-2">
            Open budget
          </Link>
        </div>
        <DataTable
          label="Budget vs actual by category group"
          noun={{ one: "group", many: "groups" }}
          columns={budgetColumns}
          nextStep={{
            header: "Difference",
            render: (r) => <span className={toneClass[r.diffTone]}>{r.diff}</span>,
          }}
          data={{ rows: budget, total: budget.length, page: 0, pageSize: BUDGET_TABLE.pageSize, error: catsRes.error?.message ?? null }}
          getRowId={(r) => r.group}
          getRowLabel={(r) => r.group}
          spec={BUDGET_TABLE}
          state={{ page: 0, sort: null }}
          baseHref={BASE}
          emptyMessage={
            <>
              Set a budget and import transactions to see this table.{" "}
              <Link href="/admin/finance/budget" className="font-semibold underline underline-offset-2">
                Set a budget
              </Link>
            </>
          }
        />
      </section>
    </PageShell>
  );
}
