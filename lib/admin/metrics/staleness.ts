/**
 * Metric freshness — pure, testable, no server imports.
 *
 * A metric is stale when its latest snapshot is older than its cadence
 * allows. Derived at read time, never stored (a stored flag would drift).
 *
 * DRIFT GUARD: this allowance table is duplicated in SQL by the metric_stale
 * arm of v_action_items (supabase/migrations/metrics_stale_queue_arm.sql).
 * tests/metrics.test.ts asserts the SQL literals match this table — change
 * one, change both.
 */
export const STALE_AFTER_DAYS: Record<string, number> = {
  daily: 2,
  weekly: 10,
  monthly: 40,
  quarterly: 100,
};

export function staleAfter(cadence: string): number {
  return STALE_AFTER_DAYS[cadence] ?? 40;
}

export function isStale(lastCapturedOn: string | null, cadence: string, now: number = Date.now()): boolean {
  if (!lastCapturedOn) return true;
  const ageDays = Math.floor((now - new Date(lastCapturedOn + "T00:00:00Z").getTime()) / 86_400_000);
  return ageDays > staleAfter(cadence);
}
