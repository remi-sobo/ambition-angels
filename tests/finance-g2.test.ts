import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./support/fakeDb";
import { MAX_BULK_CATEGORIZE, bulkCategorizeMessage, parseBulkCategorizeBody } from "@/lib/finance/bulkCategorize";
import {
  balanceDrift,
  budgetRows,
  cashFigure,
  cashState,
  decisionLine,
  fiscalYearLabel,
  needsYou,
  receivedFigure,
  runwayFigures,
  spentFigure,
} from "@/lib/finance/dashboard";
import { summarizeUncategorized } from "@/lib/finance/uncategorized";
import { TX_TABLE, activeFilterCount, parseTxFilters, txFilterHref, txNextStep } from "@/lib/finance/transactionsList";
import { parseTableState } from "@/lib/admin/dataTable";
import { figureView } from "@/lib/admin/figure";
import { confirmLabel, freshnessLabel, metricFreshness, metricSource } from "@/lib/impact/metricDisplay";
import { FigureBody } from "@/app/admin/_components/ui/Figure";

/**
 * V4 Stage G2 (Finance and Impact): the bulk-categorize route fences, the
 * snapshot's figures (missing is never 0), the decision line and Needs you
 * rules, Transactions URL state, the Impact display rules, and a source guard
 * per migrated screen (kit only: no raw table, no hand-built overlay, no raw
 * control, writes through saveAction, nothing optimistic on money).
 */

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const ME = "11111111-1111-4111-8111-111111111111";
const T1 = "a1000000-0000-4000-8000-000000000001";
const T2 = "a1000000-0000-4000-8000-000000000002";
const TB = "b1000000-0000-4000-8000-000000000001"; // org B's transaction

let db: FakeDb;
let ctx: { userId: string; email: string; orgId: string; orgName: string; role: "finance" } | null;
let perms = new Set<string>();
const auditSpy = vi.fn(async () => {});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditSpy(...(a as [])) }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  ctxHasPermission: vi.fn(async (_c: unknown, p: string) => perms.has(p)),
  isAuthed: vi.fn(async () => !!ctx),
  getAdminUser: vi.fn(async () => "Me"),
}));

import { POST as bulkRoute } from "@/app/api/admin/finance/transactions/bulk/route";

beforeEach(() => {
  ctx = { userId: ME, email: "me@example.org", orgId: ORG_A, orgName: "Org A", role: "finance" };
  perms = new Set(["finance.read", "finance.write"]);
  auditSpy.mockClear();
  db = fakeDb({
    // Categories are keyed (org_id, id) (#590): the same text id exists in both orgs.
    fin_categories: [
      { id: "ops.software", org_id: ORG_A, display_name: "Software" },
      { id: "ops.rent", org_id: ORG_A, display_name: "Rent" },
      { id: "ops.software", org_id: ORG_B, display_name: "Their software" },
      { id: "b.only", org_id: ORG_B, display_name: "Only in B" },
    ],
    fin_transactions: [
      { id: T1, org_id: ORG_A, amount: -20, category_id: null },
      { id: T2, org_id: ORG_A, amount: -30, category_id: "ops.rent" },
      { id: TB, org_id: ORG_B, amount: -40, category_id: null },
    ],
  });
});

const bulk = (body: unknown) =>
  bulkRoute(new NextRequest("http://localhost/api/admin/finance/transactions/bulk", { method: "POST", body: JSON.stringify(body) }));
const txn = (id: string) => db.tables.fin_transactions.find((t) => t.id === id)!;

