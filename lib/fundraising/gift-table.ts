/**
 * Gift tables — the domain logic (specs/fundraising-gift-tables.md, v3).
 *
 * PURE. No Supabase import, no `server-only`, no Date.now(). Callers fetch
 * rows and pass `today` in, so every number here is testable against the
 * three fixture workbooks in tests/fixtures/gift-tables/ and renders the same
 * on the server and in a client component.
 *
 * The two ideas that keep this honest:
 *
 *   1. NOTHING derived is stored. Table goal, table shape, credited value,
 *      names per level, gaps, work groups and the verdict are computed here
 *      every read. A stored derivation is a number that goes stale, and a
 *      gift table that disagrees with the spine is the thing this replaces.
 *
 *   2. A level's amount is NATIVE to its cadence — $25,000 one-time,
 *      $25,000 a year, $500 a month — and what it's worth depends on the
 *      table's coverage basis. The same row is $25,000 on an annual table and
 *      $75,000 on a full-term one. Both are true. They are never merged, and
 *      the native amount is always visible.
 *
 * Stage semantics come from per-org config (`pipeline_stages`), never from
 * lib/fundraising/stage-sets.ts: those static unions hardcode AA's taxonomy,
 * and a gift table has to be right for a tenant that renamed its stages.
 */

// ── Vocabulary ──────────────────────────────────────────────────────────────

export type CoverageBasis = "window" | "annual" | "full_term";
export type Cadence = "one_time" | "annual" | "monthly";
export type TableStatus = "draft" | "active" | "closed" | "archived";

/** What a placement's own `status` column can say when it has no ask yet. */
export type ManualStatus = "prospect" | "cultivating" | "ready" | "declined" | "removed";

/** What a stage MEANS here, from `stage_type` + `counts_as_pledged`. */
export type StageRole = "open" | "pledged" | "won" | "lost" | "on_hold";

/** A placement's effective state: manual when unlinked, derived when linked. */
export type PlacementState =
  | ManualStatus
  | "committed"
  | "pledged"
  | "asked"
  | "on_hold";

/** Recurring-plan frequency, normalized. `frequency` is free text in the
 *  database with no check constraint, so anything can be in there. */
export type Frequency = "monthly" | "quarterly" | "annual" | "unknown";

export type DateWindow = { startsOn: string; endsOn: string };

export type GiftTable = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: TableStatus;
  target: number;
  multiplier: number;
  /** Round the goal to this multiple. EPA uses 1000; AA and SafeSpace null. */
  goalRoundTo: number | null;
  coverageBasis: CoverageBasis;
  defaultTermYears: number;
  monthlyModeledYears: number;
};

export type GiftLevel = {
  id: string;
  label: string;
  /** Native to the cadence. Never pre-annualized. */
  amount: number;
  cadence: Cadence;
  termYears: number | null;
  giftsNeeded: number;
  prospectsPerGift: number;
  purpose?: string | null;
  sort: number;
};

/** The opportunity a placement is linked to, when it has one. */
export type LinkedOpportunity = {
  id: string;
  stage: string;
  askAmount: number | null;
  expectedClose: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
  owner: string | null;
};

export type Placement = {
  id: string;
  levelId: string;
  constituentId: string;
  householdId: string | null;
  /** Household salutation when the donor is householded, else their name. */
  displayName: string;
  targetAmount: number | null;
  cadence: Cadence | null;
  termYears: number | null;
  capacityScore: number | null;
  affinityScore: number | null;
  connectionScore: number | null;
  readinessScore: number | null;
  warmPath: string | null;
  status: ManualStatus;
  nextStep: string | null;
  nextStepDue: string | null;
  owner: string | null;
  /** Current DNC flag on the constituent, read at load time. */
  doNotContact: boolean;
  opportunity?: LinkedOpportunity | null;
};

// ── Small numeric and date helpers ──────────────────────────────────────────

/** Money rounds to cents. `350000 * 1.2` is 419999.99999999994 in IEEE 754;
 *  a gift table that renders $419,999.99 has lost the argument before it
 *  starts. */
const money = (v: number): number => Math.round(v * 100) / 100;

const isoParts = (iso: string): [number, number, number] => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
};

