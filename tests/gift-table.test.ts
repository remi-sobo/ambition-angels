import { describe, expect, test } from "vitest";
import {
  addMonthsISO,
  chargesPerYear,
  closeSnapshot,
  comparablePriorPeriod,
  countsAsName,
  creditedValue,
  dedupeCommitments,
  defaultLevelFor,
  gaps,
  hasPledgedStage,
  hasStaleCloseDate,
  isEstimated,
  monthlyChargesInWindow,
  normalizeFrequency,
  placementState,
  placementTarget,
  pools,
  possibleMatches,
  slotNames,
  stageRoles,
  suggestAffinity,
  suggestCapacity,
  tableGoal,
  tableShape,
  tableShapeOverTerm,
  valueContext,
  verdict,
  workGroups,
  type GiftLevel,
  type GiftTable,
  type Placement,
  type StageConfigRow,
} from "@/lib/fundraising/gift-table";

/**
 * Gift tables — domain logic (specs/fundraising-gift-tables.md, v3).
 *
 * Three fixtures, transcribed from the consultant workbooks committed at
 * tests/fixtures/gift-tables/ (Open decision 9: numbers in the test, files as
 * provenance, no xlsx dependency). Every figure below was read out of the
 * workbook's own formulas during Phase 0 and is recorded in the spec's
 * "Fixture math" section.
 *
 * The three exist to pull in different directions:
 *   AA        an active push, one-time gifts, window basis, deep history
 *   EPA YL    household renewal, annual commitments AND monthly, rounded goal
 *   SafeSpace greenfield, three-year full-term basis, zero names, tie-break
 *
 * Deliberately NOT asserted: SafeSpace's "Gift level to target" column, which
 * mixes annual and three-year values. That ambiguity is the coverage-basis
 * failure mode living in the source document, and copying it would encode it.
 */

// ── Builders ────────────────────────────────────────────────────────────────

const table = (over: Partial<GiftTable>): GiftTable => ({
  id: "t1",
  name: "Table",
  startsOn: "2026-01-01",
  endsOn: "2026-12-31",
  status: "active",
  target: 0,
  multiplier: 1,
  goalRoundTo: null,
  coverageBasis: "window",
  defaultTermYears: 1,
  monthlyModeledYears: 1,
  ...over,
});

let levelSeq = 0;
const level = (over: Partial<GiftLevel> & Pick<GiftLevel, "amount" | "giftsNeeded" | "prospectsPerGift">): GiftLevel => ({
  id: `l${++levelSeq}`,
  label: over.label ?? String(over.amount),
  cadence: "one_time",
  termYears: null,
  purpose: null,
  sort: levelSeq,
  ...over,
});

let placementSeq = 0;
const placement = (over: Partial<Placement> & Pick<Placement, "levelId">): Placement => {
  const n = ++placementSeq;
  return {
    id: `p${n}`,
    constituentId: `c${n}`,
    householdId: null,
    displayName: `Donor ${n}`,
    targetAmount: null,
    cadence: null,
    termYears: null,
    capacityScore: null,
    affinityScore: null,
    connectionScore: null,
    readinessScore: null,
    warmPath: null,
    status: "prospect",
    nextStep: null,
    nextStepDue: null,
    owner: null,
    doNotContact: false,
    opportunity: null,
    ...over,
  };
};

/** N unremarkable placed names at a level — the "names we have today" column. */
const names = (levelId: string, n: number): Placement[] =>
  Array.from({ length: n }, () => placement({ levelId }));

/** The ten-stage taxonomy every tenant runs, with the pledged flag seeded. */
const STAGES: StageConfigRow[] = [
  { key: "identified", stageType: "open" },
  { key: "needs_appointment", stageType: "open" },
  { key: "ask_made", stageType: "open" },
  { key: "pledged", stageType: "open", countsAsPledged: true },
  { key: "closed_won", stageType: "won" },
  { key: "closed_lost", stageType: "lost" },
  { key: "on_hold", stageType: "on_hold" },
];
const ROLES = stageRoles(STAGES);

// ── Fixture 1: Ambition Angels, Year-End 2026 ───────────────────────────────