describe("POST /api/admin/finance/transactions/bulk (bulk categorize)", () => {
  test("sets the category on the selected transactions of the active org", async () => {
    const res = await bulk({ ids: [T1, T2], category_id: "ops.software" });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, updated: 2, skipped: 0 });
    expect(j.message).toBe("2 transactions set to Software.");
    expect(txn(T1).category_id).toBe("ops.software");
    expect(txn(T2).category_id).toBe("ops.software");
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });

  test("needs a session (401) and finance.write (403); nothing is written", async () => {
    ctx = null;
    expect((await bulk({ ids: [T1], category_id: "ops.software" })).status).toBe(401);
    ctx = { userId: ME, email: "me@example.org", orgId: ORG_A, orgName: "Org A", role: "finance" };
    perms = new Set(["finance.read"]);
    expect((await bulk({ ids: [T1], category_id: "ops.software" })).status).toBe(403);
    expect(txn(T1).category_id).toBeNull();
    expect(auditSpy).not.toHaveBeenCalled();
  });

  test("the category must belong to the active org: another org's or a made-up id is a 400", async () => {
    expect((await bulk({ ids: [T1], category_id: "b.only" })).status).toBe(400);
    expect((await bulk({ ids: [T1], category_id: "made.up" })).status).toBe(400);
    expect(txn(T1).category_id).toBeNull();
  });

  test("pinned to the active org: another org's transaction is skipped, never written", async () => {
    const res = await bulk({ ids: [T1, TB], category_id: "ops.software" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ updated: 1, skipped: 1 });
    expect(txn(TB).category_id).toBeNull();
    // Only foreign ids: nothing found.
    expect((await bulk({ ids: [TB], category_id: "ops.software" })).status).toBe(404);
    expect(txn(TB).category_id).toBeNull();
  });

  test("null or empty clears back to uncategorized", async () => {
    const res = await bulk({ ids: [T2], category_id: "" });
    expect(res.status).toBe(200);
    expect(txn(T2).category_id).toBeNull();
    expect((await res.json()).message).toBe("1 transaction set back to uncategorized.");
  });

  test("bad input is a 400: no ids, junk ids, too many, no category field", async () => {
    expect((await bulk({ ids: [], category_id: "ops.rent" })).status).toBe(400);
    expect((await bulk({ ids: ["nope"], category_id: "ops.rent" })).status).toBe(400);
    expect((await bulk({ ids: [T1] })).status).toBe(400);
    const many = Array.from({ length: MAX_BULK_CATEGORIZE + 1 }, (_, i) => `a1000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect((await bulk({ ids: many, category_id: "ops.rent" })).status).toBe(400);
  });

  test("parseBulkCategorizeBody dedupes ids; the message names skipped rows", () => {
    const p = parseBulkCategorizeBody({ ids: [T1, T1, 7], category_id: null });
    expect(p).toEqual({ ok: true, body: { ids: [T1], categoryId: null } });
    expect(bulkCategorizeMessage(3, 1, "Rent")).toBe("3 transactions set to Rent. 1 could not be found and were left alone.");
  });
});

// ── The snapshot's figures ─────────────────────────────────────────────────
const NOW = new Date("2026-11-21T15:00:00Z");
const SET = "/admin/finance/snapshot?set=balance";

describe("snapshot figures: missing is never 0", () => {
  test("cash with no anchor balance is missing, not $0, and offers Refresh (set balance)", () => {
    const f = cashFigure({ cashOnHand: 0, anchorDate: null, reconciledAt: null, partial: false }, NOW, SET);
    expect(f.value).toBeNull();
    expect(f.freshness).toBe("missing");
    expect(f.refreshHref).toBe(SET);
    expect(f.source).toMatch(/Set your bank balance/);
  });

  test("cash is fresh when set recently, stale after 14 days, partial when the ledger was cut", () => {
    const base = { cashOnHand: 412600, anchorDate: "2026-11-19", partial: false };
    const fresh = cashFigure({ ...base, reconciledAt: "2026-11-19T14:00:00Z" }, NOW, SET);
    expect(fresh).toMatchObject({ value: "$412,600", freshness: "fresh" });
    expect(fresh.source).toBe("From the bank balance set 2 days ago, plus transactions since.");
    expect(cashFigure({ ...base, reconciledAt: "2026-10-20T14:00:00Z" }, NOW, SET).freshness).toBe("stale");
    expect(cashFigure({ ...base, reconciledAt: "2026-11-20T14:00:00Z", partial: true }, NOW, SET).freshness).toBe("partial");
  });

  test("both runway figures are on the snapshot; no burn or no cash makes both missing", () => {
    const r = {
      cashKnown: true,
      cashFreshness: "fresh" as const,
      cashMonths: 7.4,
      dueMonths: 8.1,
      baseline: 55000,
      baselineSource: "config" as const,
      duePledges: 38900,
      endCurrentMonth: "2026-11-30",
    };
    const [cash, due] = runwayFigures(r, SET);
    expect(cash).toMatchObject({ label: "Runway, cash only", value: "7.4 months" });
    expect(cash.source).toMatch(/\$55,000 a month \(your baseline\)/);
    expect(due).toMatchObject({ label: "Runway with pledges due", value: "8.1 months" });
    expect(due.source).toBe("Adds $38,900 in pledges due by Nov 30.");
    const noBurn = runwayFigures({ ...r, cashMonths: null, dueMonths: null }, SET);
    expect(noBurn.map((f) => f.value)).toEqual([null, null]);
    expect(noBurn[0].source).toMatch(/monthly burn/);
    const noCash = runwayFigures({ ...r, cashKnown: false, cashFreshness: "missing" }, SET);
    expect(noCash.map((f) => f.value)).toEqual([null, null]);
  });

  test("a failed gifts read is missing; an empty ledger is missing; a real zero stays zero", () => {
    expect(receivedFigure({ total: 0, truncated: false, error: true }, 0, "2026-01-01").value).toBeNull();
    expect(receivedFigure({ total: 0, truncated: false }, 0, "2026-01-01").value).toBe("$0");
    const spent = { expenseYTD: 0, partial: false, lastImportAt: null, totalBudget: 0 };
    expect(spentFigure({ ...spent, ledgerRows: 0 }, "2026-01-01", NOW).value).toBeNull();
    expect(spentFigure({ ...spent, ledgerRows: null }, "2026-01-01", NOW).value).toBeNull();
    const stale = spentFigure({ ...spent, expenseYTD: 590900, ledgerRows: 300, lastImportAt: "2026-11-01T00:00:00Z" }, "2026-01-01", NOW);
    expect(stale).toMatchObject({ value: "$590,900", freshness: "stale" });
  });

  test("the Figure renders No data yet for a missing value, never a 0, and Refresh when stale", () => {
    const missing = renderToStaticMarkup(createElement(FigureBody, { label: "Cash on hand", value: null, source: "Set your bank balance to start." }));
    expect(missing).toContain("No data yet");
    expect(missing).not.toMatch(/\$0|>0</);
    expect(missing).toContain('data-figure-state="missing"');
    const stale = renderToStaticMarkup(
      createElement(FigureBody, { label: "Cash on hand", value: "$412,600", freshness: "stale", source: "Bank balance last set 30 days ago.", refreshHref: SET }),
    );
    expect(stale).toContain("Out of date");
    expect(stale).toContain(">Refresh<");
    expect(figureView({ value: Number.NaN }).state).toBe("missing");
  });

  test("the fiscal year reads January to December", () => {
    expect(fiscalYearLabel(2026, { start: "2026-01-01", end: "2026-12-31" })).toBe("Fiscal year 2026, Jan 1 to Dec 31");
  });
});

describe("snapshot: decision line, Needs you, budget rows", () => {
  const r = {
    cashKnown: true,
    cashFreshness: "fresh" as const,
    cashMonths: 7.4,
    dueMonths: 8.1,
    baseline: 55000,
    baselineSource: "config" as const,
    duePledges: 38900,
    endCurrentMonth: "2026-11-30",
  };
  test("the decision line says where you stand in plain words", () => {
    expect(decisionLine(r, SET)).toMatchObject({ tone: "success", headline: "You have 7.4 months of runway." });
    expect(decisionLine(r, SET).detail).toMatch(/8\.1 months counting pledges due/);
    expect(decisionLine({ ...r, cashMonths: 2.2, dueMonths: 2.2 }, SET)).toMatchObject({ tone: "warning" });
    expect(decisionLine({ ...r, cashMonths: 2.2, dueMonths: 2.2 }, SET).detail).not.toMatch(/counting pledges/);
    expect(decisionLine({ ...r, cashMonths: 1 }, SET).tone).toBe("danger");
    expect(decisionLine({ ...r, cashKnown: false }, SET)).toMatchObject({ headline: "Runway cannot be figured yet.", action: { href: SET } });
  });

  test("Needs you: uncategorized, reconcile proposals, stale balance, over budget, undated, close", () => {
    const items = needsYou(
      {
        uncategorized: summarizeUncategorized([
          { amount: -3000, txn_date: "2026-11-03" },
          { amount: "-410", txn_date: "2026-11-10" },
        ]),
        reconcilePending: 2,
        cash: cashState({ cashOnHand: 1, anchorDate: "2026-09-01", reconciledAt: "2026-09-01T00:00:00Z", partial: false }, NOW),
        overBudget: [{ group: "Program supplies", budget: 17300, actual: 19380 }],
        undatedPledges: 1,
        lastClosedAt: "2026-11-20T00:00:00Z",
        setBalanceHref: SET,
      },
      NOW,
    );
    expect(items.map((i) => i.key)).toEqual(["uncategorized", "reconcile", "balance", "over-Program supplies", "undated"]);
    expect(items[0]).toMatchObject({ title: "2 transactions need a category", detail: "$3,410 in all. Oldest is from Nov 3.", href: "/admin/finance/transactions?category=uncategorized" });
    expect(items[3].title).toBe("Program supplies is 12% over");
    // Nothing to do: an empty list (the page shows an all-clear sentence).
    expect(
      needsYou(
        {
          uncategorized: summarizeUncategorized([]),
          reconcilePending: 0,
          cash: cashState({ cashOnHand: 1, anchorDate: "2026-11-20", reconciledAt: "2026-11-20T00:00:00Z", partial: false }, NOW),
          overBudget: [],
          undatedPledges: 0,
          lastClosedAt: "2026-11-20T00:00:00Z",
          setBalanceHref: SET,
        },
        NOW,
      ),
    ).toEqual([]);
  });

  test("budget rows: no budget is said, not a 0%; over and under in words", () => {
    const rows = budgetRows([
      { group: "Software", budget: 0, actual: 13520 },
      { group: "Supplies", budget: 17300, actual: 19380 },
      { group: "Travel", budget: 8600, actual: 0 },
      { group: "Empty", budget: 0, actual: 0 },
    ]);
    expect(rows.map((x) => x.group)).toEqual(["Supplies", "Travel", "Software"]);
    expect(rows[2]).toMatchObject({ pct: null, diff: "No budget yet", diffTone: "none" });
    expect(rows[0]).toMatchObject({ diff: "$2,080 over (12%)", diffTone: "over" });
    expect(rows[1]).toMatchObject({ diff: "$8,600 under", diffTone: "under" });
    expect(balanceDrift(100, 100.2)).toEqual({ kind: "match" });
    expect(balanceDrift(1000, 900)).toEqual({ kind: "gap", amount: 100, direction: "more" });
  });
});

describe("Transactions URL state", () => {
  test("filters keep the V1 vocabulary; junk falls back; a filter change returns to page 1", () => {
    const f = parseTxFilters({ q: " zoom ", category: "uncategorized", from: "2026-11-01", to: "nope", status: "inflow", page: "3" });
    expect(f).toEqual({ q: "zoom", category: "uncategorized", from: "2026-11-01", to: "", status: "inflow" });
    expect(parseTxFilters({ status: "weird" }).status).toBe("");
    expect(activeFilterCount(f)).toBe(4);
    expect(txFilterHref(f)).toBe("/admin/finance/transactions?q=zoom&category=uncategorized&from=2026-11-01&status=inflow");
    expect(parseTableState({ sort: "amount" }, TX_TABLE)).toEqual({ page: 0, sort: { key: "amount", dir: "desc" } });
    expect(parseTableState({ sort: "description" }, TX_TABLE).sort).toEqual({ key: "date", dir: "desc" });
  });

  test("next step: a missing category first, then a restricted line with no purpose", () => {
    expect(txNextStep({ category_id: null, amount: -1, restricted: false, restricted_to: null }).label).toBe("Needs a category");
    expect(txNextStep({ category_id: "x", amount: 5, restricted: true, restricted_to: null }).label).toMatch(/Restricted/);
    expect(txNextStep({ category_id: "x", amount: 5, restricted: false, restricted_to: null })).toEqual({ label: "Done", tone: "muted" });
  });
});

describe("Impact: unconfirmed and missing say so", () => {
  const m = { latest: null, stale: false, confirmed_state: "unconfirmed" as const, source_kind: "manual" as const, cadence: "monthly" };
  test("a never-captured metric is missing with a source that says so", () => {
    expect(metricFreshness(m)).toBe("missing");
    expect(metricSource(m, NOW, (d) => d)).toBe("Entered by hand. Never captured.");
    expect(freshnessLabel(m, NOW)).toEqual({ label: "Never updated", tone: "danger" });
  });
  test("an unconfirmed number is labeled unconfirmed; confirmed adds nothing", () => {
    const v = { ...m, latest: { value: 87, captured_on: "2026-11-01" } };
    expect(metricSource(v, NOW, (d) => d)).toBe("Entered by hand, captured 2026-11-01 (monthly). Unconfirmed.");
    expect(metricSource({ ...v, confirmed_state: "confirmed" }, NOW, (d) => d)).toBe("Entered by hand, captured 2026-11-01 (monthly).");
    expect(confirmLabel(null).label).toBe("Not yet classified");
    expect(confirmLabel("conflict").tone).toBe("danger");
    expect(freshnessLabel({ ...v, stale: true }, NOW).label).toBe("Out of date, 20 days ago");
  });
});

// ── Source guards, one per migrated screen ─────────────────────────────────
const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const SCREENS: Record<string, string[]> = {
  "Finance snapshot (Dashboard)": ["app/admin/finance/page.tsx", "app/admin/finance/_components/SnapshotActions.tsx"],
  "Transactions (List)": [
    "app/admin/finance/transactions/page.tsx",
    "app/admin/finance/transactions/_components/TransactionFilters.tsx",
    "app/admin/finance/transactions/_components/CategoryPicker.tsx",
    "app/admin/finance/transactions/_components/FlagToggle.tsx",
    "app/admin/finance/transactions/_components/AiCategorize.tsx",
  ],
  "Reconcile inbox": ["app/admin/finance/reconcile/ReconcileSection.tsx", "app/admin/finance/reconcile/_components/ReconcileInbox.tsx"],
  "Friday close": ["app/admin/finance/close/CloseSection.tsx", "app/admin/finance/close/_components/CloseWizard.tsx"],
  "Budget (List)": ["app/admin/finance/budget/page.tsx", "app/admin/finance/budget/_components/BudgetEditor.tsx"],
  "Budget import (Form)": ["app/admin/finance/budget/import/page.tsx"],
  "Forecast (Dashboard)": ["app/admin/finance/forecast/page.tsx", "app/admin/finance/forecast/_components/ForecastBoard.tsx"],
  Revenue: ["app/admin/finance/revenue/RevenueSection.tsx", "app/admin/finance/revenue/_components/RevenueManager.tsx"],
  Model: ["app/admin/finance/model/ModelSection.tsx"],
  "Reports (Form)": [
    "app/admin/finance/reports/page.tsx",
    "app/admin/finance/reports/_components/ComposeForm.tsx",
    "app/admin/finance/reports/_components/ExportControls.tsx",
  ],
  "Board report": ["app/admin/finance/report/BoardReport.tsx", "app/admin/finance/report/_components/PrintButton.tsx"],
  "Rules (Settings)": ["app/admin/finance/rules/page.tsx", "app/admin/finance/rules/_components/RulesEditor.tsx"],
  "Configuration (Settings)": ["app/admin/finance/config/page.tsx", "app/admin/finance/config/_components/ConfigEditor.tsx"],
  "Upload (Settings)": ["app/admin/finance/upload/page.tsx", "app/admin/finance/upload/_components/UploadClient.tsx"],
  "Shared finance pieces": [
    "app/admin/finance/_components/ReconcileCard.tsx",
    "app/admin/finance/_components/RunwayTiers.tsx",
    "app/admin/finance/_components/SetBalanceForm.tsx",
    "app/admin/finance/_components/SetBalanceDrawer.tsx",
  ],
  "Impact outcomes": ["app/admin/impact/outcomes/page.tsx"],
  "Impact KPIs (List)": ["app/admin/kpis/page.tsx", "app/admin/kpis/_components/MetricUpdateForm.tsx"],
  "Impact reports (Form)": ["app/admin/impact/reports/page.tsx"],
};

describe("source guards: every Finance and Impact screen is on the kit", () => {
  for (const [screen, files] of Object.entries(SCREENS)) {
    test(screen, () => {
      for (const f of files) {
        const src = strip(read(f));
        expect(src, `${f}: raw <table>`).not.toMatch(/<table[\s>]/);
        expect(src, `${f}: hand-built overlay`).not.toMatch(/\bfixed\b[^"`]*\binset-0\b|\binset-0\b[^"`]*\bfixed\b/);
        expect(src, `${f}: raw form control`).not.toMatch(/<(input|select|textarea)[\s>]/);
        expect(src, `${f}: imports the kit`).toMatch(/_components\/ui\/|\.\/ui\//);
      }
    });
  }

  test("pages use the frame and PageHeader v2; widths per archetype", () => {
    for (const f of [
      "app/admin/finance/page.tsx",
      "app/admin/finance/transactions/page.tsx",
      "app/admin/finance/budget/page.tsx",
      "app/admin/finance/forecast/page.tsx",
      "app/admin/kpis/page.tsx",
      "app/admin/impact/outcomes/page.tsx",
    ]) {
      expect(read(f), f).toMatch(/<PageShell>/);
    }
    for (const f of [
      "app/admin/finance/rules/page.tsx",
      "app/admin/finance/config/page.tsx",
      "app/admin/finance/upload/page.tsx",
      "app/admin/finance/reports/page.tsx",
      "app/admin/finance/budget/import/page.tsx",
      "app/admin/impact/reports/page.tsx",
    ]) {
      expect(read(f), f).toMatch(/<PageShell width="reading"/);
    }
  });

  test("the snapshot follows Finance.dc.html: decision line, strip, one chart, Needs you, one table", () => {
    const src = strip(read("app/admin/finance/page.tsx"));
    expect(src).toMatch(/aria-label="Where you stand"/);
    expect(src).toMatch(/<SummaryStrip label="Key figures">/);
    expect(src).toMatch(/runwayFigures\(/);
    expect((src.match(/<CashFlowChart/g) ?? []).length).toBe(1);
    expect(src).not.toMatch(/<Donut|<CircleGauge|<Sparkline/);
    expect(src).toMatch(/Needs you/);
    expect((src.match(/<DataTable/g) ?? []).length).toBe(1);
    expect(src).toMatch(/primaryAction=\{canWrite \? <Button href="\/admin\/settings\/finance\/upload">Upload transactions<\/Button>/);
    // Every Figure in the strip takes its source from the pure figure rules.
    expect(src).toMatch(/source=\{f\.source\}/);
    // The old dashboard's capabilities are one click away, not dropped.
    const more = read("app/admin/finance/_components/SnapshotActions.tsx");
    for (const piece of ["Set current balance", "How runway is figured", "Year at a glance", "<RunwayTiers", "Spending by function", "Money in by source"]) {
      expect(more, piece).toContain(piece);
    }
  });

  test("Transactions: DataTable v2, server paging, a guarded bulk Categorize as, reconcile and close kept", () => {
    const src = strip(read("app/admin/finance/transactions/page.tsx"));
    expect(src).toMatch(/<DataTable/);
    expect(src).toMatch(/rowRange\(state\.page, TX_TABLE\.pageSize\)/);
    expect(src).toMatch(/applyTableSort\(/);
    expect(src).toMatch(/kind: "choose"[\s\S]*url: "\/api\/admin\/finance\/transactions\/bulk"[\s\S]*field: "category_id"/);
    expect(src).toMatch(/<ReconcileSection embedded \/>/);
    expect(src).toMatch(/<CloseSection embedded \/>/);
    expect(src).toMatch(/<AiCategorize/);
    expect(read("app/api/admin/finance/transactions/bulk/route.ts")).toMatch(/requirePermission\("finance\.write"\)/);
  });

  test("money writes go through saveAction and are never optimistic", () => {
    for (const f of [
      "app/admin/finance/transactions/_components/CategoryPicker.tsx",
      "app/admin/finance/transactions/_components/FlagToggle.tsx",
      "app/admin/finance/transactions/_components/AiCategorize.tsx",
      "app/admin/finance/reconcile/_components/ReconcileInbox.tsx",
      "app/admin/finance/close/_components/CloseWizard.tsx",
      "app/admin/finance/budget/_components/BudgetEditor.tsx",
      "app/admin/finance/budget/import/page.tsx",
      "app/admin/finance/revenue/_components/RevenueManager.tsx",
      "app/admin/finance/_components/SetBalanceForm.tsx",
      "app/admin/finance/upload/_components/UploadClient.tsx",
      "app/admin/finance/config/_components/ConfigEditor.tsx",
    ]) {
      const src = strip(read(f));
      expect(src, f).toMatch(/useSaveAction\(\)/);
      expect(src, f).not.toMatch(/optimistic\s*:/);
      // A raw fetch only inside a saveAction request function.
      for (const m of Array.from(src.matchAll(/fetch\(/g))) {
        const before = src.slice(Math.max(0, (m.index ?? 0) - 120), m.index);
        expect(before, `${f}: fetch outside saveAction`).toMatch(/request:\s*(async\s*)?\(\)\s*=>/);
      }
    }
  });
});
