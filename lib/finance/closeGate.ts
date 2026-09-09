/**
 * Spec Finance, stage N1 — the Contract 7 gate on the period close. PURE:
 * the route feeds it live counts; tests feed it fixtures.
 *
 * Spec A's gating rule names "period close" as a gated exit, and its
 * export_waivers schema anticipated exactly this shape: artifact_type
 * 'period_close', artifact_id the period key ('2026-09'), metric_key NULL
 * (an unresolved reconciliation item is not a metric). Drafting is never
 * blocked — the wizard renders and every step but the stamp works; only the
 * stamp is the exit.
 */

export const CLOSE_ARTIFACT_TYPE = "period_close";

/** The period a close stamped today belongs to: the calendar month. */
export function periodKey(todayISO: string): string {
  return todayISO.slice(0, 7);
}

/**
 * Blocked iff reconciliation proposals are still pending and no
 * reports.approve holder has waived THIS period. A waiver from a prior
 * month never carries forward — the artifact_id lookup enforces that; this
 * function just states the rule.
 */
export function closeBlocked(pendingCount: number, hasWaiverForPeriod: boolean): boolean {
  return pendingCount > 0 && !hasWaiverForPeriod;
}
