// Pure pieces of the V4 donor record (Donor.dc.html): the giving summary
// strip and the next-step bar's wording. Shared by the page and its tests.

export type HistoryRow = { gift_date: string; amount: number | string };

export type GivingSummary = {
  lifetime: number;
  count: number;
  firstDate: string | null;
  last: { amount: number; date: string } | null;
  year: number;
  thisYear: { total: number; count: number };
  lastYear: { total: number; count: number };
};

/** Lifetime, last gift, and this year vs last year, from the FULL history
 *  (never a capped timeline, which would understate a long-time donor). */
export function givingSummary(history: readonly HistoryRow[], today: string): GivingSummary {
  const year = Number(today.slice(0, 4));
  const rows = history
    .map((g) => ({ date: g.gift_date, amount: Number(g.amount) }))
    .filter((g) => Number.isFinite(g.amount))
    .sort((a, b) => a.date.localeCompare(b.date));
  const sum = (y: number) => {
    const inY = rows.filter((g) => Number(g.date.slice(0, 4)) === y && g.date <= today);
    return { total: round2(inY.reduce((s, g) => s + g.amount, 0)), count: inY.length };
  };
  const last = rows.length ? rows[rows.length - 1] : null;
  return {
    lifetime: round2(rows.reduce((s, g) => s + g.amount, 0)),
    count: rows.length,
    firstDate: rows[0]?.date ?? null,
    last: last ? { amount: last.amount, date: last.date } : null,
    year,
    thisYear: sum(year),
    lastYear: sum(year - 1),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole days from `a` to `b` (YYYY-MM-DD), positive when b is later. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86400000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 9", or "Nov 9, 2025" outside the current year. */
export function shortDay(iso: string, today: string): string {
  const s = `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? s : `${s}, ${iso.slice(0, 4)}`;
}

/** How a due date reads: "12 days late.", "Due today.", "Due tomorrow.", "Due Nov 28." */
export function dueText(due: string, today: string): { text: string; late: boolean; daysLate: number } {
  const d = daysBetween(today, due);
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} late.`, late: true, daysLate: -d };
  if (d === 0) return { text: "Due today.", late: false, daysLate: 0 };
  if (d === 1) return { text: "Due tomorrow.", late: false, daysLate: 0 };
  return { text: `Due ${shortDay(due, today)}.`, late: false, daysLate: 0 };
}

/** The step as a sentence for the bar ("Send year-end ask."). */
export function asSentence(step: string): string {
  const t = step.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** "Up $3,000", "Down $500", "Same as last year", or null with no history. */
export function yearOverYear(thisYear: number, lastYear: number, fmt: (n: number) => string): string | null {
  if (thisYear === 0 && lastYear === 0) return null;
  const d = round2(thisYear - lastYear);
  if (d === 0) return "Same as last year";
  return d > 0 ? `Up ${fmt(d)}` : `Down ${fmt(-d)}`;
}

/** Whole dollars with separators ("$25,000"); cents only when there are
 *  some. Records and boards show exact money, never "$25k". */
export function usd(n: number): string {
  const cents = Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}

export type StepAsk = {
  id: string; name: string | null; open: boolean; next_step: string | null;
  next_step_due: string | null; ask_amount: number | null; owner: string | null;
};

/** The bar's step as plain data, chosen the way the record chooses it: the
 *  soonest-due open ask with a step, else the first open ask (step empty),
 *  else no ask (oppId null). The search preview renders this. */
export function nextStepData(asks: readonly StepAsk[], today: string) {
  const open = asks.filter((a) => a.open);
  const move = open.filter((a) => a.next_step).sort((a, b) => (a.next_step_due ?? "9999").localeCompare(b.next_step_due ?? "9999"))[0] ?? null;
  const opp = move ?? open[0] ?? null;
  const due = move?.next_step_due ? dueText(move.next_step_due, today) : null;
  const meta = opp
    ? [
        move?.next_step_due && due?.late ? `Was due ${shortDay(move.next_step_due, today)}.` : "",
        opp.owner ? `Owner: ${opp.owner}.` : "",
        `For ${opp.name ? `the ${opp.name}` : "the open ask"}${opp.ask_amount ? `, ${usd(Number(opp.ask_amount))}` : ""}.`,
        open.length > 1 ? `${open.length} open asks.` : "",
      ].filter(Boolean).join(" ")
    : null;
  return {
    oppId: opp?.id ?? null,
    title: move?.next_step ? asSentence(move.next_step) : null,
    due: due ? { text: due.text, late: due.late } : undefined,
    dueISO: move?.next_step_due ?? null,
    meta,
  };
}