describe("fixture: Ambition Angels Year-End 2026 (window basis, one-time)", () => {
  const aa = table({
    name: "Year-End 2026",
    startsOn: "2026-09-14",
    endsOn: "2026-12-31",
    target: 350_000,
    multiplier: 1.2,
    goalRoundTo: null,
    coverageBasis: "window",
  });

  // Level amount × gifts needed × prospects per gift, straight off the
  // workbook's Gift Table sheet. 4 prospects per gift at levels 01-04,
  // 3 at 05-08, 1 at the $200 appeal base.
  const levels = [
    level({ label: "01", amount: 100_000, giftsNeeded: 1, prospectsPerGift: 4 }),
    level({ label: "02", amount: 75_000, giftsNeeded: 1, prospectsPerGift: 4 }),
    level({ label: "03", amount: 50_000, giftsNeeded: 2, prospectsPerGift: 4 }),
    level({ label: "04", amount: 25_000, giftsNeeded: 3, prospectsPerGift: 4 }),
    level({ label: "05", amount: 10_000, giftsNeeded: 4, prospectsPerGift: 3 }),
    level({ label: "06", amount: 5_000, giftsNeeded: 5, prospectsPerGift: 3 }),
    level({ label: "07", amount: 2_500, giftsNeeded: 4, prospectsPerGift: 3 }),
    level({ label: "08", amount: 1_000, giftsNeeded: 12, prospectsPerGift: 3 }),
    level({ label: "09", amount: 200, giftsNeeded: 40, prospectsPerGift: 1 }),
  ];

  // "Names we have today", per level, from the workbook.
  const placedPerLevel = [5, 1, 5, 5, 17, 14, 6, 19, 35];
  const placements = levels.flatMap((l, i) => names(l.id, placedPerLevel[i]));

  const slots = slotNames(levels, placements, aa, ROLES);
  const g = gaps(slots);

  test("table goal is $420,000 — target × multiplier, no rounding", () => {
    expect(tableGoal(aa)).toBe(420_000);
  });

  test("table shape is $445,000, and overshooting the goal is normal", () => {
    expect(tableShape(levels, aa)).toBe(445_000);
    expect(tableShape(levels, aa)).toBeGreaterThan(tableGoal(aa));
  });

  test("143 prospects needed against 107 names", () => {
    expect(slots.reduce((s, x) => s + x.needed, 0)).toBe(143);
    expect(slots.reduce((s, x) => s + x.placed, 0)).toBe(107);
  });

  test("per-level gaps are 0, 3, 3, 7, 0, 1, 6, 17, 5", () => {
    expect(slots.map((s) => s.gap)).toEqual([0, 3, 3, 7, 0, 1, 6, 17, 5]);
  });

  test("36 names short overall, 42 slots unfilled — surplus at $100k does not fill $25k", () => {
    expect(g.overallShort).toBe(36);
    expect(g.unfilledSlots).toBe(42);
    expect(g.unfilledSlots).toBeGreaterThan(g.overallShort);
  });

  test("the $75,000 level is riskiest at $56,250, ahead of $25k and $50k", () => {
    expect(g.riskiestLevel?.level.label).toBe("02");
    expect(g.riskiestLevel?.dollarsAtRisk).toBe(56_250);
    const byLabel = Object.fromEntries(slots.map((s) => [s.level.label, s.dollarsAtRisk]));
    expect(byLabel["04"]).toBe(43_750);
    expect(byLabel["03"]).toBe(37_500);
  });

  test("the verdict leads with unfilled slots, not the total", () => {
    const text = verdict({
      table: aa,
      shape: tableShape(levels, aa),
      goal: tableGoal(aa),
      gaps: g,
      uncreditedPledged: { count: 4, amount: 115_000, pastDue: 4 },
    });
    expect(text).toContain("$445,000 on the table against a $420,000 goal.");
    expect(text).toContain("42 prospect slots unfilled across levels, 36 names short overall.");
    expect(text).toContain("The $75,000 level is the biggest risk: 1 of 4 names");
    expect(text).toContain("4 pledged asks ($115,000), 4 past due, not yet attributed to this table.");
  });
});

// ── Fixture 2: EPA Young Life, FY2027 ───────────────────────────────────────

