import {
  comparablePriorPeriod,
  verdict,
  type CoverageBasis,
  type PoolCandidate,
  type PoolKey,
} from "@/lib/fundraising/gift-table";
import { placedNames, type GiftTableSpine } from "@/lib/fundraising/gift-table-server";

/**
 * The gift table as a workbook (specs/fundraising-gift-tables.md, Phase 5,
 * Open decision 10).
 *
 * A real four-sheet .xlsx rather than four CSVs, because the people who need
 * this file — a board member, a campaign counsel, a funder — open workbooks,
 * and "Start Here" is guidance text that is meaningless as a row of commas.
 *
 * Every number comes from the spine the screen renders. Nothing is recomputed
 * here. That is the entire point: this feature exists because exported
 * workbooks drifted from reality, and an export with its own credit arithmetic
 * would rebuild that bug in the one artifact that travels furthest from the
 * system that could correct it.
 *
 * Kept OUT of the route so it can be tested without a database: the route
 * loads and responds, this decides what the workbook says.
 */

const BASIS_MEANING: Record<CoverageBasis, string> = {
  window: "Every figure counts money landing inside the window above.",
  annual: "Every figure counts ONE YEAR. Multi-year totals are labelled separately.",
  full_term: "Every figure counts the WHOLE TERM of each commitment.",
};

const POOL_LABEL: Record<PoolKey, string> = {
  active_asks: "Open asks",
  pledged: "Pledged, not yet collected",
  renewals: "Gave before, no ask open",
  lapsed: "Lapsed",
  upgrades: "Upgrade candidates",
  bench: "Bench",
  recurring: "Recurring givers",
};

const MONEY = "#,##0";

/** One cell shape across all four sheets. Without it TypeScript infers a
 *  row's type from its first cell, and a header row makes every later row
 *  wrong. */
type Cell = {
  value?: string | number;
  type?: StringConstructor | NumberConstructor;
  format?: string;
  fontWeight?: "bold";
};

const bold = (value: string): Cell => ({ value, fontWeight: "bold" });
const text = (value: string | null | undefined): Cell => ({ value: value ?? "", type: String });
const num = (value: number | null | undefined): Cell =>
  value === null || value === undefined ? {} : { value, type: Number, format: MONEY };
const count = (value: number | null | undefined): Cell =>
  value === null || value === undefined ? {} : { value, type: Number };


export type WorkbookSheet = {
  sheet: string;
  columns: Array<{ width: number }>;
  data: Cell[][];
};

