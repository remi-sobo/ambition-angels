import type { Freshness } from "@/lib/admin/figure";

/**
 * The Finance snapshot (V4 Stage G2, specs/v4-prototypes/Finance.dc.html):
 * the decision line, the summary strip's figures, the "Needs you" list and
 * the budget rows, decided here so the page only renders. PURE and
 * unit-tested (tests/finance-g2.test.ts).
 *
 * The rule that matters most (spec §2 principle 3): every figure carries a
 * source line, and a number we do not have is `value: null` (Figure renders
 * "No data yet"), never 0. A failed read, a ledger with no anchor balance and
 * a runway with no burn to divide by are all missing, not zero.
 */

export const CASH_STALE_DAYS = 14;
export const LEDGER_STALE_DAYS = 10;
export const CLOSE_STALE_DAYS = 8;

export type DashFigure = {
  key: string;
  label: string;
  value: string | null;
  source: string;
  freshness: Freshness;
  compare?: string;
  compareTone?: "muted" | "danger";
  href?: string;
  refreshHref?: string;
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function shortDate(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function agoWords(days: number): string {
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fiscal year 2026, Jan 1 to Dec 31" from the fiscal bounds. */
export function fiscalYearLabel(year: number, bounds: { start: string; end: string }): string {
  const s = bounds.start.split("-").map(Number);
  const e = bounds.end.split("-").map(Number);
  return `Fiscal year ${year}, ${MONTHS[s[1] - 1]} ${s[2]} to ${MONTHS[e[1] - 1]} ${e[2]}`;
}

export function formatMonths(m: number): string {
  return `${m.toFixed(1)} month${m.toFixed(1) === "1.0" ? "" : "s"}`;
}

/** Drift between a typed bank balance and the computed cash. */
export function balanceDrift(
  entered: number,
  computed: number,
): { kind: "match" } | { kind: "gap"; amount: number; direction: "more" | "less" } {
  const d = entered - computed;
  if (Math.abs(d) < 0.5) return { kind: "match" };
  return { kind: "gap", amount: Math.abs(d), direction: d > 0 ? "more" : "less" };
}

export type CashInputs = {
  cashOnHand: number;
  /** fin_config.cash_starting_date: the anchor. null = no balance ever set. */
  anchorDate: string | null;
  /** fin_config.cash_reconciled_at: the last "set current balance". */
  reconciledAt: string | null;
  partial: boolean;
};

export type CashState = { known: boolean; freshness: Freshness; days: number | null };

/** Cash is known only once a balance has been anchored. */
export function cashState(c: CashInputs, now: Date): CashState {
  if (!c.anchorDate && !c.reconciledAt) return { known: false, freshness: "missing", days: null };
  const days = daysSince(c.reconciledAt ?? c.anchorDate, now);
  if (c.partial) return { known: true, freshness: "partial", days };
  if (days === null || days > CASH_STALE_DAYS) return { known: true, freshness: "stale", days };
  return { known: true, freshness: "fresh", days };
}

export function cashFigure(c: CashInputs, now: Date, setBalanceHref: string): DashFigure {
  const st = cashState(c, now);
  if (!st.known) {
    return {
      key: "cash",
      label: "Cash on hand",
      value: null,
      freshness: "missing",
      source: "Set your bank balance to start.",
      refreshHref: setBalanceHref,
    };
  }
  const set = c.reconciledAt ?? c.anchorDate;
  const source =
    st.freshness === "partial"
      ? "From part of the ledger: more transactions than one read holds."
      : st.days === null
        ? "From the balance you set, plus transactions since."
        : `From the bank balance set ${agoWords(st.days)}, plus transactions since.`;
  return {
    key: "cash",
    label: "Cash on hand",
    value: usd(c.cashOnHand),
    freshness: st.freshness,
    source: st.freshness === "stale" && set ? `Bank balance last set ${agoWords(st.days ?? 0)}.` : source,
    refreshHref: setBalanceHref,
  };
}

export type RunwayFigureInputs = {
  cashKnown: boolean;
  cashFreshness: Freshness;
  /** runway.cash.months / runway.due.months: null when there is no burn. */
  cashMonths: number | null;
  dueMonths: number | null;
  baseline: number;
  baselineSource: "config" | "trailing";
  duePledges: number;
  /** ISO date, the last day of the current month. */
  endCurrentMonth: string;
};

function runwayFreshness(r: RunwayFigureInputs): Freshness {
  return r.cashFreshness === "missing" ? "missing" : r.cashFreshness;
}

/** The two runway figures Remi asked to see side by side on the snapshot:
 *  cash only, and with pledges due by month end. */
export function runwayFigures(r: RunwayFigureInputs, setBalanceHref: string): [DashFigure, DashFigure] {
  const why = !r.cashKnown
    ? "Needs a bank balance first."
    : r.cashMonths === null
      ? "Needs a monthly burn: set a baseline or import spending."
      : null;
  const per = `${usd(r.baseline)} a month (${r.baselineSource === "config" ? "your baseline" : "3-month average spend"})`;
  const fresh = runwayFreshness(r);
  const cash: DashFigure =
    why !== null
      ? { key: "runway-cash", label: "Runway, cash only", value: null, freshness: "missing", source: why, refreshHref: !r.cashKnown ? setBalanceHref : undefined }
      : {
          key: "runway-cash",
          label: "Runway, cash only",
          value: formatMonths(r.cashMonths as number),
          freshness: fresh,
          source: `Cash after this month's spend, at ${per}.`,
          refreshHref: setBalanceHref,
          compareTone: (r.cashMonths as number) < 3 ? "danger" : "muted",
        };
  const due: DashFigure =
    why !== null || r.dueMonths === null
      ? { key: "runway-due", label: "Runway with pledges due", value: null, freshness: "missing", source: why ?? "Needs a monthly burn." }
      : {
          key: "runway-due",
          label: "Runway with pledges due",
          value: formatMonths(r.dueMonths),
          freshness: fresh,
          source:
            r.duePledges > 0
              ? `Adds ${usd(r.duePledges)} in pledges due by ${shortDate(r.endCurrentMonth)}.`
              : `No pledges due by ${shortDate(r.endCurrentMonth)}, so it matches cash only.`,
          refreshHref: setBalanceHref,
        };
  return [cash, due];
}

export function receivedFigure(
  received: { total: number; truncated: boolean; error?: true },
  goal: number,
  fyStart: string,
): DashFigure {
  if (received.error) {
    return { key: "received", label: "Received this year", value: null, freshness: "missing", source: "Gifts could not be read. Reload to retry." };
  }
  return {
    key: "received",
    label: "Received this year",
    value: usd(received.total),
    freshness: received.truncated ? "partial" : "fresh",
    compare: goal > 0 ? `${Math.round((received.total / goal) * 100)}% of ${usd(goal)} goal` : undefined,
    source: `From recorded gifts, ${shortDate(fyStart)} to now.`,
    href: "/admin/finance/forecast",
  };
}

export function spentFigure(
  spent: { expenseYTD: number; partial: boolean; ledgerRows: number | null; lastImportAt: string | null; totalBudget: number },
  fyStart: string,
  now: Date,
): DashFigure {
  if (spent.ledgerRows === null) {
    return { key: "spent", label: "Spent this year", value: null, freshness: "missing", source: "The ledger could not be read. Reload to retry." };
  }
  if (spent.ledgerRows === 0) {
    return { key: "spent", label: "Spent this year", value: null, freshness: "missing", source: "Import a bank export to see spending.", refreshHref: "/admin/settings/finance/upload" };
  }
  const days = daysSince(spent.lastImportAt, now);
  const stale = days !== null && days > LEDGER_STALE_DAYS;
  return {
    key: "spent",
    label: "Spent this year",
    value: usd(spent.expenseYTD),
    freshness: spent.partial ? "partial" : stale ? "stale" : "fresh",
    compare:
      spent.totalBudget > 0
        ? `${Math.round((spent.expenseYTD / spent.totalBudget) * 100)}% of ${usd(spent.totalBudget)} budget`
        : undefined,
    source:
      days === null
        ? `From imported transactions, ${shortDate(fyStart)} to now.`
        : `From transactions, last import ${agoWords(days)}.`,
    href: "/admin/finance/transactions?status=outflow",
    refreshHref: "/admin/settings/finance/upload",
  };
}

export type Decision = { tone: "success" | "warning" | "danger"; headline: string; detail: string; action?: { label: string; href: string } };

/** The decision line: where you stand, in plain words. */
export function decisionLine(r: RunwayFigureInputs, setBalanceHref: string): Decision {
  if (!r.cashKnown) {
    return {
      tone: "warning",
      headline: "Runway cannot be figured yet.",
      detail: "Set your current bank balance and BloomOS will work out how many months your cash lasts.",
      action: { label: "Set balance", href: setBalanceHref },
    };
  }
  if (r.cashMonths === null) {
    return {
      tone: "warning",
      headline: "Runway cannot be figured yet.",
      detail: "There is no monthly spending to divide by. Set a burn baseline or import transactions.",
      action: { label: "Set a baseline", href: "/admin/settings/finance/config" },
    };
  }
  const m = r.cashMonths;
  const due = r.dueMonths !== null && formatMonths(r.dueMonths) !== formatMonths(m) ? ` ${formatMonths(r.dueMonths)} counting pledges due this month.` : "";
  if (m < 1.5) {
    return { tone: "danger", headline: `You have ${formatMonths(m)} of runway.`, detail: `That is under six weeks of cash.${due}`, action: { label: "Open forecast", href: "/admin/finance/forecast" } };
  }
  if (m < 3) {
    return { tone: "warning", headline: `You have ${formatMonths(m)} of runway.`, detail: `That is under three months of cash.${due}`, action: { label: "Open forecast", href: "/admin/finance/forecast" } };
  }
  return { tone: "success", headline: `You have ${formatMonths(m)} of runway.`, detail: `Cash alone covers more than three months.${due}` };
}

export type NeedItem = { key: string; title: string; detail: string; action: string; href: string; tone: "danger" | "muted" };

export type NeedsInputs = {
  uncategorized: { count: number; total: number; oldest: string | null; error: string | null };
  reconcilePending: number | null;
  cash: CashState;
  overBudget: Array<{ group: string; budget: number; actual: number }>;
  undatedPledges: number;
  lastClosedAt: string | null;
  setBalanceHref: string;
};

/** "Needs you": the few things to do, most money-moving first. */
export function needsYou(n: NeedsInputs, now: Date): NeedItem[] {
  const out: NeedItem[] = [];
  if (n.uncategorized.count > 0) {
    out.push({
      key: "uncategorized",
      title: `${n.uncategorized.count} transaction${n.uncategorized.count === 1 ? "" : "s"} need a category`,
      detail: `${usd(n.uncategorized.total)} in all.${n.uncategorized.oldest ? ` Oldest is from ${shortDate(n.uncategorized.oldest)}.` : ""}`,
      action: "Categorize",
      href: "/admin/finance/transactions?category=uncategorized",
      tone: "muted",
    });
  }
  if (n.reconcilePending && n.reconcilePending > 0) {
    out.push({
      key: "reconcile",
      title: `${n.reconcilePending} reconcile proposal${n.reconcilePending === 1 ? "" : "s"} to review`,
      detail: "Nothing reaches the ledger until you accept it.",
      action: "Review",
      href: "/admin/finance/transactions#reconcile",
      tone: "muted",
    });
  }
  if (!n.cash.known) {
    out.push({ key: "balance", title: "No bank balance set yet", detail: "Cash and runway start from it.", action: "Set balance", href: n.setBalanceHref, tone: "danger" });
  } else if (n.cash.freshness === "stale") {
    out.push({
      key: "balance",
      title: "Bank balance is out of date",
      detail: n.cash.days === null ? "It has never been confirmed." : `Last set ${agoWords(n.cash.days)}.`,
      action: "Set balance",
      href: n.setBalanceHref,
      tone: "danger",
    });
  }
  for (const g of n.overBudget.slice(0, 2)) {
    const pct = Math.round(((g.actual - g.budget) / g.budget) * 100);
    out.push({
      key: `over-${g.group}`,
      title: `${g.group} is ${pct}% over`,
      detail: `${usd(g.actual)} spent of ${usd(g.budget)} budgeted.`,
      action: "Review",
      href: "/admin/finance/budget",
      tone: "danger",
    });
  }
  if (n.undatedPledges > 0) {
    out.push({
      key: "undated",
      title: `${n.undatedPledges} pledge${n.undatedPledges === 1 ? " has" : "s have"} no expected date`,
      detail: "Undated pledges are left out of runway.",
      action: "Add dates",
      href: "/admin/finance/forecast",
      tone: "muted",
    });
  }
  const closedDays = daysSince(n.lastClosedAt, now);
  if (closedDays === null || closedDays > CLOSE_STALE_DAYS) {
    out.push({
      key: "close",
      title: closedDays === null ? "The books have never been closed" : `Last close was ${closedDays} days ago`,
      detail: "The Friday close gets every number current at once.",
      action: "Start close",
      href: "/admin/finance/transactions#close",
      tone: "muted",
    });
  }
  return out.slice(0, 5);
}

export type BudgetRow = {
  group: string;
  budget: number;
  actual: number;
  /** actual / budget, null with no budget to measure against. */
  pct: number | null;
  diff: string;
  diffTone: "under" | "over" | "even" | "none";
};

export function budgetRows(groups: Array<{ group: string; budget: number; actual: number }>): BudgetRow[] {
  return groups
    .filter((g) => g.budget > 0 || g.actual > 0)
    .sort((a, b) => b.budget - a.budget || b.actual - a.actual)
    .map((g) => {
      if (g.budget <= 0) return { ...g, pct: null, diff: "No budget yet", diffTone: "none" as const };
      const d = g.budget - g.actual;
      const pct = g.actual / g.budget;
      if (Math.abs(d) < 0.5) return { ...g, pct, diff: "On budget", diffTone: "even" as const };
      return d > 0
        ? { ...g, pct, diff: `${usd(d)} under`, diffTone: "under" as const }
        : { ...g, pct, diff: `${usd(-d)} over (${Math.round(((g.actual - g.budget) / g.budget) * 100)}%)`, diffTone: "over" as const };
    });
}