describe("fixture: EPA Young Life FY2027 (annual basis, rounded goal, monthly levels)", () => {
  const epa = table({
    name: "FY2027",
    startsOn: "2026-10-01",
    endsOn: "2027-09-30",
    target: 198_424,
    multiplier: 1.2,
    goalRoundTo: 1_000,
    coverageBasis: "annual",
    defaultTermYears: 3,
    monthlyModeledYears: 3,
  });

  // Levels 01-06 are three-year annual commitments. 07-10 are monthly
  // partners, stored NATIVE ($500 a month, not $6,000 a year) — the
  // workbook's per-year column is derived, not the source of truth.
  const committed = [
    level({ label: "01", amount: 50_000, cadence: "annual", termYears: 3, giftsNeeded: 1, prospectsPerGift: 4 }),
    level({ label: "02", amount: 25_000, cadence: "annual", termYears: 3, giftsNeeded: 2, prospectsPerGift: 4 }),
    level({ label: "03", amount: 10_000, cadence: "annual", termYears: 3, giftsNeeded: 5, prospectsPerGift: 4 }),
    level({ label: "04", amount: 5_000, cadence: "annual", termYears: 3, giftsNeeded: 10, prospectsPerGift: 3 }),
    level({ label: "05", amount: 2_500, cadence: "annual", termYears: 3, giftsNeeded: 4, prospectsPerGift: 3 }),
    level({ label: "06", amount: 1_000, cadence: "annual", termYears: 3, giftsNeeded: 6, prospectsPerGift: 3 }),
  ];
  const monthly = [
    level({ label: "07", amount: 500, cadence: "monthly", giftsNeeded: 1, prospectsPerGift: 3 }),
    level({ label: "08", amount: 250, cadence: "monthly", giftsNeeded: 2, prospectsPerGift: 3 }),
    level({ label: "09", amount: 100, cadence: "monthly", giftsNeeded: 5, prospectsPerGift: 3 }),
    level({ label: "10", amount: 50, cadence: "monthly", giftsNeeded: 7, prospectsPerGift: 3 }),
  ];
  const levels = [...committed, ...monthly];

  const placedPerLevel = [9, 9, 19, 17, 10, 10, 0, 0, 0, 0];
  const placements = levels.flatMap((l, i) => names(l.id, placedPerLevel[i]));
  const slots = slotNames(levels, placements, epa, ROLES);
  const g = gaps(slots);

  test("the goal rounds to thousands: $238,108.80 becomes $238,000", () => {
    expect(198_424 * 1.2).toBeCloseTo(238_108.8, 2);
    expect(tableGoal(epa)).toBe(238_000);
  });

  test("table shape is $238,200 per year", () => {
    expect(tableShape(levels, epa)).toBe(238_200);
  });

  test("levels 01-06 carry $216,000 a year and $648,000 over three", () => {
    expect(tableShape(committed, epa)).toBe(216_000);
    expect(tableShapeOverTerm(committed, epa, 3)).toBe(648_000);
  });

  test("the monthly levels carry $22,200 a year, and every one is estimated", () => {
    expect(tableShape(monthly, epa)).toBe(22_200);
    const ctx = valueContext(epa);
    expect(monthly.every((l) => isEstimated(l, ctx))).toBe(true);
    expect(committed.some((l) => isEstimated(l, ctx))).toBe(false);
  });

  test("shape × 3 and goal × 3 stay separate labels, never merged", () => {
    expect(tableShapeOverTerm(levels, epa, 3)).toBe(714_600);
    expect(tableGoal(epa) * 3).toBe(714_000);
  });

  test("137 needed, 74 names, 63 short overall, 69 slots unfilled", () => {
    expect(slots.reduce((s, x) => s + x.needed, 0)).toBe(137);
    expect(slots.reduce((s, x) => s + x.placed, 0)).toBe(74);
    expect(g.overallShort).toBe(63);
    expect(g.unfilledSlots).toBe(69);
  });

  test("level 04 is riskiest at $21,666.67, above the three-way $6,000 tie", () => {
    expect(g.riskiestLevel?.level.label).toBe("04");
    expect(g.riskiestLevel?.dollarsAtRisk).toBe(21_666.67);
    const byLabel = Object.fromEntries(slots.map((s) => [s.level.label, s.dollarsAtRisk]));
    expect([byLabel["07"], byLabel["08"], byLabel["09"]]).toEqual([6_000, 6_000, 6_000]);
  });

  test("a $500 monthly level credits $6,000 on the annual basis", () => {
    expect(creditedValue({ amount: 500, cadence: "monthly" }, valueContext(epa))).toBe(6_000);
  });
});

// ── Fixture 3: SafeSpace ────────────────────────────────────────────────────

