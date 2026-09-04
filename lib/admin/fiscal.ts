/**
 * Fiscal-year date math — PURE, dependency-free on purpose (Spec A, stage A4).
 *
 * This lived in lib/admin/finance.ts, and Reed's tools carried a verbatim
 * copy "to keep this module free of any transitive service-role-client
 * import" — the exact two-answers risk Contract 2 exists to end (the recon
 * called that copy the smoking gun). A pure module both sides import removes
 * the copy without giving the session-side module any service-role reach.
 * finance.ts re-exports it, so existing imports keep working.
 */

/**
 * Fiscal-year bounds. startMonth is 1..12. startMonth=1 (calendar year) →
 * YYYY-01-01..YYYY-12-31. Non-calendar (e.g. start=7) → Jul of (year-1)..Jun of
 * year, matching how US nonprofits name FY YYYY (the year it ends).
 */
export function fiscalYearBounds(year: number, startMonth: number): { start: string; end: string } {
  if (startMonth === 1) return { start: `${year}-01-01`, end: `${year}-12-31` };
  const sm = String(startMonth).padStart(2, "0");
  const lastDay = new Date(year, startMonth - 1, 0).getDate();
  const em = String(startMonth - 1).padStart(2, "0");
  return { start: `${year - 1}-${sm}-01`, end: `${year}-${em}-${String(lastDay).padStart(2, "0")}` };
}