const isoOf = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Add whole months, clamping the day (Jan 31 + 1 month = Feb 28). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = isoParts(iso);
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return isoOf(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addYearsISO(iso: string, years: number): string {
  return addMonthsISO(iso, years * 12);
}

/** Whole days between two ISO dates (b − a), calendar-exact and TZ-free. */
export function daysBetweenISO(a: string, b: string): number {
  const [ay, am, ad] = isoParts(a);
  const [by, bm, bd] = isoParts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

const inWindow = (iso: string | null, w: DateWindow): boolean =>
  !!iso && iso.slice(0, 10) >= w.startsOn && iso.slice(0, 10) <= w.endsOn;

/**
 * How many monthly charges a monthly commitment produces inside a window.
 *
 * `recurring_plans` stores no start date, and a level is a plan that doesn't
 * exist yet, so there is no real charge day to anchor on. The convention:
 * charges fall on the window's own start day-of-month, beginning on
 * `startsOn`, for as long as the date is still inside the window. AA's
 * Sept 14 to Dec 31 window therefore holds four charges (Sep 14, Oct 14,
 * Nov 14, Dec 14). Documented rather than clever, because a monthly total
 * nobody can reproduce by hand is a total nobody trusts.
 */
export function monthlyChargesInWindow(w: DateWindow): number {
  let n = 0;
  for (let i = 0; i < 1200; i++) {
    const at = addMonthsISO(w.startsOn, i);
    if (at > w.endsOn) break;
    n++;
  }
  return n;
}

/**
 * The comparable prior period: the same window, shifted back by its own
 * length in whole years (minimum one). AA's Sept-to-Dec window compares
 * against Sept-to-Dec a year earlier; EPA's fiscal year against the prior
 * one; SafeSpace's three years against the three before them.
 */
export function comparablePriorPeriod(w: DateWindow): DateWindow {
  const span = daysBetweenISO(w.startsOn, w.endsOn);
  const years = Math.max(1, Math.round(span / 365.25));
  return { startsOn: addYearsISO(w.startsOn, -years), endsOn: addYearsISO(w.endsOn, -years) };
}

// ── Frequency ───────────────────────────────────────────────────────────────

/**
 * `recurring_plans.frequency` is free text with no check constraint, written
 * by importers we don't control. An unrecognized value returns "unknown" and
 * credits NOTHING — it is never assumed to be monthly. A wrong number on a
 * gift table is worse than a missing one, because only the missing one gets
 * investigated.
 *
 * "weekly" is deliberately unknown: `pledges` allows it, but nobody has
 * decided whether a weekly plan annualizes at 52 or at 4×12, and inventing
 * that convention here would hide the question.
 */
export function normalizeFrequency(raw: string | null | undefined): Frequency {
  const v = (raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["monthly", "month", "mo", "permonth", "everymonth"].includes(v)) return "monthly";
  if (["quarterly", "quarter", "qtr", "perquarter"].includes(v)) return "quarterly";
  if (["annual", "annually", "yearly", "year", "yr", "peryear"].includes(v)) return "annual";
  return "unknown";
}

/** Charges a year, for a normalized frequency. Unknown gives 0 — see above. */
export function chargesPerYear(f: Frequency): number {
  return f === "monthly" ? 12 : f === "quarterly" ? 4 : f === "annual" ? 1 : 0;
}

// ── Goal, value, shape ──────────────────────────────────────────────────────

/**
 * Table goal = target × multiplier, rounded to `goalRoundTo` when set.
 *
 * This is NOT the table shape, and the UI never merges the two. The goal is
 * what the window must raise with slippage priced in; the shape is what the
 * levels add up to. Overshoot is normal — gifts arrive in sensible bands, not
 * in amounts that sum exactly to a target.
 */
export function tableGoal(t: Pick<GiftTable, "target" | "multiplier" | "goalRoundTo">): number {
  const raw = t.target * t.multiplier;
  if (!t.goalRoundTo || t.goalRoundTo <= 0) return money(raw);
  return Math.round(raw / t.goalRoundTo) * t.goalRoundTo;
}

export type ValuedItem = {
  amount: number;
  cadence: Cadence;
  termYears?: number | null;
};

export type ValueContext = Pick<
  GiftTable,
  "coverageBasis" | "defaultTermYears" | "monthlyModeledYears"
> & { window: DateWindow };

/**
 * What one gift at this amount is worth to THIS table, on THIS basis.
 *
 * | cadence   | window                  | annual        | full_term                   |
 * |-----------|-------------------------|---------------|-----------------------------|
 * | one_time  | amount                  | amount        | amount                      |
 * | annual    | the installment in view | amount        | amount × term_years         |
 * | monthly   | amount × charges in win | amount × 12   | amount × 12 × modeled_years |
 *
 * An annual commitment on a window table counts ONE installment: a window is
 * a slice of time, and a donor giving $25,000 a year for three years puts
 * $25,000 into a year-end push, not $75,000.
 */
export function creditedValue(item: ValuedItem, ctx: ValueContext): number {
  const term = item.termYears ?? ctx.defaultTermYears;
  if (item.cadence === "one_time") return money(item.amount);
  if (item.cadence === "annual") {
    if (ctx.coverageBasis === "full_term") return money(item.amount * term);
    return money(item.amount);
  }
  // monthly
  if (ctx.coverageBasis === "window") {
    return money(item.amount * monthlyChargesInWindow(ctx.window));
  }
  if (ctx.coverageBasis === "annual") return money(item.amount * 12);
  return money(item.amount * 12 * ctx.monthlyModeledYears);
}

/** True when the value shown carries modeling rather than a commitment —
 *  the UI's "estimated" badge. Monthly giving is never a pledge. */
export function isEstimated(item: ValuedItem, ctx: ValueContext): boolean {
  return item.cadence === "monthly" && ctx.coverageBasis !== "window";
}

export const valueContext = (t: GiftTable): ValueContext => ({
  coverageBasis: t.coverageBasis,
  defaultTermYears: t.defaultTermYears,
  monthlyModeledYears: t.monthlyModeledYears,
  window: { startsOn: t.startsOn, endsOn: t.endsOn },
});

/** Σ over levels of (level value on the basis × gifts needed). */
export function tableShape(levels: GiftLevel[], t: GiftTable): number {
  const ctx = valueContext(t);
  return money(levels.reduce((s, l) => s + creditedValue(l, ctx) * l.giftsNeeded, 0));
}

/** The same shape counted over the whole term — the label multi-year tables
 *  show BESIDE the per-year number, never instead of it. */
export function tableShapeOverTerm(levels: GiftLevel[], t: GiftTable, years: number): number {
  return money(tableShape(levels, t) * years);
}

// ── Stage roles ─────────────────────────────────────────────────────────────

export type StageConfigRow = {
  key: string;
  stageType: "open" | "won" | "lost" | "on_hold";
  countsAsPledged?: boolean | null;
};

/**
 * Stage key → what it means, from the org's own config. All four
 * `stage_type` values are mapped EXPLICITLY: `on_hold` is neither open nor
 * lost (decision D2), and a gift table that quietly folded it into one of
 * them would either inflate the asked column or declare a parked donor dead.
 */
export function stageRoles(stages: StageConfigRow[]): Record<string, StageRole> {
  const out: Record<string, StageRole> = {};
  for (const s of stages) {
    out[s.key] =
      s.stageType === "won" ? "won"
      : s.stageType === "lost" ? "lost"
      : s.stageType === "on_hold" ? "on_hold"
      : s.countsAsPledged ? "pledged"
      : "open";
  }
  return out;
}

/** False when the org has no stage flagged `counts_as_pledged` — the table
 *  page says "no pledged stage configured" rather than showing an empty
 *  Collect card and letting someone conclude nothing is owed. */
export function hasPledgedStage(stages: StageConfigRow[]): boolean {
  return stages.some((s) => s.stageType === "open" && s.countsAsPledged === true);
}

/**
 * A placement's effective state. Unlinked, it's whatever a human typed.
 * Linked, it follows the opportunity's stage and the manual column stops
 * being displayed — one donor, one status, no second pipeline.
 */
export function placementState(p: Placement, roles: Record<string, StageRole>): PlacementState {
  if (!p.opportunity) return p.status;
  switch (roles[p.opportunity.stage]) {
    case "won": return "committed";
    case "pledged": return "pledged";
    case "lost": return "declined";
    case "on_hold": return "on_hold";
    case "open": return "asked";
    // A stage key with no config row (renamed or deleted under a live ask):
    // fall back to the manual column rather than guessing.
    default: return p.status;
  }
}

/** States that count as a name at a level. Removed and declined never do. */
const COUNTING_STATES = new Set<PlacementState>([
  "prospect", "cultivating", "ready", "committed", "pledged", "asked", "on_hold",
]);

export const countsAsName = (state: PlacementState): boolean => COUNTING_STATES.has(state);

/** A linked ask whose expected close has already passed still counts at its
 *  level — it is live work with a stale date, not a dead ask. Flagged, not
 *  dropped. */
export function hasStaleCloseDate(p: Placement, today: string): boolean {
  const close = p.opportunity?.expectedClose;
  return !!close && close < today;
}

/** The amount a placement is being worked for: the opportunity's ask once
 *  linked (read-only from then on), otherwise the typed target. */
export function placementTarget(p: Placement): number | null {
  if (p.opportunity) return p.opportunity.askAmount;
  return p.targetAmount;
}

/** The level a target lands at: the highest level it reaches. A user can
 *  override this; it is the default, not a rule. */
export function defaultLevelFor(levels: GiftLevel[], target: number, t: GiftTable): string | null {
  const ctx = valueContext(t);
  const ranked = [...levels].sort((a, b) => creditedValue(b, ctx) - creditedValue(a, ctx));
  const hit = ranked.find((l) => target >= creditedValue(l, ctx));
  return hit?.id ?? null;
}

// ── Slots and gaps ──────────────────────────────────────────────────────────

export type LevelSlot = {
  level: GiftLevel;
  /** Level value on the table's basis, per gift. */
  value: number;
  estimated: boolean;
  /** prospectsPerGift × giftsNeeded. */
  needed: number;
  /** Placements counting at this level. */
  placed: number;
  gap: number;
  committed: number;
  pledged: number;
  asked: number;
  /** Money traced to this level's placements, on the basis. */
  committedValue: number;
  pledgedValue: number;
  askedValue: number;
  /** (gap ÷ prospects per gift) × level value. */
  dollarsAtRisk: number;
};

/**
 * Per level: how many names are needed, how many are really there, and what
 * the shortfall is worth. Gap uses ONE convention — max(0, needed − placed) —
 * because the three source workbooks each used a different one (AA clamps at
 * zero, EPA computes it backwards, SafeSpace has no gap column at all).
 */
export function slotNames(
  levels: GiftLevel[],
  placements: Placement[],
  t: GiftTable,
  roles: Record<string, StageRole>
): LevelSlot[] {
  const ctx = valueContext(t);
  return [...levels]
    .sort((a, b) => a.sort - b.sort)
    .map((level) => {
      const value = creditedValue(level, ctx);
      const needed = level.prospectsPerGift * level.giftsNeeded;
      const mine = placements.filter((p) => p.levelId === level.id);

      let placed = 0, committed = 0, pledged = 0, asked = 0;
      let committedValue = 0, pledgedValue = 0, askedValue = 0;
      for (const p of mine) {
        const state = placementState(p, roles);
        if (!countsAsName(state)) continue;
        placed++;
        // A placement's own cadence/term override the level's when set.
        const worth = creditedValue(
          {
            amount: placementTarget(p) ?? level.amount,
            cadence: p.cadence ?? level.cadence,
            termYears: p.termYears ?? level.termYears,
          },
          ctx
        );
        if (state === "committed") { committed++; committedValue += worth; }
        else if (state === "pledged") { pledged++; pledgedValue += worth; }
        else if (state === "asked") { asked++; askedValue += worth; }
      }

      const gap = Math.max(0, needed - placed);
      return {
        level,
        value,
        estimated: isEstimated(level, ctx),
        needed,
        placed,
        gap,
        committed,
        pledged,
        asked,
        committedValue: money(committedValue),
        pledgedValue: money(pledgedValue),
        askedValue: money(askedValue),
        dollarsAtRisk: money((gap / level.prospectsPerGift) * value),
      };
    });
}

export type Gaps = {
  /** max(0, total needed − total placed). */
  overallShort: number;
  /** Σ per-level max(0, needed − placed). The verdict leads with THIS one,
   *  because a surplus at $100,000 does not fill a slot at $25,000. */
  unfilledSlots: number;
  riskiestLevel: LevelSlot | null;
};

export function gaps(slots: LevelSlot[]): Gaps {
  const totalNeeded = slots.reduce((s, x) => s + x.needed, 0);
  const totalPlaced = slots.reduce((s, x) => s + x.placed, 0);
  const unfilledSlots = slots.reduce((s, x) => s + x.gap, 0);

  // Most dollars at risk wins. Ties break to the larger level — SafeSpace's
  // levels 01 and 02 are both $450,000 at risk, and the $150,000/yr level is
  // the one that actually sinks the campaign.
  let riskiest: LevelSlot | null = null;
  for (const s of slots) {
    if (s.gap <= 0) continue;
    if (
      !riskiest ||
      s.dollarsAtRisk > riskiest.dollarsAtRisk ||
      (s.dollarsAtRisk === riskiest.dollarsAtRisk && s.value > riskiest.value)
    ) {
      riskiest = s;
    }
  }

  return {
    overallShort: Math.max(0, totalNeeded - totalPlaced),
    unfilledSlots,
    riskiestLevel: riskiest,
  };
}

// ── Money attribution ───────────────────────────────────────────────────────

export type CreditSourceType = "gift" | "pledge" | "recurring_plan" | "grant";

export type MoneyRow = {
  id: string;
  sourceType: CreditSourceType;
  constituentId: string | null;
  householdId?: string | null;
  amount: number;
  /** Gift date, pledge start, grant award date. */
  occurredOn: string;
  /** Campaign the money carries, if any. */
  campaignId?: string | null;
  frequency?: string | null;
};

export type CreditRow = { sourceType: CreditSourceType; sourceId: string };

/** ±7 days and an exact amount, on the same constituent — the same dedupe key
 *  `dedup_commitments_against_gifts.sql` already uses to stop a commitment and
 *  its gift being counted twice. Reused rather than reinvented so the two
 *  surfaces can't disagree about whether two rows are one thing. */
const MATCH_WINDOW_DAYS = 7;

export function sameMoney(a: MoneyRow, b: MoneyRow): boolean {
  if (!a.constituentId || a.constituentId !== b.constituentId) return false;
  if (money(a.amount) !== money(b.amount)) return false;
  return Math.abs(daysBetweenISO(a.occurredOn, b.occurredOn)) <= MATCH_WINDOW_DAYS;
}

export type PossibleMatch = { row: MoneyRow; reason: string };

/**
 * Money in the window from a placed household that is NOT traceable to this
 * table. It appears as a suggestion with an Attach action and fills nothing
 * until a human attaches it.
 *
 * Traceable means one of exactly three things: an opportunity linked to a
 * placement here, a campaign linked to this table, or an explicit credit row.
 * Everything else is a guess, and a gap that closes because software guessed
 * is a gap nobody went and worked.
 */
export function possibleMatches(input: {
  money: MoneyRow[];
  placements: Placement[];
  credits: CreditRow[];
  window: DateWindow;
  tableCampaignId?: string | null;
}): PossibleMatch[] {
  const credited = new Set(input.credits.map((c) => `${c.sourceType}:${c.sourceId}`));
  const placedConstituents = new Set(input.placements.map((p) => p.constituentId));
  const placedHouseholds = new Set(
    input.placements.map((p) => p.householdId).filter((h): h is string => !!h)
  );

  const out: PossibleMatch[] = [];
  for (const row of input.money) {
    if (!inWindow(row.occurredOn, input.window)) continue;
    if (credited.has(`${row.sourceType}:${row.id}`)) continue;
    if (input.tableCampaignId && row.campaignId === input.tableCampaignId) continue;
    const placed =
      (row.constituentId && placedConstituents.has(row.constituentId)) ||
      (row.householdId && placedHouseholds.has(row.householdId));
    if (!placed) continue;
    out.push({
      row,
      reason: "In the window, from a placed household, not traced to this table",
    });
  }
  return out.sort((a, b) => (a.row.occurredOn < b.row.occurredOn ? 1 : -1));
}

/**
 * A pledged opportunity and a `pledges` row for the same commitment are ONE
 * commitment. `PledgesSection` actively offers to create the second from the
 * first, so the pair is not hypothetical. Returns the rows to count plus the
 * overlaps to warn about — count once, show both.
 */
export function dedupeCommitments(rows: MoneyRow[]): {
  counted: MoneyRow[];
  overlaps: Array<{ kept: MoneyRow; duplicate: MoneyRow }>;
} {
  const counted: MoneyRow[] = [];
  const overlaps: Array<{ kept: MoneyRow; duplicate: MoneyRow }> = [];
  for (const row of rows) {
    const prior = counted.find((k) => sameMoney(k, row));
    if (prior) overlaps.push({ kept: prior, duplicate: row });
    else counted.push(row);
  }
  return { counted, overlaps };
}

// ── Candidate pools ─────────────────────────────────────────────────────────

export type PoolKey =
  | "active_asks" | "pledged" | "renewals" | "lapsed"
  | "upgrades" | "bench" | "recurring";

export type PoolCandidate = {
  constituentId: string | null;
  /** Bench rows that have no constituent yet — "create constituent to place". */
  benchId?: string | null;
  householdId: string | null;
  label: string;
  detail: string;
  amount: number | null;
  doNotContact: boolean;
  /** False for DNC rows and unlinked bench rows: shown, greyed, no action. */
  placeable: boolean;
  /** Sorts past-due money to the top of the Pledged pool. */
  pastDue?: boolean;
};

export type PoolInputs = {
  today: string;
  window: DateWindow;
  placements: Placement[];
  roles: Record<string, StageRole>;
  constituents: Array<{
    id: string;
    householdId: string | null;
    displayName: string;
    doNotContact: boolean;
  }>;
  opportunities: Array<{
    id: string;
    constituentId: string;
    stage: string;
    askAmount: number | null;
    expectedClose: string | null;
  }>;
  gifts: Array<{ constituentId: string | null; amount: number; giftDate: string }>;
  pledges: Array<{
    id: string;
    constituentId: string | null;
    totalAmount: number;
    status: string;
    unpaidDue: string | null;
  }>;
  recurring: Array<{
    id: string;
    constituentId: string | null;
    amount: number;
    frequency: string | null;
    status: string;
  }>;
  bench: Array<{ id: string; name: string; constituentId: string | null; status: string }>;
};

/**
 * The eight named trays under a level. NOTHING in a pool counts toward a
 * level until someone places it — a pool is a list of candidates, not a
 * claim, and the difference is the whole point of the gap column.
 *
 * "Search" is not here: it is an unfiltered query with nothing to classify.
 */
export function pools(input: PoolInputs): Record<PoolKey, PoolCandidate[]> {
  const placedConstituents = new Set(input.placements.map((p) => p.constituentId));
  const placedHouseholds = new Set(
    input.placements.map((p) => p.householdId).filter((h): h is string => !!h)
  );
  const byId = new Map(input.constituents.map((c) => [c.id, c]));

  const alreadyPlaced = (constituentId: string | null): boolean => {
    if (!constituentId) return false;
    if (placedConstituents.has(constituentId)) return true;
    const hh = byId.get(constituentId)?.householdId;
    return !!hh && placedHouseholds.has(hh);
  };

  const candidate = (
    constituentId: string,
    detail: string,
    amount: number | null,
    extra?: Partial<PoolCandidate>
  ): PoolCandidate | null => {
    const c = byId.get(constituentId);
    if (!c) return null;
    return {
      constituentId,
      householdId: c.householdId,
      label: c.displayName,
      detail,
      amount,
      doNotContact: c.doNotContact,
      placeable: !c.doNotContact,
      ...extra,
    };
  };

  const linkedOppIds = new Set(
    input.placements.map((p) => p.opportunity?.id).filter((v): v is string => !!v)
  );
  const openStages = new Set(
    Object.entries(input.roles)
      .filter(([, r]) => r === "open" || r === "pledged")
      .map(([k]) => k)
  );

  // Active asks: open work not already on this table.
  const active_asks = input.opportunities
    .filter((o) => openStages.has(o.stage) && !linkedOppIds.has(o.id) && !alreadyPlaced(o.constituentId))
    .map((o) =>
      candidate(
        o.constituentId,
        input.roles[o.stage] === "pledged" ? "Pledged ask" : "Open ask",
        o.askAmount
      )
    )
    .filter((x): x is PoolCandidate => !!x);

  // Pledged: committed-but-uncollected asks, plus live pledge schedules.
  const pledgedAsks = input.opportunities
    .filter((o) => input.roles[o.stage] === "pledged" && !alreadyPlaced(o.constituentId))
    .map((o) =>
      candidate(o.constituentId, "Pledged ask", o.askAmount, {
        pastDue: !!o.expectedClose && o.expectedClose < input.today,
      })
    );
  const pledgeRows = input.pledges
    .filter((p) => p.status === "active" && p.unpaidDue && !alreadyPlaced(p.constituentId))
    .map((p) =>
      p.constituentId
        ? candidate(p.constituentId, `Pledge, next installment ${p.unpaidDue}`, p.totalAmount, {
            pastDue: !!p.unpaidDue && p.unpaidDue < input.today,
          })
        : null
    );
  const pledged = [...pledgedAsks, ...pledgeRows]
    .filter((x): x is PoolCandidate => !!x)
    .sort((a, b) => Number(b.pastDue ?? false) - Number(a.pastDue ?? false));

  // Giving history, bucketed by period.
  const prior = comparablePriorPeriod(input.window);
  const gaveThisPeriod = new Set<string>();
  const gavePriorPeriod = new Set<string>();
  const gaveEverBefore = new Set<string>();
  const lastGiftBy = new Map<string, { amount: number; date: string }>();
  const amountYears = new Map<string, Map<number, number>>();
  for (const g of input.gifts) {
    if (!g.constituentId) continue;
    const d = g.giftDate.slice(0, 10);
    if (inWindow(d, input.window)) gaveThisPeriod.add(g.constituentId);
    else if (inWindow(d, prior)) gavePriorPeriod.add(g.constituentId);
    else if (d < prior.startsOn) gaveEverBefore.add(g.constituentId);
    const prev = lastGiftBy.get(g.constituentId);
    if (!prev || d > prev.date) lastGiftBy.set(g.constituentId, { amount: g.amount, date: d });
    const year = Number(d.slice(0, 4));
    const per = amountYears.get(g.constituentId) ?? new Map<number, number>();
    per.set(year, Math.max(per.get(year) ?? 0, g.amount));
    amountYears.set(g.constituentId, per);
  }
  const hasOpenAsk = new Set(
    input.opportunities.filter((o) => openStages.has(o.stage)).map((o) => o.constituentId)
  );

  const renewals: PoolCandidate[] = [];
  const lapsed: PoolCandidate[] = [];
  const everGave = new Set(Array.from(gavePriorPeriod).concat(Array.from(gaveEverBefore)));
  for (const id of Array.from(everGave)) {
    if (alreadyPlaced(id)) continue;
    const last = lastGiftBy.get(id);
    if (gavePriorPeriod.has(id)) {
      // Gave in the comparable prior period and nothing since — the cheapest
      // ask in the building, and the one nobody makes.
      if (gaveThisPeriod.has(id) || hasOpenAsk.has(id)) continue;
      const c = candidate(id, `Gave ${last?.date ?? "last period"}, nothing since`, last?.amount ?? null);
      if (c) renewals.push(c);
    } else if (!gaveThisPeriod.has(id) && !gavePriorPeriod.has(id) && !hasOpenAsk.has(id)) {
      const c = candidate(id, `Last gave ${last?.date ?? "—"}, no open ask`, last?.amount ?? null);
      if (c) lapsed.push(c);
    }
  }

  // Upgrades: the same amount two or three years running with nobody asking
  // for more. AA's $2,500 band is the case — three straight years at $2,500
  // and no one has ever asked for $5,000.
  const thisYear = Number(input.window.endsOn.slice(0, 4));
  const upgrades: PoolCandidate[] = [];
  for (const [id, years] of Array.from(amountYears.entries())) {
    if (alreadyPlaced(id) || hasOpenAsk.has(id)) continue;
    const recent = [thisYear, thisYear - 1, thisYear - 2]
      .map((y) => years.get(y))
      .filter((v): v is number => v !== undefined);
    if (recent.length < 2) continue;
    if (!recent.every((v) => money(v) === money(recent[0]))) continue;
    const c = candidate(
      id,
      `${recent.length} years at ${recent[0]} with no increase asked`,
      recent[0]
    );
    if (c) upgrades.push(c);
  }

  // Bench: fr_prospects. An unlinked row is shown but not placeable — it
  // needs a constituent first (resolveConstituent), which is a deliberate
  // write, not a side effect of clicking Place.
  const bench: PoolCandidate[] = input.bench
    .filter((b) => b.status === "active" && !alreadyPlaced(b.constituentId))
    .map((b) => {
      if (b.constituentId) {
        return candidate(b.constituentId, "On the prospect bench", null);
      }
      return {
        constituentId: null,
        benchId: b.id,
        householdId: null,
        label: b.name,
        detail: "Create constituent to place",
        amount: null,
        doNotContact: false,
        placeable: false,
      } satisfies PoolCandidate;
    })
    .filter((x): x is PoolCandidate => !!x);

  const recurring: PoolCandidate[] = input.recurring
    .filter((r) => r.status === "active" && !alreadyPlaced(r.constituentId))
    .map((r) => {
      if (!r.constituentId) return null;
      const f = normalizeFrequency(r.frequency);
      return candidate(
        r.constituentId,
        f === "unknown"
          ? `Recurring, frequency not recognized (${r.frequency ?? "blank"})`
          : `Recurring ${f}`,
        f === "unknown" ? null : r.amount
      );
    })
    .filter((x): x is PoolCandidate => !!x);

  return { active_asks, pledged, renewals, lapsed, upgrades, bench, recurring };
}

// ── Work the table ──────────────────────────────────────────────────────────

export type WorkItem = {
  key: string;
  label: string;
  detail: string;
  amount: number | null;
  dueOn: string | null;
  overdue: boolean;
};

export type FillItem = {
  levelId: string;
  label: string;
  gap: number;
  dollarsAtRisk: number;
};

export type WorkGroups = {
  collect: WorkItem[];
  move: WorkItem[];
  fill: FillItem[];
  renew: WorkItem[];
};

const COLLECT_HORIZON_DAYS = 14;
const MOVE_HORIZON_DAYS = 7;

/**
 * What to do Monday. Four groups, and a draft table produces none of them —
 * a table nobody has committed to must not put work in anyone's queue.
 *
 * A donor who has since gone do-not-contact drops out of Move and Renew and
 * keeps their money in the totals. Contact stopped; the gift didn't.
 */
export function workGroups(input: {
  table: GiftTable;
  slots: LevelSlot[];
  placements: Placement[];
  roles: Record<string, StageRole>;
  pledgeDue: Array<{ id: string; label: string; amount: number; dueOn: string }>;
  renewals: PoolCandidate[];
  today: string;
}): WorkGroups {
  if (input.table.status !== "active") return { collect: [], move: [], fill: [], renew: [] };

  const { today } = input;
  const collectCutoff = addDays(today, COLLECT_HORIZON_DAYS);
  const moveCutoff = addDays(today, MOVE_HORIZON_DAYS);

  const collect: WorkItem[] = input.pledgeDue
    .filter((p) => p.dueOn <= collectCutoff)
    .map((p) => ({
      key: `pledge:${p.id}`,
      label: p.label,
      detail: p.dueOn < today ? "Promised, past due" : "Promised, due soon",
      amount: p.amount,
      dueOn: p.dueOn,
      overdue: p.dueOn < today,
    }))
    .sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : 1));

  const move: WorkItem[] = [];
  const renew: WorkItem[] = [];
  for (const p of input.placements) {
    const state = placementState(p, input.roles);
    if (!countsAsName(state)) continue;
    // Money stays counted; contact stops. Both of these lists are contact.
    if (p.doNotContact) continue;
    if (state === "on_hold") continue;

    const due = p.nextStepDue ?? p.opportunity?.nextStepDue ?? null;
    const step = p.nextStep ?? p.opportunity?.nextStep ?? null;
    if (due && due <= moveCutoff) {
      move.push({
        key: `placement:${p.id}`,
        label: p.displayName,
        detail: step ?? "Next step due",
        amount: placementTarget(p),
        dueOn: due,
        overdue: due < today,
      });
    } else if (!step) {
      // Placed and forgotten: a name at a level with nothing scheduled is the
      // quietest way a gift table stops being true.
      renew.push({
        key: `placement:${p.id}`,
        label: p.displayName,
        detail: "Placed, no next step",
        amount: placementTarget(p),
        dueOn: null,
        overdue: false,
      });
    }
  }
  move.sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : 1));

  for (const r of input.renewals) {
    if (r.doNotContact) continue;
    renew.push({
      key: `renewal:${r.constituentId ?? r.benchId ?? r.label}`,
      label: r.label,
      detail: r.detail,
      amount: r.amount,
      dueOn: null,
      overdue: false,
    });
  }

  const fill: FillItem[] = input.slots
    .filter((s) => s.gap > 0)
    .sort((a, b) => b.dollarsAtRisk - a.dollarsAtRisk || b.value - a.value)
    .map((s) => ({
      levelId: s.level.id,
      label: s.level.label,
      gap: s.gap,
      dollarsAtRisk: s.dollarsAtRisk,
    }));

  return { collect, move, fill, renew };
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = isoParts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// ── The verdict ─────────────────────────────────────────────────────────────