describe("fixture: SafeSpace (full-term basis, greenfield, the tie-break)", () => {
  // The workbook states no window; FY27-FY29 is three years. Basis is
  // full_term with annual cadence, so the dates are never read by the math —
  // they exist so the table has a window at all.
  const ss = table({
    name: "SafeSpace three-year",
    startsOn: "2026-07-01",
    endsOn: "2029-06-30",
    target: 1_623_814,
    multiplier: 1.25,
    goalRoundTo: null,
    coverageBasis: "full_term",
    defaultTermYears: 3,
    monthlyModeledYears: 3,
  });

  const levels = [
    level({ label: "01", amount: 150_000, cadence: "annual", termYears: 3, giftsNeeded: 1, prospectsPerGift: 4 }),
    level({ label: "02", amount: 75_000, cadence: "annual", termYears: 3, giftsNeeded: 2, prospectsPerGift: 4 }),
    level({ label: "03", amount: 44_982, cadence: "annual", termYears: 3, giftsNeeded: 3, prospectsPerGift: 4 }),
    level({ label: "04", amount: 22_491, cadence: "annual", termYears: 3, giftsNeeded: 6, prospectsPerGift: 4 }),
    level({ label: "05", amount: 13_760, cadence: "annual", termYears: 3, giftsNeeded: 4, prospectsPerGift: 3 }),
    level({ label: "06", amount: 5_000, cadence: "annual", termYears: 3, giftsNeeded: 6, prospectsPerGift: 3 }),
    level({ label: "07", amount: 1_000, cadence: "annual", termYears: 3, giftsNeeded: 22, prospectsPerGift: 3 }),
  ];

  // Zero names placed. The inventory has 20 scored prospects and the Gift
  // Table's names column is empty — a name counts only when placed, and
  // SafeSpace is the fixture that proves the product agrees.
  const slots = slotNames(levels, [], ss, ROLES);
  const g = gaps(slots);

  test("the campaign goal is $2,029,767.50 — not rounded", () => {
    expect(tableGoal(ss)).toBe(2_029_767.5);
  });

  test("table shape is $2,030,796 over the full term, $676,932 a year", () => {
    expect(tableShape(levels, ss)).toBe(2_030_796);
    expect(tableShape(levels, table({ ...ss, coverageBasis: "annual" }))).toBe(676_932);
  });

  test("144 needed, 0 placed: a relationship problem, not a math problem", () => {
    expect(slots.reduce((s, x) => s + x.needed, 0)).toBe(144);
    expect(slots.reduce((s, x) => s + x.placed, 0)).toBe(0);
    expect(g.overallShort).toBe(144);
    expect(g.unfilledSlots).toBe(144);
  });

  test("levels 01 and 02 tie at $450,000 and the tie breaks to the larger level", () => {
    const byLabel = Object.fromEntries(slots.map((s) => [s.level.label, s.dollarsAtRisk]));
    expect(byLabel["01"]).toBe(450_000);
    expect(byLabel["02"]).toBe(450_000);
    expect(g.riskiestLevel?.level.label).toBe("01");
    expect(g.riskiestLevel?.value).toBe(450_000);
  });
});

// ── Rules: value, cadence, basis ────────────────────────────────────────────

describe("credited value across cadence × basis", () => {
  const win = { startsOn: "2026-09-14", endsOn: "2026-12-31" };
  const ctx = (basis: GiftTable["coverageBasis"]) =>
    valueContext(table({ ...win, coverageBasis: basis, defaultTermYears: 3, monthlyModeledYears: 3 }));

  test("a one-time amount is itself on every basis", () => {
    for (const b of ["window", "annual", "full_term"] as const) {
      expect(creditedValue({ amount: 25_000, cadence: "one_time" }, ctx(b))).toBe(25_000);
    }
  });

  test("$25,000/year on a 3-year term: $25,000 annual, $75,000 full term", () => {
    const item = { amount: 25_000, cadence: "annual" as const, termYears: 3 };
    expect(creditedValue(item, ctx("annual"))).toBe(25_000);
    expect(creditedValue(item, ctx("full_term"))).toBe(75_000);
    // A window is a slice of time: one installment lands in it, not three.
    expect(creditedValue(item, ctx("window"))).toBe(25_000);
  });

  test("a null term falls back to the table's default", () => {
    expect(creditedValue({ amount: 10_000, cadence: "annual", termYears: null }, ctx("full_term"))).toBe(30_000);
  });

  test("monthly: charges in window, ×12 annual, ×12×years full term", () => {
    const item = { amount: 500, cadence: "monthly" as const };
    // Sep 14, Oct 14, Nov 14, Dec 14 — four charges in AA's window.
    expect(creditedValue(item, ctx("window"))).toBe(2_000);
    expect(creditedValue(item, ctx("annual"))).toBe(6_000);
    expect(creditedValue(item, ctx("full_term"))).toBe(18_000);
  });

  test("monthly charges anchor on the window's start day, clamping short months", () => {
    expect(monthlyChargesInWindow({ startsOn: "2026-09-14", endsOn: "2026-12-31" })).toBe(4);
    expect(monthlyChargesInWindow({ startsOn: "2026-01-01", endsOn: "2026-12-31" })).toBe(12);
    expect(monthlyChargesInWindow({ startsOn: "2026-01-31", endsOn: "2026-03-01" })).toBe(2);
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
  });

  test("goal rounding is per table, and floating point never leaks into money", () => {
    expect(tableGoal({ target: 350_000, multiplier: 1.2, goalRoundTo: null })).toBe(420_000);
    expect(tableGoal({ target: 198_424, multiplier: 1.2, goalRoundTo: 1_000 })).toBe(238_000);
    expect(tableGoal({ target: 1_623_814, multiplier: 1.25, goalRoundTo: null })).toBe(2_029_767.5);
  });
});

// ── Rules: stage roles ──────────────────────────────────────────────────────

