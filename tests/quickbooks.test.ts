import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  fiscalYearToDateStart,
  pacificToday,
  parseBankAccounts,
  parseProfitAndLossDetail,
  registerTotals,
  type QboReport,
} from "@/lib/quickbooks/register";
import {
  BANK_ACCOUNT_QUERY,
  QBO_ALLOWED_READS,
  assertAllowedQboRead,
} from "@/lib/quickbooks/client";

// A trimmed ProfitAndLossDetail response in QBO's report JSON shape.
const col = (title: string, key: string) => ({ ColTitle: title, MetaData: [{ Name: "ColKey", Value: key }] });
const data = (date: string, type: string, name: string, memo: string, split: string, amount: string) => ({
  type: "Data",
  ColData: [{ value: date }, { value: type }, { value: "" }, { value: name }, { value: memo }, { value: split }, { value: amount }, { value: "0" }],
});
const section = (header: string, rows: unknown[], group?: string) => ({
  type: "Section",
  ...(group ? { group } : {}),
  Header: { ColData: [{ value: header }] },
  Rows: { Row: rows },
  Summary: { ColData: [{ value: `Total ${header}` }] },
});

const REPORT = {
  Columns: {
    Column: [
      col("Date", "tx_date"),
      col("Transaction Type", "txn_type"),
      col("Num", "doc_num"),
      col("Name", "name"),
      col("Memo/Description", "memo"),
      col("Split", "split_acc"),
      col("Amount", "subt_nat_amount"),
      col("Balance", "rbal_nat_amount"),
    ],
  },
  Rows: {
    Row: [
      section(
        "Income",
        [section("4000 Contributions", [data("2026-02-01", "Deposit", "Koshland Foundation", "Grant", "Checking", "25,000.00")])],
        "Income"
      ),
      { type: "Section", group: "GrossProfit", Summary: { ColData: [{ value: "Gross Profit" }] } },
      section(
        "Expenses",
        [
          section("6000 Payroll", [
            section("6010 Salaries", [data("2026-01-31", "Payroll Check", "Gusto", "", "Checking", "8000.00")]),
          ]),
          section("6200 Software", [
            data("2026-03-05", "Expense", "Vercel", "Hosting", "Checking", "20.00"),
            data("2026-03-06", "Expense", "Vercel", "Refund", "Checking", "-5.00"),
          ]),
        ],
        "Expenses"
      ),
      section("Other Income", [section("7000 Interest", [data("2026-03-31", "Deposit", "", "Interest", "Savings", "1.25")])], "OtherIncome"),
      { type: "Section", group: "NetIncome", Summary: { ColData: [{ value: "Net Income" }] } },
    ],
  },
} as unknown as QboReport;

describe("parseProfitAndLossDetail", () => {
  const lines = parseProfitAndLossDetail(REPORT);

  it("returns every income and expense line, newest first", () => {
    expect(lines.map((l) => l.date)).toEqual(["2026-03-31", "2026-03-06", "2026-03-05", "2026-02-01", "2026-01-31"]);
  });

  it("assigns each line to its innermost account", () => {
    expect(lines.find((l) => l.name === "Gusto")?.account).toBe("6010 Salaries");
    expect(lines.find((l) => l.memo === "Grant")?.account).toBe("4000 Contributions");
  });

  it("signs income positive and expense negative (fin_transactions convention)", () => {
    expect(lines.find((l) => l.memo === "Grant")).toMatchObject({ kind: "income", amount: 25000 });
    expect(lines.find((l) => l.memo === "Hosting")).toMatchObject({ kind: "expense", amount: -20 });
    // An expense refund (negative in its account) reads as money back in.
    expect(lines.find((l) => l.memo === "Refund")?.amount).toBe(5);
    expect(lines.find((l) => l.memo === "Interest")).toMatchObject({ kind: "income", amount: 1.25 });
  });

  it("totals income and expense", () => {
    expect(registerTotals(lines)).toEqual({ income: 25001.25, expense: 8015 });
  });

  it("tolerates an empty report", () => {
    expect(parseProfitAndLossDetail({})).toEqual([]);
  });
});

describe("parseBankAccounts", () => {
  it("sums only active Bank accounts", () => {
    const cash = parseBankAccounts(
      [
        { Name: "Checking", AccountType: "Bank", Active: true, CurrentBalance: 120000.5 },
        { Name: "Savings", AccountType: "Bank", Active: true, CurrentBalance: 30000 },
        { Name: "Amex", AccountType: "Credit Card", Active: true, CurrentBalance: 900 },
        { Name: "Old", AccountType: "Bank", Active: false, CurrentBalance: 5 },
      ],
      "2026-10-07"
    );
    expect(cash).toEqual({
      balance: 150000.5,
      asOf: "2026-10-07",
      accounts: [
        { name: "Checking", balance: 120000.5 },
        { name: "Savings", balance: 30000 },
      ],
    });
  });
});

describe("fiscalYearToDateStart", () => {
  it("calendar fiscal year", () => expect(fiscalYearToDateStart("2026-10-07", 1)).toBe("2026-01-01"));
  it("July fiscal year, after the start", () => expect(fiscalYearToDateStart("2026-10-07", 7)).toBe("2026-07-01"));
  it("July fiscal year, before the start", () => expect(fiscalYearToDateStart("2026-03-01", 7)).toBe("2025-07-01"));
});

it("pacificToday is the Pacific calendar date", () => {
  // 2026-10-08 05:00 UTC is still Oct 7 in California.
  expect(pacificToday(new Date("2026-10-08T05:00:00Z"))).toBe("2026-10-07");
});

describe("QuickBooks read scope (register + cash only)", () => {
  it("allows exactly the two reads", () => {
    expect([...QBO_ALLOWED_READS]).toEqual(["reports/ProfitAndLossDetail", "query"]);
    expect(() => assertAllowedQboRead("reports/ProfitAndLossDetail", {})).not.toThrow();
    expect(() => assertAllowedQboRead("query", { query: BANK_ACCOUNT_QUERY })).not.toThrow();
  });

  it("refuses budget, class, and reconciliation reads", () => {
    for (const path of ["reports/BudgetSummary", "reports/BudgetVsActuals", "budget", "reports/ClassSales", "class", "reports/AccountList"]) {
      expect(() => assertAllowedQboRead(path, {})).toThrow();
    }
    for (const query of ["select * from Budget", "select * from Class", "select * from Account"]) {
      expect(() => assertAllowedQboRead("query", { query })).toThrow();
    }
  });

  it("the client only issues GETs", () => {
    const src = readFileSync("lib/quickbooks/client.ts", "utf8");
    const apiFetch = src.slice(src.indexOf("async function qboGet"));
    expect(apiFetch).toContain('method: "GET"');
    expect(apiFetch).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
  });
});