export function buildWorkbook(input: {
  spine: GiftTableSpine;
  pools: Record<PoolKey, PoolCandidate[]>;
  today: string;
}): WorkbookSheet[] {
  const { spine, pools, today } = input;
  const { table, slots, goal, shape, gaps: g } = spine;

  const verdictLine = verdict({ table, goal, shape, gaps: g });
  const prior = comparablePriorPeriod({ startsOn: table.startsOn, endsOn: table.endsOn });
  const names = placedNames(spine);

  // ── Start Here ───────────────────────────────────────────────────────────
  const startHere: Cell[][] = [
    [bold(table.name)],
    [text(`Gift table exported from BloomOS on ${today}.`)],
    [],
    [bold("Window"), text(`${table.startsOn} to ${table.endsOn}`)],
    [bold("Status"), text(table.status)],
    [bold("Coverage basis"), text(table.coverageBasis)],
    [text(""), text(BASIS_MEANING[table.coverageBasis])],
    [],
    [bold("Table goal"), num(goal)],
    [text(""), text(`Target ${table.target} multiplied by ${table.multiplier}.`)],
    [bold("Table shape"), num(shape)],
    [text(""), text("What the levels below actually add up to.")],
    [bold("Verdict"), text(verdictLine)],
    [],
    [bold("Slots unfilled"), count(g.unfilledSlots)],
    [bold("Names short overall"), count(g.overallShort)],
    [
      bold("Riskiest level"),
      text(g.riskiestLevel ? `${g.riskiestLevel.level.label} (${g.riskiestLevel.gap} short)` : "None"),
    ],
    [],
    [bold("How to read this workbook")],
    [text("Gift Table: the plan. One row per level, with names placed against it.")],
    [text("Inventory: the people. One row per placed name, with its warm path.")],
    [text("Pools: candidates NOT yet placed. A pool is a list, not a commitment.")],
    [],
    [text("A pool row counts toward nothing. Only a placed name fills a slot.")],
    [text(`Comparable prior period: ${prior.startsOn} to ${prior.endsOn}.`)],
  ];
  if (table.targetRationale) {
    startHere.push([], [bold("Why this target")], [text(table.targetRationale)]);
  }
  if (table.multiplierRationale) {
    startHere.push([], [bold("Why this multiplier")], [text(table.multiplierRationale)]);
  }

  // ── Gift Table ───────────────────────────────────────────────────────────
  const giftTable: Cell[][] = [
    [
      bold("Level"),
      bold("Value"),
      bold("Estimated"),
      bold("Gifts needed"),
      bold("Names needed"),
      bold("Names placed"),
      bold("Gap"),
      bold("Committed"),
      bold("Pledged"),
      bold("Asked"),
      bold("Committed value"),
      bold("Dollars at risk"),
      bold("Purpose"),
    ],
    ...slots.map((s) => [
      text(s.level.label),
      num(s.value),
      text(s.estimated ? "yes" : ""),
      count(s.level.giftsNeeded),
      count(s.needed),
      count(s.placed),
      count(s.gap),
      count(s.committed),
      count(s.pledged),
      count(s.asked),
      num(s.committedValue),
      num(s.dollarsAtRisk),
      text(s.level.purpose),
    ]),
    [
      bold("Total"),
      num(shape),
      text(""),
      count(slots.reduce((a, s) => a + s.level.giftsNeeded, 0)),
      count(slots.reduce((a, s) => a + s.needed, 0)),
      count(slots.reduce((a, s) => a + s.placed, 0)),
      count(g.unfilledSlots),
      count(slots.reduce((a, s) => a + s.committed, 0)),
      count(slots.reduce((a, s) => a + s.pledged, 0)),
      count(slots.reduce((a, s) => a + s.asked, 0)),
      num(slots.reduce((a, s) => a + s.committedValue, 0)),
      num(slots.reduce((a, s) => a + s.dollarsAtRisk, 0)),
      text(""),
    ],
  ];

  // ── Inventory ────────────────────────────────────────────────────────────
  const inventory: Cell[][] = [
    [
      bold("Level"),
      bold("Name"),
      bold("State"),
      bold("Target"),
      bold("Worth on basis"),
      bold("Capacity"),
      bold("Affinity"),
      bold("Connection"),
      bold("Readiness"),
      bold("Warm path"),
      bold("Next step"),
      bold("Due"),
      bold("Owner"),
      bold("Do not contact"),
    ],
    ...names.map((n) => [
      text(n.levelLabel),
      text(n.placement.displayName),
      text(n.state),
      num(n.placement.targetAmount),
      num(n.worth),
      count(n.placement.capacityScore),
      count(n.placement.affinityScore),
      count(n.placement.connectionScore),
      count(n.placement.readinessScore),
      text(n.placement.warmPath),
      text(n.placement.nextStep),
      text(n.placement.nextStepDue),
      text(n.placement.owner),
      // A donor who asked not to be contacted travels WITH that flag. A
      // workbook that dropped it is how someone gets called anyway.
      text(n.placement.doNotContact ? "DO NOT CONTACT" : ""),
    ]),
  ];

  // ── Pools ────────────────────────────────────────────────────────────────
  const poolRows: Cell[][] = [
    [bold("Pool"), bold("Name"), bold("Detail"), bold("Amount"), bold("Do not contact")],
  ];
  for (const key of Object.keys(POOL_LABEL) as PoolKey[]) {
    for (const c of pools[key] ?? []) {
      poolRows.push([
        text(POOL_LABEL[key]),
        text(c.label),
        text(c.detail),
        num(c.amount),
        text(c.doNotContact ? "DO NOT CONTACT" : ""),
      ]);
    }
  }
  if (poolRows.length === 1) {
    poolRows.push([text("No candidates found."), text(""), text(""), num(null), text("")]);
  }

  return [
    { sheet: "Start Here", columns: [{ width: 26 }, { width: 80 }], data: startHere },
    {
      sheet: "Gift Table",
      columns: [
        { width: 10 }, { width: 14 }, { width: 11 }, { width: 13 }, { width: 14 },
        { width: 13 }, { width: 8 }, { width: 11 }, { width: 10 }, { width: 9 },
        { width: 16 }, { width: 15 }, { width: 40 },
      ],
      data: giftTable,
    },
    {
      sheet: "Inventory",
      columns: [
        { width: 10 }, { width: 30 }, { width: 13 }, { width: 14 }, { width: 16 },
        { width: 10 }, { width: 9 }, { width: 12 }, { width: 11 }, { width: 40 },
        { width: 40 }, { width: 12 }, { width: 16 }, { width: 18 },
      ],
      data: inventory,
    },
    {
      sheet: "Pools",
      columns: [{ width: 26 }, { width: 30 }, { width: 44 }, { width: 14 }, { width: 18 }],
      data: poolRows,
    },
  ];
}
