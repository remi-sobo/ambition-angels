// Retention intelligence (modules/03 §Donors 5): LYBUNT/SYBUNT, lapse risk
// from each donor's OWN giving cadence, and the new-donor second-gift
// watch. Pure functions over gift dates — no I/O, directly testable.
//
// Year convention: calendar years (the standard LYBUNT framing donors and
// boards already know). "This year" is inherently partial — labels in the
// UI say "so far this year".

export type RetentionFlag = "lybunt" | "sybunt" | "cadence_lapsed" | "second_gift_watch";

export type DonorRetention = {
  flags: RetentionFlag[];
  daysSinceLast: number | null;
  /** Median days between consecutive gifts; null until 3+ gifts. */
  medianIntervalDays: number | null;
};

export const FLAG_LABELS: Record<RetentionFlag, string> = {
  lybunt: "LYBUNT",
  sybunt: "SYBUNT",
  cadence_lapsed: "Off their rhythm",
  second_gift_watch: "2nd-gift watch",
};

export const FLAG_HELP: Record<RetentionFlag, string> = {
  lybunt: "Gave last year, nothing yet this year",
  sybunt: "Gave in a prior year, nothing this year or last",
  cadence_lapsed: "Overdue against their own giving rhythm",
  second_gift_watch: "First-time donor 30–365 days out with no second gift",
};

const DAY = 86400000;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / DAY);

/**
 * Analyze one donor's gift dates (YYYY-MM-DD, any order).
 *
 * hasActiveRecurring suppresses cadence/second-gift flags — an active
 * monthly plan means money is still arriving on schedule regardless of
 * one-off gift timing.
 */
export function analyzeDonor(
  giftDates: string[],
  todayIso: string,
  hasActiveRecurring = false
): DonorRetention {
  if (giftDates.length === 0) {
    return { flags: [], daysSinceLast: null, medianIntervalDays: null };
  }
  const dates = [...giftDates].sort();
  const last = dates[dates.length - 1];
  const daysSinceLast = Math.max(daysBetween(last, todayIso), 0);

  const thisYear = Number(todayIso.slice(0, 4));
  const years = new Set(dates.map((d) => Number(d.slice(0, 4))));
  const gaveThisYear = years.has(thisYear);
  const gaveLastYear = years.has(thisYear - 1);
  const gaveEarlier = Array.from(years).some((y) => y < thisYear - 1);

  const flags: RetentionFlag[] = [];
  if (!gaveThisYear && gaveLastYear) flags.push("lybunt");
  if (!gaveThisYear && !gaveLastYear && gaveEarlier) flags.push("sybunt");

  // Cadence: needs 3+ DISTINCT gift days to call it a rhythm (same-day
  // gifts would zero the median). Overdue = 1.5× their median interval
  // (floor 30 days so dense histories don't flap).
  let medianIntervalDays: number | null = null;
  const uniqueDays = Array.from(new Set(dates));
  if (uniqueDays.length >= 3) {
    const intervals = uniqueDays.slice(1).map((d, i) => daysBetween(uniqueDays[i], d)).sort((a, b) => a - b);
    const mid = Math.floor(intervals.length / 2);
    medianIntervalDays =
      intervals.length % 2 === 1 ? intervals[mid] : Math.round((intervals[mid - 1] + intervals[mid]) / 2);
    if (
      !hasActiveRecurring &&
      medianIntervalDays > 0 &&
      daysSinceLast > Math.max(1.5 * medianIntervalDays, 30)
    ) {
      flags.push("cadence_lapsed");
    }
  }

  // The sector's weakest link: first-time donors who never give again.
  // Window: past the thank-you period (30d) but not written off (365d).
  if (!hasActiveRecurring && dates.length === 1 && daysSinceLast >= 30 && daysSinceLast <= 365) {
    flags.push("second_gift_watch");
  }

  return { flags, daysSinceLast, medianIntervalDays };
}

/**
 * Donor retention rate: of donors who gave last calendar year, the share
 * who have also given this year (so far). FEP sector benchmark ≈ 43%.
 */
export function retentionRate(
  perDonorDates: string[][],
  todayIso: string
): { rate: number | null; lastYearDonors: number; retained: number } {
  const thisYear = Number(todayIso.slice(0, 4));
  let lastYearDonors = 0;
  let retained = 0;
  for (const dates of perDonorDates) {
    const years = new Set(dates.map((d) => Number(d.slice(0, 4))));
    if (years.has(thisYear - 1)) {
      lastYearDonors += 1;
      if (years.has(thisYear)) retained += 1;
    }
  }
  return {
    rate: lastYearDonors > 0 ? retained / lastYearDonors : null,
    lastYearDonors,
    retained,
  };
}
