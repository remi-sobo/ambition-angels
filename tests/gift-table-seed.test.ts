import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  gaps,
  slotNames,
  stageRoles,
  tableGoal,
  tableShape,
  type GiftLevel,
  type GiftTable,
} from "@/lib/fundraising/gift-table";

/**
 * AA's Year-End 2026 seed (specs/fundraising-gift-tables.md, Open decision 6).
 *
 * The seed is a `.MANUAL.sql` data file, so it is outside the migration chain
 * and nothing in CI would otherwise ever read it. That is exactly the problem:
 * a mistyped `gifts_needed` in a hand-run seed produces a table that looks
 * plausible and is quietly wrong about how much money is on it.
 *
 * So this parses the real SQL and runs the parsed levels through the SAME
 * domain functions the page uses, asserting the figures the Phase 0 findings
 * transcribed from AA's workbook. If the seed and the fixture ever disagree,
 * one of them is a typo and this says so.
 */

const SEED = "supabase/migrations/seed_aa_year_end_gift_table.MANUAL.sql";
const sql = readFileSync(join(__dirname, "..", SEED), "utf8");

/** The level rows, read out of the VALUES list in the seed. */
function parseLevels(): GiftLevel[] {
  const rows = Array.from(
    sql.matchAll(
      /\(v_org_id,\s*v_table_id,\s*'(\d+)',\s*(\d+),\s*'(\w+)',\s*(null|\d+),\s*(\d+),\s*(\d+),/g,
    ),
  );
  return rows.map((m) => ({
    id: `l${m[1]}`,
    label: m[1],
    amount: Number(m[2]),
    cadence: m[3] as GiftLevel["cadence"],
    termYears: m[4] === "null" ? null : Number(m[4]),
    giftsNeeded: Number(m[5]),
    prospectsPerGift: Number(m[6]),
    purpose: null,
    sort: Number(m[1]),
  }));
}

const levels = parseLevels();

const table: GiftTable = {
  id: "aa",
  name: "Year-End 2026",
  startsOn: "2026-09-14",
  endsOn: "2026-12-31",
  status: "draft",
  target: 350_000,
  multiplier: 1.2,
  goalRoundTo: null,
  coverageBasis: "window",
  defaultTermYears: 1,
  monthlyModeledYears: 1,
};

describe("the seed parses into nine levels", () => {
  test("all nine rows were read, so the assertions below mean something", () => {
    // A regex that silently matched nothing would make every total zero and
    // every comparison below vacuous.
    expect(levels).toHaveLength(9);
    expect(levels.map((l) => l.label)).toEqual([
      "01", "02", "03", "04", "05", "06", "07", "08", "09",
    ]);
  });
});

describe("the seeded table matches AA's workbook", () => {
  test("the header the seed writes is the header the fixture assumes", () => {
    expect(sql).toContain("date '2026-09-14'");
    expect(sql).toContain("date '2026-12-31'");
    expect(sql).toContain("'window'");
    expect(sql).toMatch(/\n\s*350000,/);
    expect(sql).toMatch(/\n\s*1\.2,/);
  });

  test("table goal is $420,000", () => {
    expect(tableGoal(table)).toBe(420_000);
  });

  test("table shape is $445,000, above the goal, which is normal", () => {
    expect(tableShape(levels, table)).toBe(445_000);
    expect(tableShape(levels, table)).toBeGreaterThan(tableGoal(table));
  });

  test("72 gifts across the nine levels", () => {
    expect(levels.reduce((s, l) => s + l.giftsNeeded, 0)).toBe(72);
  });

  test("143 prospects needed, on 4 / 3 / 1 ratios", () => {
    const slots = slotNames(levels, [], table, stageRoles([]));
    expect(slots.reduce((s, x) => s + x.needed, 0)).toBe(143);
    expect(levels.map((l) => l.prospectsPerGift)).toEqual([4, 4, 4, 4, 3, 3, 3, 3, 1]);
  });

  test("the level amounts are the workbook's", () => {
    expect(levels.map((l) => l.amount)).toEqual([
      100_000, 75_000, 50_000, 25_000, 10_000, 5_000, 2_500, 1_000, 200,
    ]);
    expect(levels.map((l) => l.giftsNeeded)).toEqual([1, 1, 2, 3, 4, 5, 4, 12, 40]);
  });

  test("with nothing placed the table is 143 names short", () => {
    const g = gaps(slotNames(levels, [], table, stageRoles([])));
    expect(g.overallShort).toBe(143);
    expect(g.unfilledSlots).toBe(143);
  });

  test("every level is one-time, so nothing is estimated", () => {
    // AA's window basis plus one-time cadence means no modelled monthly money
    // and therefore no "estimated" badge anywhere on this table.
    expect(levels.every((l) => l.cadence === "one_time")).toBe(true);
  });
});

describe("the seed is safe to hand to a human", () => {
  test("it resolves the org by slug, never a hardcoded uuid", () => {
    // A uuid literal would make it a no-op-or-worse against any other database.
    expect(sql).toContain("where slug = 'ambition-angels'");
    expect(sql).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/);
  });

  test("a second run skips rather than overwriting", () => {
    expect(sql).toContain("Skipping, so nothing a human edited is overwritten");
    expect(sql).not.toMatch(/\bon conflict\b[\s\S]*\bdo update\b/i);
  });

  test("it seeds a draft, so it cannot put work in anyone's queue unread", () => {
    expect(sql).toMatch(/'draft'/);
  });

  test("it places no names, because a placement needs a real constituent", () => {
    expect(sql).not.toContain("fr_gift_table_placements (");
    expect(sql).not.toMatch(/insert into public\.fr_gift_table_placements/);
  });

  test("it carries the MANUAL suffix, so it stays out of the migration chain", () => {
    // scripts/test-rls.sh and scripts/check-migration-ledger.ts both exclude
    // *.MANUAL.sql by repo convention. A data seed is not a migration.
    expect(SEED.endsWith(".MANUAL.sql")).toBe(true);
  });
});