describe("stage roles come from tenant config, never from stage-sets", () => {
  test("all four stage_type values map explicitly", () => {
    expect(ROLES).toEqual({
      identified: "open",
      needs_appointment: "open",
      ask_made: "open",
      pledged: "pledged",
      closed_won: "won",
      closed_lost: "lost",
      on_hold: "on_hold",
    });
  });

  test("without the flag, a pledged stage is just another open ask", () => {
    const unseeded = stageRoles(STAGES.map((s) => ({ ...s, countsAsPledged: false })));
    expect(unseeded.pledged).toBe("open");
    expect(hasPledgedStage(STAGES)).toBe(true);
    expect(hasPledgedStage(STAGES.map((s) => ({ ...s, countsAsPledged: false })))).toBe(false);
  });

  test("a renamed stage key is honest about it rather than guessing", () => {
    const custom = stageRoles([
      { key: "committed_not_collected", stageType: "open", countsAsPledged: true },
      { key: "in_the_bank", stageType: "won" },
    ]);
    expect(custom.committed_not_collected).toBe("pledged");
    expect(custom.in_the_bank).toBe("won");
  });

  test("a linked placement takes its status from the stage", () => {
    const opp = (stage: string) => ({
      id: "o1", stage, askAmount: 25_000, expectedClose: null, nextStep: null, nextStepDue: null, owner: null,
    });
    const at = (stage: string) => placementState(placement({ levelId: "l", opportunity: opp(stage) }), ROLES);
    expect(at("closed_won")).toBe("committed");
    expect(at("pledged")).toBe("pledged");
    expect(at("ask_made")).toBe("asked");
    expect(at("closed_lost")).toBe("declined");
    expect(at("on_hold")).toBe("on_hold");
  });

  test("an unknown stage key falls back to the manual status, not a guess", () => {
    const p = placement({
      levelId: "l",
      status: "cultivating",
      opportunity: { id: "o", stage: "deleted_stage", askAmount: null, expectedClose: null, nextStep: null, nextStepDue: null, owner: null },
    });
    expect(placementState(p, ROLES)).toBe("cultivating");
  });

  test("removed and declined placements are not names; on hold still is", () => {
    expect(countsAsName("removed")).toBe(false);
    expect(countsAsName("declined")).toBe(false);
    expect(countsAsName("on_hold")).toBe(true);
    expect(countsAsName("prospect")).toBe(true);

    const l = level({ amount: 25_000, giftsNeeded: 1, prospectsPerGift: 4 });
    const t = table({ coverageBasis: "window" });
    const slots = slotNames(
      [l],
      [
        placement({ levelId: l.id }),
        placement({ levelId: l.id, status: "removed" }),
        placement({ levelId: l.id, status: "declined" }),
      ],
      t,
      ROLES
    );
    expect(slots[0].placed).toBe(1);
  });

  test("a linked target is the opportunity's ask, not the typed one", () => {
    const p = placement({
      levelId: "l",
      targetAmount: 10_000,
      opportunity: { id: "o", stage: "ask_made", askAmount: 25_000, expectedClose: null, nextStep: null, nextStepDue: null, owner: null },
    });
    expect(placementTarget(p)).toBe(25_000);
    expect(placementTarget(placement({ levelId: "l", targetAmount: 10_000 }))).toBe(10_000);
  });

  test("a stale close date is flagged, and the ask still counts at its level", () => {
    const l = level({ amount: 25_000, giftsNeeded: 1, prospectsPerGift: 4 });
    const p = placement({
      levelId: l.id,
      opportunity: { id: "o", stage: "ask_made", askAmount: 25_000, expectedClose: "2026-05-01", nextStep: null, nextStepDue: null, owner: null },
    });
    expect(hasStaleCloseDate(p, "2026-09-16")).toBe(true);
    expect(slotNames([l], [p], table({}), ROLES)[0].placed).toBe(1);
  });

  test("a target lands at the highest level it reaches", () => {
    const t = table({ coverageBasis: "window" });
    const ls = [
      level({ label: "big", amount: 50_000, giftsNeeded: 1, prospectsPerGift: 4 }),
      level({ label: "mid", amount: 10_000, giftsNeeded: 1, prospectsPerGift: 4 }),
      level({ label: "base", amount: 1_000, giftsNeeded: 1, prospectsPerGift: 3 }),
    ];
    expect(defaultLevelFor(ls, 20_000, t)).toBe(ls[1].id);
    expect(defaultLevelFor(ls, 50_000, t)).toBe(ls[0].id);
    expect(defaultLevelFor(ls, 500, t)).toBeNull();
  });
});

// ── Rules: frequency ────────────────────────────────────────────────────────

