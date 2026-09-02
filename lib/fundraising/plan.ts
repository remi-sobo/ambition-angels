// The Fundraising Plan's domain logic (specs/fundraising-plan.md). Pure
// functions over rows the pages fetch, so the plan's arithmetic is testable
// and the rollup semantics live in exactly one place. Stage semantics come
// from lib/fundraising/stage-sets.ts — never a parallel definition — so the
// plan's "committed" can't drift from the pipeline board's.

import { isOpenStage, isWonStage } from "@/lib/fundraising/stage-sets";

// ── Trust labels ────────────────────────────────────────────────────────────
// Every rolled-up figure on a plan surface carries its provenance. The scale
// (from the hub build this module ports): verified = recorded money, stated =
// a human or funder recorded the commitment, estimated = open pipeline that
// may not land, placeholder = a goal with nothing underneath it.
export type TrustLevel = "verified" | "stated" | "estimated" | "placeholder";

export const TRUST_LABELS: Record<TrustLevel, string> = {
  verified: "Verified",
  stated: "Stated",
  estimated: "Estimated",
  placeholder: "Placeholder",
};

export const TRUST_HINTS: Record<TrustLevel, string> = {
  verified: "Recorded money — gifts on the spine.",
  stated: "A recorded commitment — a won ask, an awarded grant, or a pledge schedule. Not yet (all) received.",
  estimated: "Open pipeline — asks that may not land.",
  placeholder: "A target with nothing recorded underneath it yet.",
};

// ── Strategy rollup ─────────────────────────────────────────────────────────

export type PlanOppRow = {
  id: string;
  stage: string;
  ask_amount: number | null;
  expected_close: string | null;
};

export type PlanGrantRow = {
  id: string;
  stage: string;
  amount_requested: number | null;
  amount_awarded: number | null;
};

export type PlanGiftRow = {
  amount: number;
  gift_date: string;
};

/** Grant stages that count as committed money: the funder said yes. */
const COMMITTED_GRANT_STAGES = ["awarded", "active", "closed"];
/** Grant stages still in pursuit — the strategy's open pipeline. */
const OPEN_GRANT_STAGES = ["prospect", "qualified", "loi", "proposal", "submitted"];

/** An opportunity belongs to a plan year by its expected close; undated rows
 *  stay visible in every year (same rule as lib/fundraising/pipeline-year.ts). */
const oppInYear = (o: PlanOppRow, year: number): boolean =>
  !o.expected_close || o.expected_close.slice(0, 4) === String(year);

export type StrategyRollup = {
  /** Σ won linked opportunities in the plan year (trust: stated). */
  wonOpps: number;
  wonOppCount: number;
  /** Σ amount_awarded on awarded/active/closed linked grants (trust: stated). */
  awardedGrants: number;
  awardedGrantCount: number;
  /** Σ gifts dated in the plan year on linked campaigns (trust: verified). */
  campaignGifts: number;
  campaignGiftCount: number;
  /** The three lanes summed. The lanes stay visible on the card so an org
   *  that links both a campaign and the opps behind it sees the overlap. */
  committed: number;
  /** Σ ask on open linked opportunities + Σ requested on in-pursuit linked
   *  grants (trust: estimated). */
  openPipeline: number;
  openCount: number;
  gap: number;
};

export function rollupStrategy(opts: {
  goal: number;
  planYear: number;
  opps: PlanOppRow[];
  grants: PlanGrantRow[];
  campaignGifts: PlanGiftRow[];
}): StrategyRollup {
  const { goal, planYear, opps, grants, campaignGifts } = opts;

  const won = opps.filter((o) => isWonStage(o.stage) && oppInYear(o, planYear));
  const open = opps.filter((o) => isOpenStage(o.stage) && oppInYear(o, planYear));
  const committedGrants = grants.filter((g) => COMMITTED_GRANT_STAGES.includes(g.stage));
  const openGrants = grants.filter((g) => OPEN_GRANT_STAGES.includes(g.stage));
  const giftsInYear = campaignGifts.filter((g) => g.gift_date.slice(0, 4) === String(planYear));

  const wonOpps = won.reduce((s, o) => s + Number(o.ask_amount ?? 0), 0);
  const awardedGrants = committedGrants.reduce((s, g) => s + Number(g.amount_awarded ?? 0), 0);
  const giftTotal = giftsInYear.reduce((s, g) => s + Number(g.amount), 0);
  const committed = wonOpps + awardedGrants + giftTotal;

  const openPipeline =
    open.reduce((s, o) => s + Number(o.ask_amount ?? 0), 0) +
    openGrants.reduce((s, g) => s + Number(g.amount_requested ?? 0), 0);

  return {
    wonOpps,
    wonOppCount: won.length,
    awardedGrants,
    awardedGrantCount: committedGrants.length,
    campaignGifts: giftTotal,
    campaignGiftCount: giftsInYear.length,
    committed,
    openPipeline,
    openCount: open.length + openGrants.length,
    gap: Math.max(0, goal - committed),
  };
}

