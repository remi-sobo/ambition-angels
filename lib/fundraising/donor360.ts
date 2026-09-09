/**
 * Spec Fundraising, stage F2 — pure helpers for the Donor 360's new panels.
 * No server imports; tests/donor360.test.ts runs them on fixtures.
 */

export type GiftHistoryRow = { gift_date: string; amount: number };

/** Giving by calendar-fiscal year (the house year vocabulary), newest
 *  first. Pure aggregation of the full gift history the profile already
 *  fetches — one source of truth with the lifetime total. */
export function givingByYear(
  history: GiftHistoryRow[],
): Array<{ year: string; total: number; count: number }> {
  const byYear = new Map<string, { total: number; count: number }>();
  for (const g of history) {
    const year = g.gift_date.slice(0, 4);
    const y = byYear.get(year) ?? { total: 0, count: 0 };
    y.total += g.amount;
    y.count += 1;
    byYear.set(year, y);
  }
  return Array.from(byYear.entries())
    .map(([year, v]) => ({ year, ...v }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

export type RequirementRow = {
  id: string;
  kind: string;
  label: string | null;
  due_date: string;
  status: string;
  grant_name: string;
};

/**
 * Reporting owed: the requirements still due to this funder. submitted and
 * waived are done; upcoming and in_progress are owed, soonest first —
 * overdue rows (due before today) sort to the very top by the same rule.
 */
export function reportingOwed(rows: RequirementRow[]): RequirementRow[] {
  return rows
    .filter((r) => r.status === "upcoming" || r.status === "in_progress")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export const REQUIREMENT_KIND_LABEL: Record<string, string> = {
  loi: "LOI",
  application: "Application",
  interim_report: "Interim report",
  final_report: "Final report",
  financial_report: "Financial report",
  other: "Requirement",
};
