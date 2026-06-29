/**
 * Forward-runway model — Finance v2 (Shannon's 9 steps, made deterministic).
 *
 * Pure and DB-free on purpose: unit-testable, and reusable by anything that has
 * the inputs (the admin snapshot, Reed, and later Horizon). No service-role
 * client is reachable from here, so Reed can import it on its RLS-scoped client
 * without dragging in the admin client.
 *
 * Three runway numbers, one canonical function:
 *   1. cash      (steps 1–5): bank balance net of what's left to spend this
 *                 month, over the baseline.
 *   2. due       (steps 6–7): plus unreceived pledges due on/before month end.
 *   3. projected (steps 8–9): plus unreceived pledges due within the horizon.
 *
 * Load-bearing rules: unreceived only (received money is already in the bank),
 * full value never probability-weighted (a pledge is a commitment), restricted
 * excluded (can't cover general operating), undated excluded (can't be tiered).
 * D1: tiers read "months beyond now" — no +1 for the current month.
 */

export type PledgeStatus = "received" | "secured" | "projected";

/** Source-agnostic pledge shape the runway reasons over (Bloom or HubSpot). */
export type RunwayPledge = {
  amount: number;
  status: PledgeStatus;
  /** ISO YYYY-MM-DD, or null when the pledge has no date yet. */
  expected_date: string | null;
  restricted: boolean;
  /** External system id (e.g. HubSpot deal id) for de-dup against adopted rows. */
  externalRef?: string | null;
};

export type PledgeSums = {
  duePledges: number;
  projPledges: number;
  /**
   * Unreceived, unrestricted pledges with no date — they can't be placed in a
   * tier, so they're excluded but surfaced as a "missing dates" nudge rather
   * than silently vanishing.
   */
  undatedUnreceivedCount: number;
};

/**
 * ISO date (YYYY-MM-DD) of the last day of the month `addMonths` away from the
 * month containing `ref`. addMonths=0 → end of ref's own month. Built from
 * local Y/M parts (no UTC round-trip) so it can't drift across a timezone.
 */
export function endOfMonthISO(ref: Date, addMonths: number): string {
  const d = new Date(ref.getFullYear(), ref.getMonth() + addMonths + 1, 0);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Merge Bloom commitments with HubSpot deals into one list, dropping any
 * HubSpot deal already adopted into Bloom (its id present in `adoptedRefs`) so
 * it isn't counted from both sides. Keeping the runway over a list — not a
 * table — means swapping HubSpot out later is a change here, not in the math.
 */
export function assembleRunwayPledges(
  bloom: RunwayPledge[],
  hubspot: RunwayPledge[],
  adoptedRefs: Set<string> = new Set()
): RunwayPledge[] {
  const hs = hubspot.filter((p) => !(p.externalRef && adoptedRefs.has(p.externalRef)));
  return [...bloom, ...hs];
}

/**
 * Split a pledge list into due (≤ end of current month) and projected (after
 * this month, through `endHorizon`) sums. Received and restricted dropped;
 * undated counted for the nudge. ISO date strings sort lexicographically, so
 * plain string comparison is correct here.
 *
 * "Due" is committed money landing by month-end. Projected *pipeline*
 * (status "projected", already probability-weighted) is speculative, so it
 * never counts as due — it only ever lands in the projected tier, even when its
 * expected date is this month. Committed pledges (full value) are due when
 * dated by month-end, else projected.
 */
export function summarizePledges(
  pledges: RunwayPledge[],
  endCurrentMonth: string,
  endHorizon: string
): PledgeSums {
  let duePledges = 0;
  let projPledges = 0;
  let undatedUnreceivedCount = 0;

  for (const p of pledges) {
    if (p.status === "received") continue; // already in the bank balance
    if (p.restricted) continue; // can't cover general operating
    if (!p.expected_date) {
      undatedUnreceivedCount++;
      continue;
    }
    if (p.expected_date > endHorizon) continue; // beyond the horizon: not counted
    if (p.status !== "projected" && p.expected_date <= endCurrentMonth) {
      duePledges += p.amount; // committed money due by month-end
    } else {
      projPledges += p.amount; // later commitments + all weighted pipeline
    }
  }

  return { duePledges, projPledges, undatedUnreceivedCount };
}

export type RunwayTier = {
  /** Months of runway beyond the current month. null when baseline ≤ 0. */
  months: number | null;
  /** Dollar numerator this tier divides by the baseline (for display). */
  base: number;
};

export type RunwayInputs = {
  baseline: number;
  /** "config" = Shannon's set baseline; "trailing" = fell back to 3-mo burn. */
  baselineSource: "config" | "trailing";
  bankBalance: number;
  mtdSpend: number;
  remainingThisMonth: number;
  afterMonth: number;
  duePledges: number;
  projPledges: number;
  horizonMonths: number;
};

export type Runway = {
  cash: RunwayTier;
  due: RunwayTier;
  projected: RunwayTier;
  inputs: RunwayInputs;
};

export type ComputeRunwayArgs = {
  /** Effective monthly burn — config baseline when set, else trailing burn. */
  baseline: number;
  baselineSource?: "config" | "trailing";
  bankBalance: number;
  mtdSpend: number;
  duePledges: number;
  projPledges: number;
  horizonMonths: number;
};

/**
 * The three tiers from the resolved inputs. Caller resolves the baseline
 * fallback and the pledge sums; this stays a pure transform.
 */
export function computeRunway(args: ComputeRunwayArgs): Runway {
  const {
    baseline,
    bankBalance,
    mtdSpend,
    duePledges,
    projPledges,
    horizonMonths,
    baselineSource = "config",
  } = args;

  const remainingThisMonth = Math.max(0, baseline - mtdSpend); // step 3
  const afterMonth = bankBalance - remainingThisMonth; // step 4

  // D1: "months beyond now" — no +1. Clamp at 0 so an underwater month reads 0,
  // never negative or NaN. months is null when there's no baseline to divide by.
  const tier = (base: number): RunwayTier => ({
    months: baseline > 0 ? Math.max(0, base / baseline) : null,
    base,
  });

  return {
    cash: tier(afterMonth), // step 5
    due: tier(afterMonth + duePledges), // step 7
    projected: tier(afterMonth + duePledges + projPledges), // step 9
    inputs: {
      baseline,
      baselineSource,
      bankBalance,
      mtdSpend,
      remainingThisMonth,
      afterMonth,
      duePledges,
      projPledges,
      horizonMonths,
    },
  };
}
