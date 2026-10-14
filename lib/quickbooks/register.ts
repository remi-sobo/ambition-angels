/**
 * QuickBooks Online → BloomOS, the two things we read. PURE (no I/O) so the
 * shapes are pinned by tests/quickbooks.test.ts.
 *
 * Scope is deliberately narrow (Shannon's ruling, Oct 2026): BloomOS pulls
 *   1. the to-date transaction register, each line with its account, and
 *   2. the current cash-in-account balance with its as-of date (runway base).
 * No budgets, no Class (Program/Admin/Fundraising) tracking, no reconciliation
 * data. HubSpot owns pledges and forward-looking inflows.
 *
 * The register comes from the ProfitAndLossDetail report (cash basis): its
 * sections are the income and expense accounts, so every line arrives already
 * assigned to an account and already known to be income or expense. The cash
 * balance is the sum of the active Bank accounts' CurrentBalance.
 */

export type RegisterKind = "income" | "expense";

export type RegisterLine = {
  /** YYYY-MM-DD */
  date: string;
  /** QBO transaction type, e.g. "Expense", "Deposit", "Check". */
  type: string;
  /** Payee / customer name, when the line has one. */
  name: string;
  /** Memo / description. */
  memo: string;
  /** The income or expense account the line is assigned to. */
  account: string;
  kind: RegisterKind;
  /** Signed like fin_transactions: income positive, expense negative. */
  amount: number;
};

export type BankAccountBalance = { name: string; balance: number };

export type CashBalance = {
  balance: number;
  /** YYYY-MM-DD the balance was read for. */
  asOf: string;
  accounts: BankAccountBalance[];
};

// ── Report JSON shapes (the subset we read) ────────────────────────────────

type ColData = { value?: string; id?: string };
type ReportRow = {
  type?: string;
  group?: string;
  Header?: { ColData?: ColData[] };
  ColData?: ColData[];
  Rows?: { Row?: ReportRow[] };
};
export type QboReport = {
  Columns?: { Column?: { ColTitle?: string; ColType?: string; MetaData?: { Name?: string; Value?: string }[] }[] };
  Rows?: { Row?: ReportRow[] };
};

/** Top-level P&L section group → income or expense. Summary groups
 *  (GrossProfit, NetIncome, ...) carry no lines and map to nothing. */
const GROUP_KIND: Record<string, RegisterKind> = {
  Income: "income",
  OtherIncome: "income",
  COGS: "expense",
  Expenses: "expense",
  OtherExpenses: "expense",
};

/** Column index by QBO ColKey (MetaData), falling back to the column title. */
function columnIndex(report: QboReport): Record<string, number> {
  const cols = report.Columns?.Column ?? [];
  const idx: Record<string, number> = {};
  const byTitle: Record<string, string> = {
    date: "tx_date",
    "transaction type": "txn_type",
    name: "name",
    "memo/description": "memo",
    memo: "memo",
    amount: "subt_nat_amount",
  };
  cols.forEach((c, i) => {
    const key = c.MetaData?.find((m) => m.Name === "ColKey")?.Value ?? byTitle[(c.ColTitle ?? "").toLowerCase()];
    if (key && idx[key] === undefined) idx[key] = i;
  });
  return idx;
}

function num(v: string | undefined): number {
  const n = Number((v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Flatten a ProfitAndLossDetail report into register lines. A line's account
 * is the innermost section header above it (sub-accounts nest as sections).
 * Amounts arrive in each account's natural sign (a refund is negative), so
 * income keeps its sign and expense is negated, matching fin_transactions.
 */
export function parseProfitAndLossDetail(report: QboReport): RegisterLine[] {
  const col = columnIndex(report);
  const at = (cd: ColData[], key: string) => (col[key] === undefined ? "" : (cd[col[key]]?.value ?? "").trim());
  const out: RegisterLine[] = [];

  const walk = (rows: ReportRow[], kind: RegisterKind, account: string) => {
    for (const row of rows) {
      if (row.Rows?.Row) {
        const header = (row.Header?.ColData?.[0]?.value ?? "").trim();
        walk(row.Rows.Row, kind, header || account);
        continue;
      }
      if (row.type !== "Data" || !row.ColData) continue;
      const date = at(row.ColData, "tx_date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const raw = num(at(row.ColData, "subt_nat_amount"));
      out.push({
        date,
        type: at(row.ColData, "txn_type"),
        name: at(row.ColData, "name"),
        memo: at(row.ColData, "memo"),
        account,
        kind,
        amount: Math.round((kind === "income" ? raw : -raw) * 100) / 100,
      });
    }
  };

  for (const top of report.Rows?.Row ?? []) {
    const kind = top.group ? GROUP_KIND[top.group] : undefined;
    if (!kind || !top.Rows?.Row) continue;
    walk(top.Rows.Row, kind, (top.Header?.ColData?.[0]?.value ?? "").trim());
  }

  // Newest first, the order the register is read in.
  return out.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

type QboAccount = { Name?: string; AccountType?: string; Active?: boolean; CurrentBalance?: number };

/** Cash in account = Σ CurrentBalance of the active Bank accounts. */
export function parseBankAccounts(accounts: QboAccount[], asOf: string): CashBalance {
  const banks = accounts
    .filter((a) => a.AccountType === "Bank" && a.Active !== false)
    .map((a) => ({ name: a.Name ?? "Bank account", balance: Math.round(Number(a.CurrentBalance ?? 0) * 100) / 100 }));
  const balance = Math.round(banks.reduce((s, a) => s + a.balance, 0) * 100) / 100;
  return { balance, asOf, accounts: banks };
}

/** Start of the fiscal year containing `today` (YYYY-MM-DD), startMonth 1..12. */
export function fiscalYearToDateStart(today: string, startMonth: number): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const sm = startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
  const year = m >= sm ? y : y - 1;
  return `${year}-${String(sm).padStart(2, "0")}-01`;
}

/** Today's date in Pacific time, the org's working day. */
export function pacificToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function registerTotals(lines: RegisterLine[]): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const l of lines) {
    if (l.kind === "income") income += l.amount;
    else expense += -l.amount;
  }
  return { income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100 };
}