describe("recurring frequency is normalized, never assumed", () => {
  test("the shapes importers actually write are recognized", () => {
    for (const v of ["monthly", "MONTHLY", " Monthly ", "per_month", "mo"]) {
      expect(normalizeFrequency(v)).toBe("monthly");
    }
    expect(normalizeFrequency("quarterly")).toBe("quarterly");
    expect(normalizeFrequency("Annually")).toBe("annual");
    expect(normalizeFrequency("yearly")).toBe("annual");
  });

  test("anything else is unknown and credits nothing — never monthly", () => {
    for (const v of ["weekly", "every other tuesday", "", null, undefined]) {
      expect(normalizeFrequency(v)).toBe("unknown");
    }
    expect(chargesPerYear("unknown")).toBe(0);
    expect(chargesPerYear("monthly")).toBe(12);
  });

  test("an unrecognized frequency reaches the pool labeled, with no amount", () => {
    const p = pools({
      today: "2026-09-16",
      window: { startsOn: "2026-01-01", endsOn: "2026-12-31" },
      placements: [],
      roles: ROLES,
      constituents: [{ id: "c1", householdId: null, displayName: "Nathan Frank", doNotContact: false }],
      opportunities: [],
      gifts: [],
      pledges: [],
      recurring: [{ id: "r1", constituentId: "c1", amount: 50, frequency: "fortnightly", status: "active" }],
      bench: [],
    });
    expect(p.recurring[0].detail).toContain("frequency not recognized");
    expect(p.recurring[0].amount).toBeNull();
  });
});

// ── Rules: attribution ──────────────────────────────────────────────────────

describe("money fills a table only when it is traceable", () => {
  const win = { startsOn: "2026-09-14", endsOn: "2026-12-31" };
  const placed = placement({ levelId: "l1", constituentId: "maya", displayName: "Maya Chen" });
  const gift = {
    id: "g1", sourceType: "gift" as const, constituentId: "maya",
    amount: 25_000, occurredOn: "2026-09-08", campaignId: null,
  };
  const inWindowGift = { ...gift, occurredOn: "2026-10-08" };

  test("an in-window gift from a placed donor is a possible match, not a fill", () => {
    const m = possibleMatches({ money: [inWindowGift], placements: [placed], credits: [], window: win });
    expect(m).toHaveLength(1);
    expect(m[0].reason).toContain("not traced to this table");
  });

  test("attaching it (a credit row) takes it off the suggestion list", () => {
    const m = possibleMatches({
      money: [inWindowGift],
      placements: [placed],
      credits: [{ sourceType: "gift", sourceId: "g1" }],
      window: win,
    });
    expect(m).toHaveLength(0);
  });

  test("money on the table's own campaign is already traced", () => {
    const m = possibleMatches({
      money: [{ ...inWindowGift, campaignId: "camp1" }],
      placements: [placed],
      credits: [],
      window: win,
      tableCampaignId: "camp1",
    });
    expect(m).toHaveLength(0);
  });

  test("money from nobody on the table is not suggested at all", () => {
    const m = possibleMatches({
      money: [{ ...inWindowGift, constituentId: "stranger" }],
      placements: [placed],
      credits: [],
      window: win,
    });
    expect(m).toHaveLength(0);
  });

  test("money outside the window is not suggested", () => {
    const m = possibleMatches({ money: [gift], placements: [placed], credits: [], window: win });
    expect(m).toHaveLength(0);
  });

  test("a pledged ask and its pledges row are one commitment, counted once", () => {
    const { counted, overlaps } = dedupeCommitments([
      { id: "o1", sourceType: "pledge", constituentId: "coxe", amount: 25_000, occurredOn: "2026-07-31" },
      { id: "pl1", sourceType: "pledge", constituentId: "coxe", amount: 25_000, occurredOn: "2026-08-03" },
    ]);
    expect(counted).toHaveLength(1);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].duplicate.id).toBe("pl1");
  });

  test("the same donor's genuinely separate gifts both count", () => {
    const { counted, overlaps } = dedupeCommitments([
      { id: "a", sourceType: "gift", constituentId: "coxe", amount: 25_000, occurredOn: "2026-07-31" },
      { id: "b", sourceType: "gift", constituentId: "coxe", amount: 25_000, occurredOn: "2026-10-31" },
    ]);
    expect(counted).toHaveLength(2);
    expect(overlaps).toHaveLength(0);
  });
});

// ── Rules: pools ────────────────────────────────────────────────────────────

