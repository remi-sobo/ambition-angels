// Engagement score (Epic K): a 0–100 donor-health signal synthesizing the
// strongest giving behaviors — recency, frequency, monetary, and recurring
// status. Pure and deterministic over ISO date strings so the donor list and
// profile compute the same number, and it's unit-testable.
//
// Intentionally giving-based (not interaction-based) so it's cheap to compute
// across the whole list and identical everywhere. Bands:
//   strong 70–100 · steady 40–69 · at_risk 1–39 · none 0 (no giving)

export type EngagementBand = "strong" | "steady" | "at_risk" | "none";

export type EngagementResult = {
  score: number; // 0–100
  band: EngagementBand;
};

const daysBetween = (aIso: string, bIso: string): number => {
  const a = Date.parse(aIso.length === 10 ? aIso + "T00:00:00" : aIso);
  const b = Date.parse(bIso.length === 10 ? bIso + "T00:00:00" : bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  return Math.floor((b - a) / 86_400_000);
};

// Recency of the most recent gift (0–45).
function recencyPoints(daysSinceLast: number): number {
  if (daysSinceLast <= 90) return 45;
  if (daysSinceLast <= 180) return 36;
  if (daysSinceLast <= 365) return 27;
  if (daysSinceLast <= 730) return 14;
  return 5;
}

// Loyalty by number of gifts (0–30).
function frequencyPoints(count: number): number {
  if (count >= 10) return 30;
  if (count >= 5) return 24;
  if (count >= 3) return 18;
  if (count === 2) return 12;
  if (count === 1) return 6;
  return 0;
}

// Lifetime giving bands (0–15).
function monetaryPoints(total: number): number {
  if (total >= 5000) return 15;
  if (total >= 1000) return 12;
  if (total >= 500) return 9;
  if (total >= 100) return 5;
  if (total > 0) return 2;
  return 0;
}

export function bandFor(score: number): EngagementBand {
  if (score <= 0) return "none";
  if (score >= 70) return "strong";
  if (score >= 40) return "steady";
  return "at_risk";
}

export const BAND_LABEL: Record<EngagementBand, string> = {
  strong: "Strong",
  steady: "Steady",
  at_risk: "At risk",
  none: "No gifts",
};

/**
 * Compute a donor's engagement score.
 * @param giftDates    ISO dates (any order) of the donor's gifts
 * @param lifetimeTotal sum of gift amounts
 * @param hasActiveRecurring active monthly plan → loyalty boost
 * @param todayIso     reference date (YYYY-MM-DD)
 */
export function scoreDonor(
  giftDates: string[],
  lifetimeTotal: number,
  hasActiveRecurring: boolean,
  todayIso: string
): EngagementResult {
  const count = giftDates.length;
  if (count === 0) return { score: 0, band: "none" };

  const last = giftDates.reduce((m, d) => (d > m ? d : m), giftDates[0]);
  const daysSinceLast = Math.max(0, daysBetween(last, todayIso));

  let score =
    recencyPoints(daysSinceLast) +
    frequencyPoints(count) +
    monetaryPoints(lifetimeTotal) +
    (hasActiveRecurring ? 10 : 0);

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, band: bandFor(score) };
}
