/**
 * Task effort estimates (Weekly Plan v2, PR 2). One vocabulary for the chips
 * and one validator for the write routes, so the UI can't offer a value the
 * column's check (1 to 960) would reject. Pure; tests/estimates.test.ts.
 */

/** The quick-pick chips, in minutes. */
export const ESTIMATE_CHIPS = [15, 30, 60, 90, 120] as const;

export const ESTIMATE_MIN = 1;
export const ESTIMATE_MAX = 960;

/**
 * Validate an incoming estimated_minutes value from a request body.
 * Returns the value to write (an integer in range, or null to clear), or
 * undefined when the input is invalid.
 */
export function parseEstimate(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v)) return undefined;
  if (v < ESTIMATE_MIN || v > ESTIMATE_MAX) return undefined;
  return v;
}

/** "15m" / "1h" / "1h 30m": the chip label. */
export function formatEstimate(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