/** Plain-language "where it stands" for a strategy card. */
export function statusWord(r: { committed: number; openPipeline: number }, goal: number): string {
  if (goal <= 0) return "No goal set";
  if (r.committed >= goal) return "Funded";
  if (r.committed + r.openPipeline >= goal) return "In reach if the pipeline holds";
  if (r.committed > 0 || r.openPipeline > 0) return "Underway";
  return "Not started";
}

// ── The gift-range table ────────────────────────────────────────────────────

export type GiftLevel = { amount: number; count_needed: number };

/** Round UP to a "nice" ask figure (1 / 2.5 / 5 × a power of ten). */
function niceUp(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2.5, 5, 10]) {
    if (v <= m * mag) return m * mag;
  }
  return 10 * mag;
}

/** Round DOWN to a "nice" ask figure, so halving a level never bounces up. */
function niceDown(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [5, 2.5, 1]) {
    if (m * mag <= v) return m * mag;
  }
  return mag;
}

/**
 * The standard gift pyramid for a goal: the lead gift is ~20% of the goal,
 * each level below halves the amount and grows the count (1, 2, 4, 6, then
 * ×2), and the base stops once a level would fall under $250 or the table
 * covers the goal. The result always sums to ≥ goal (the base level's count
 * is topped up to close any remainder). This is a starting proposal a human
 * edits — never a commitment.
 */
export function generateGiftLevels(goal: number): GiftLevel[] {
  if (goal <= 0) return [];
  const levels: GiftLevel[] = [];
  let amount = Math.max(250, niceUp(goal * 0.2));
  const counts = [1, 2, 4, 6];
  let covered = 0;
  let i = 0;
  while (covered < goal && amount >= 250 && levels.length < 8) {
    const count = i < counts.length ? counts[i] : counts[counts.length - 1] * 2 ** (i - counts.length + 1);
    levels.push({ amount, count_needed: count });
    covered += amount * count;
    amount = niceDown(amount / 2);
    i += 1;
  }
  // Top up the base level so the table always covers the goal.
  if (covered < goal && levels.length > 0) {
    const base = levels[levels.length - 1];
    base.count_needed += Math.ceil((goal - covered) / base.amount);
  }
  return levels;
}

export type LevelMatch = GiftLevel & {
  /** Open linked opportunities whose ask lands at this level. */
  identified: number;
  /** Won linked opportunities at this level (plan year). */
  committed: number;
};

/**
 * Match real opportunities onto the gift table: each opp is assigned to the
 * highest level its ask reaches (an $8k ask counts toward the $5k level of a
 * 10/5/2.5k table; asks under the base level fall off the table). Levels are
 * returned largest-first, the display order of a gift-range table.
 */
export function matchGiftLevels(
  levels: GiftLevel[],
  opps: PlanOppRow[],
  planYear: number
): LevelMatch[] {
  const sorted = [...levels].sort((a, b) => b.amount - a.amount);
  const out: LevelMatch[] = sorted.map((l) => ({ ...l, identified: 0, committed: 0 }));
  for (const o of opps) {
    if (!oppInYear(o, planYear)) continue;
    const ask = Number(o.ask_amount ?? 0);
    if (ask <= 0) continue;
    const level = out.find((l) => ask >= l.amount);
    if (!level) continue;
    if (isWonStage(o.stage)) level.committed += 1;
    else if (isOpenStage(o.stage)) level.identified += 1;
  }
  return out;
}

// ── The ask calendar ────────────────────────────────────────────────────────
// Every scheduled ask moment in one stream: opportunity expected closes,
// open grant-requirement deadlines, and unpaid pledge installments. Callers
// fetch the rows (already filtered to open statuses at read time — never a
// snapshot) and this merges, windows, and sorts them.

export type AskMomentKind = "opportunity_close" | "grant_requirement" | "pledge_installment";

export type AskMoment = {
  kind: AskMomentKind;
  date: string; // ISO yyyy-mm-dd
  label: string;
  detail: string;
  amount: number | null;
  href: string;
};

export function upcomingAskMoments(
  moments: AskMoment[],
  opts: { from: string; days: number }
): AskMoment[] {
  const start = opts.from;
  const end = addDaysISO(opts.from, opts.days);
  return moments
    .filter((m) => m.date >= start && m.date <= end)
    .sort((a, b) => (a.date === b.date ? a.label.localeCompare(b.label) : a.date < b.date ? -1 : 1));
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Group ask moments by calendar month for the plan's 90-day calendar. */
export function groupByMonth(moments: AskMoment[]): { month: string; items: AskMoment[] }[] {
  const out: { month: string; items: AskMoment[] }[] = [];
  for (const m of moments) {
    const month = m.date.slice(0, 7);
    const bucket = out.find((b) => b.month === month);
    if (bucket) bucket.items.push(m);
    else out.push({ month, items: [m] });
  }
  return out;
}