/**
 * Gift-table money, to the dollar. The admin's general `money()` abbreviates
 * ($420k), which is right for a dashboard tile and wrong here: a gift table is
 * read against a workbook, and "$420k" can't be checked against "$420,000".
 * Exported so the verdict sentence and the table itself can't disagree.
 */
export function formatGiftMoney(v: number): string {
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

const usd = formatGiftMoney;

/**
 * One deterministic paragraph, no AI. It leads with unfilled slots rather
 * than the total, because the total is the number that makes a thin table
 * look finished: AA's covers its goal on paper and is 42 prospect slots
 * short of being real.
 */
export function verdict(input: {
  table: GiftTable;
  shape: number;
  goal: number;
  gaps: Gaps;
  /** Pledged money not yet credited to this table, for the last sentence. */
  uncreditedPledged?: { count: number; amount: number; pastDue: number } | null;
}): string {
  const { shape, goal, gaps: g } = input;
  const parts: string[] = [];

  parts.push(`${usd(shape)} on the table against a ${usd(goal)} goal.`);

  if (g.unfilledSlots === 0 && g.overallShort === 0) {
    parts.push("Every level is covered on names.");
  } else {
    parts.push(
      `${g.unfilledSlots} prospect slot${g.unfilledSlots === 1 ? "" : "s"} unfilled across levels, ` +
        `${g.overallShort} name${g.overallShort === 1 ? "" : "s"} short overall.`
    );
  }

  const r = g.riskiestLevel;
  if (r) {
    parts.push(
      `The ${usd(r.value)} level is the biggest risk: ${r.placed} of ${r.needed} names, ` +
        `${usd(r.dollarsAtRisk)} at risk.`
    );
  }

  const p = input.uncreditedPledged;
  if (p && p.count > 0) {
    parts.push(
      `${p.count} pledged ask${p.count === 1 ? "" : "s"} (${usd(p.amount)})` +
        (p.pastDue > 0 ? `, ${p.pastDue} past due` : "") +
        `, not yet attributed to this table.`
    );
  }

  return parts.join(" ");
}

// ── Suggestions ─────────────────────────────────────────────────────────────

export type Suggestion = { score: number; source: string } | null;

/**
 * Capacity from the largest gift on record, using the bands in the AA
 * workbook's Scoring Key. ALWAYS labeled with where it came from: EPA scores
 * capacity from a wealth estimate and AA from giving history, and a 5 that
 * doesn't say which it is will be believed by someone who shouldn't.
 *
 * A typed score always wins. This is a starting point, never an answer.
 */
export function suggestCapacity(largestGift: number | null): Suggestion {
  if (largestGift === null || largestGift <= 0) return null;
  const score =
    largestGift >= 50000 ? 5
    : largestGift >= 20000 ? 4
    : largestGift >= 5000 ? 3
    : largestGift >= 1000 ? 2
    : 1;
  return { score, source: `largest gift ${usd(largestGift)}` };
}

/** Affinity from how many separate years they have given: 3+ is a habit, 2 is
 *  a pattern, 1 is a data point. Raise it by hand if they've said why. */
export function suggestAffinity(distinctGivingYears: number): Suggestion {
  if (distinctGivingYears <= 0) return null;
  const score = distinctGivingYears >= 3 ? 5 : distinctGivingYears === 2 ? 4 : 3;
  return { score, source: `gave in ${distinctGivingYears} separate year${distinctGivingYears === 1 ? "" : "s"}` };
}

// ── Close ───────────────────────────────────────────────────────────────────

export type ClosedSnapshot = {
  closedOn: string;
  goal: number;
  shape: number;
  coverageBasis: CoverageBasis;
  overallShort: number;
  unfilledSlots: number;
  levels: Array<{
    levelId: string;
    label: string;
    value: number;
    giftsNeeded: number;
    needed: number;
    placed: number;
    gap: number;
    committed: number;
    pledged: number;
    asked: number;
    committedValue: number;
    /** Placed names that became committed money — the number a next table is
     *  built on, and the one nobody writes down. */
    conversion: number;
  }>;
};

/**
 * Plan vs actual, frozen at close. Stored ONCE in `closed_snapshot` so the
 * history survives later edits to the spine; the detail page notes when live
 * credits have since moved away from it rather than quietly re-deriving.
 */
export function closeSnapshot(input: {
  table: GiftTable;
  slots: LevelSlot[];
  goal: number;
  shape: number;
  gaps: Gaps;
  closedOn: string;
}): ClosedSnapshot {
  return {
    closedOn: input.closedOn,
    goal: input.goal,
    shape: input.shape,
    coverageBasis: input.table.coverageBasis,
    overallShort: input.gaps.overallShort,
    unfilledSlots: input.gaps.unfilledSlots,
    levels: input.slots.map((s) => ({
      levelId: s.level.id,
      label: s.level.label,
      value: s.value,
      giftsNeeded: s.level.giftsNeeded,
      needed: s.needed,
      placed: s.placed,
      gap: s.gap,
      committed: s.committed,
      pledged: s.pledged,
      asked: s.asked,
      committedValue: s.committedValue,
      conversion: s.placed > 0 ? Math.round((s.committed / s.placed) * 100) / 100 : 0,
    })),
  };
}