describe("candidate pools", () => {
  const base = {
    today: "2026-09-16",
    window: { startsOn: "2026-09-14", endsOn: "2026-12-31" },
    roles: ROLES,
    opportunities: [],
    gifts: [],
    pledges: [],
    recurring: [],
    bench: [],
  };

  test("a do-not-contact donor is shown, greyed, and not placeable", () => {
    const p = pools({
      ...base,
      placements: [],
      constituents: [{ id: "c1", householdId: null, displayName: "DNC Donor", doNotContact: true }],
      opportunities: [{ id: "o1", constituentId: "c1", stage: "ask_made", askAmount: 5_000, expectedClose: null }],
    });
    expect(p.active_asks).toHaveLength(1);
    expect(p.active_asks[0].doNotContact).toBe(true);
    expect(p.active_asks[0].placeable).toBe(false);
  });

  test("a bench row with no constituent says so instead of offering Place", () => {
    const p = pools({
      ...base,
      placements: [],
      constituents: [],
      bench: [{ id: "b1", name: "Curtis Feeny", constituentId: null, status: "active" }],
    });
    expect(p.bench[0].detail).toBe("Create constituent to place");
    expect(p.bench[0].placeable).toBe(false);
  });

  test("someone already placed never appears in a pool — nor does their household", () => {
    const placedSpouse = placement({
      levelId: "l1", constituentId: "tench", householdId: "coxe-hh", displayName: "Tench & Simone Coxe",
    });
    const p = pools({
      ...base,
      placements: [placedSpouse],
      constituents: [
        { id: "tench", householdId: "coxe-hh", displayName: "Tench Coxe", doNotContact: false },
        { id: "simone", householdId: "coxe-hh", displayName: "Simone Coxe", doNotContact: false },
      ],
      opportunities: [
        { id: "o1", constituentId: "tench", stage: "ask_made", askAmount: 25_000, expectedClose: null },
        { id: "o2", constituentId: "simone", stage: "ask_made", askAmount: 25_000, expectedClose: null },
      ],
    });
    expect(p.active_asks).toHaveLength(0);
  });

  test("past-due pledged money sorts to the top of the Pledged pool", () => {
    const p = pools({
      ...base,
      placements: [],
      constituents: [
        { id: "c1", householdId: null, displayName: "Future", doNotContact: false },
        { id: "c2", householdId: null, displayName: "Overdue", doNotContact: false },
      ],
      opportunities: [
        { id: "o1", constituentId: "c1", stage: "pledged", askAmount: 75_000, expectedClose: "2026-11-01" },
        { id: "o2", constituentId: "c2", stage: "pledged", askAmount: 50_000, expectedClose: "2026-06-01" },
      ],
    });
    expect(p.pledged.map((x) => x.label)).toEqual(["Overdue", "Future"]);
  });

  test("renewals are the prior comparable period with nothing since", () => {
    const p = pools({
      ...base,
      placements: [],
      constituents: [
        { id: "c1", householdId: null, displayName: "Gave last year", doNotContact: false },
        { id: "c2", householdId: null, displayName: "Gave this year too", doNotContact: false },
      ],
      gifts: [
        { constituentId: "c1", amount: 1_000, giftDate: "2025-12-15" },
        { constituentId: "c2", amount: 1_000, giftDate: "2025-12-15" },
        { constituentId: "c2", amount: 1_000, giftDate: "2026-10-01" },
      ],
    });
    expect(p.renewals.map((x) => x.label)).toEqual(["Gave last year"]);
  });

  test("the comparable prior period is the same window a year back", () => {
    expect(comparablePriorPeriod({ startsOn: "2026-09-14", endsOn: "2026-12-31" }))
      .toEqual({ startsOn: "2025-09-14", endsOn: "2025-12-31" });
    // A three-year campaign compares against the three years before it.
    expect(comparablePriorPeriod({ startsOn: "2026-07-01", endsOn: "2029-06-30" }))
      .toEqual({ startsOn: "2023-07-01", endsOn: "2026-06-30" });
  });

  test("an upgrade candidate gave the same amount two years running, unasked", () => {
    const p = pools({
      ...base,
      placements: [],
      constituents: [{ id: "lobdell", householdId: null, displayName: "Lobdell Anderson", doNotContact: false }],
      gifts: [
        { constituentId: "lobdell", amount: 2_500, giftDate: "2024-12-22" },
        { constituentId: "lobdell", amount: 2_500, giftDate: "2025-12-22" },
        { constituentId: "lobdell", amount: 2_500, giftDate: "2026-12-22" },
      ],
    });
    expect(p.upgrades).toHaveLength(1);
    expect(p.upgrades[0].detail).toContain("no increase asked");
  });
});

// ── Rules: work the table ───────────────────────────────────────────────────

describe("work the table", () => {
  const l = level({ amount: 25_000, giftsNeeded: 3, prospectsPerGift: 4 });
  const t = (status: GiftTable["status"]) => table({ status, coverageBasis: "window" });
  const today = "2026-09-16";

  const build = (over: { table: GiftTable; placements: Placement[]; renewals?: never[] }) => {
    const slots = slotNames([l], over.placements, over.table, ROLES);
    return workGroups({
      table: over.table,
      slots,
      placements: over.placements,
      roles: ROLES,
      pledgeDue: [{ id: "pl1", label: "Give Forward Foundation", amount: 75_000, dueOn: "2026-09-01" }],
      renewals: [],
      today,
    });
  };

  test("a draft table creates no work at all", () => {
    const w = build({ table: t("draft"), placements: [placement({ levelId: l.id })] });
    expect(w).toEqual({ collect: [], move: [], fill: [], renew: [] });
  });

  test("an active table collects promised money that is past due", () => {
    const w = build({ table: t("active"), placements: [] });
    expect(w.collect).toHaveLength(1);
    expect(w.collect[0].overdue).toBe(true);
    expect(w.collect[0].detail).toBe("Promised, past due");
  });

  test("Move is next steps due inside a week or already overdue", () => {
    const w = build({
      table: t("active"),
      placements: [
        placement({ levelId: l.id, displayName: "Due soon", nextStep: "Call", nextStepDue: "2026-09-18" }),
        placement({ levelId: l.id, displayName: "Overdue", nextStep: "Email", nextStepDue: "2026-09-01" }),
        placement({ levelId: l.id, displayName: "Later", nextStep: "Coffee", nextStepDue: "2026-12-01" }),
      ],
    });
    expect(w.move.map((m) => m.label)).toEqual(["Overdue", "Due soon"]);
    expect(w.move[0].overdue).toBe(true);
  });

  test("a placement with no next step at all lands in Renew", () => {
    const w = build({ table: t("active"), placements: [placement({ levelId: l.id, displayName: "Forgotten" })] });
    expect(w.renew.map((r) => r.label)).toEqual(["Forgotten"]);
  });

  test("a donor who turned do-not-contact leaves Move and Renew", () => {
    const w = build({
      table: t("active"),
      placements: [
        placement({ levelId: l.id, displayName: "Now DNC", doNotContact: true, nextStep: "Call", nextStepDue: "2026-09-01" }),
        placement({ levelId: l.id, displayName: "Also DNC", doNotContact: true }),
      ],
    });
    expect(w.move).toHaveLength(0);
    expect(w.renew).toHaveLength(0);
  });

  test("their money still counts — contact stopped, the gift didn't", () => {
    const committed = placement({
      levelId: l.id,
      doNotContact: true,
      opportunity: { id: "o", stage: "closed_won", askAmount: 25_000, expectedClose: null, nextStep: null, nextStepDue: null, owner: null },
    });
    const slots = slotNames([l], [committed], t("active"), ROLES);
    expect(slots[0].placed).toBe(1);
    expect(slots[0].committed).toBe(1);
    expect(slots[0].committedValue).toBe(25_000);
  });

  test("Fill is sorted by dollars at risk, worst level first", () => {
    const big = level({ label: "big", amount: 75_000, giftsNeeded: 1, prospectsPerGift: 4 });
    const small = level({ label: "small", amount: 1_000, giftsNeeded: 12, prospectsPerGift: 3 });
    const w = workGroups({
      table: t("active"),
      slots: slotNames([big, small], [], t("active"), ROLES),
      placements: [],
      roles: ROLES,
      pledgeDue: [],
      renewals: [],
      today,
    });
    expect(w.fill.map((f) => f.label)).toEqual(["big", "small"]);
  });
});

// ── Rules: suggestions and close ────────────────────────────────────────────

describe("suggestions are labeled with where they came from", () => {
  test("capacity comes from the largest gift, in the workbook's bands", () => {
    expect(suggestCapacity(200_000)).toEqual({ score: 5, source: "largest gift $200,000" });
    expect(suggestCapacity(25_000)?.score).toBe(4);
    expect(suggestCapacity(10_000)?.score).toBe(3);
    expect(suggestCapacity(2_500)?.score).toBe(2);
    expect(suggestCapacity(500)?.score).toBe(1);
  });

  test("no giving history means no suggestion, not a 1", () => {
    expect(suggestCapacity(null)).toBeNull();
    expect(suggestCapacity(0)).toBeNull();
    expect(suggestAffinity(0)).toBeNull();
  });

  test("affinity comes from how many separate years they gave", () => {
    expect(suggestAffinity(3)?.score).toBe(5);
    expect(suggestAffinity(2)?.score).toBe(4);
    expect(suggestAffinity(1)).toEqual({ score: 3, source: "gave in 1 separate year" });
  });
});

describe("closing stores plan vs actual", () => {
  test("the snapshot records conversion per level, not just the money", () => {
    const l = level({ label: "04", amount: 25_000, giftsNeeded: 3, prospectsPerGift: 4 });
    const t = table({ coverageBasis: "window", status: "active" });
    const won = {
      id: "o", stage: "closed_won", askAmount: 25_000, expectedClose: null,
      nextStep: null, nextStepDue: null, owner: null,
    };
    const placements = [
      placement({ levelId: l.id, opportunity: won }),
      placement({ levelId: l.id }),
      placement({ levelId: l.id }),
      placement({ levelId: l.id }),
    ];
    const slots = slotNames([l], placements, t, ROLES);
    const snap = closeSnapshot({
      table: t,
      slots,
      goal: tableGoal(t),
      shape: tableShape([l], t),
      gaps: gaps(slots),
      closedOn: "2027-01-02",
    });
    expect(snap.levels[0].placed).toBe(4);
    expect(snap.levels[0].committed).toBe(1);
    expect(snap.levels[0].conversion).toBe(0.25);
    expect(snap.coverageBasis).toBe("window");
    expect(snap.closedOn).toBe("2027-01-02");
  });
});
