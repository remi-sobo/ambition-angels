import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Phase 3 guarantees that live in code rather than in the database
 * (specs/fundraising-gift-tables.md, Phase 3).
 *
 * The database already enforces the hard half — partial unique indexes for
 * household-first placement, org-match triggers, ON DELETE RESTRICT — and
 * that half is exercised against a real Postgres by scripts/test-rls.sh.
 * What those cannot check is whether the ROUTES honour the rules they are
 * supposed to, and whether the places the spec fences off stay fenced. These
 * are source-level assertions for exactly that, in the same shape as
 * tests/gift-table-fence.test.ts.
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PLACEMENTS = "app/api/admin/fundraising/gift-tables/[id]/placements/route.ts";
const CREDITS = "app/api/admin/fundraising/gift-tables/[id]/credits/route.ts";
const POOLS = "app/api/admin/fundraising/gift-tables/[id]/pools/route.ts";
const MERGE = "app/api/admin/constituents/merge/route.ts";

describe("placements honour the rules the schema cannot express", () => {
  const src = read(PLACEMENTS);

  test("do not contact blocks a new placement", () => {
    expect(src).toContain("do_not_contact");
    expect(src).toMatch(/do not contact/i);
  });

  test("household_id is never taken from the request body", () => {
    // The trigger derives it. A route that also sent it would be racing the
    // database for the one rule household-first placement depends on.
    expect(src).not.toMatch(/household_id:\s*(body|fields)/);
  });

  test("a unique violation is translated, not leaked as a 500", () => {
    expect(src).toContain("23505");
    expect(src).toContain("slotHolder");
  });

  test("removing a placement is soft, so the scores survive", () => {
    expect(src).toMatch(/update\(\{ status: "removed" \}\)/);
  });

  test("a linked placement's target is read-only", () => {
    expect(src).toContain("opportunity_id");
    expect(src).toMatch(/follows its ask/);
  });

  test("placing a bench row resolves a constituent without promoting it", () => {
    // Promote also opens an opportunity and flips the row to promoted.
    // Placing a name is not asking them for money.
    expect(src).toContain("resolveConstituent");
    expect(src).not.toContain("prospects/promote");
    expect(src).not.toContain('"promoted"');
  });
});

describe("attribution stays traceable", () => {
  const src = read(CREDITS);

  test("only the four real money sources can be credited", () => {
    expect(src).toContain('["gift", "pledge", "recurring_plan", "grant"]');
  });

  test("a duplicate attribution is refused with a sentence", () => {
    expect(src).toContain("23505");
    expect(src).toMatch(/already attributed/i);
  });

  test("crediting one source to two tables warns rather than silently double counts", () => {
    expect(src).toContain("also_credited_to");
  });

  test("a closed table's attribution is frozen", () => {
    expect(src).toMatch(/closed table's attribution is frozen/);
  });
});

describe("pools never read the stale rollup", () => {
  const src = read(POOLS);

  test("v_fr_rollups is never queried", () => {
    // Its open-ask filter is V1 five-stage math, so under the ten-stage
    // taxonomy it admits closed asks. Open work comes from `opportunities`
    // through the org's own stage config instead. The route's comment names
    // the view to explain why, so this checks for the QUERY, not the word.
    expect(src).not.toMatch(/from\(\s*["'`]v_fr_rollups/);
    expect(src).toMatch(/from\(\s*["'`]opportunities/);
  });

  test("stage meaning comes from config, not the static unions", () => {
    expect(src).toContain("stageRoles");
    expect(src).not.toContain("OPEN_STAGE_KEYS");
    expect(src).not.toContain("WON_STAGE_KEYS");
    expect(src).not.toContain("stage-sets");
  });
});

describe("the merge route no longer loses placements", () => {
  const src = read(MERGE);

  test("placements are handled before any other reassignment", () => {
    const placementAt = src.indexOf("fr_gift_table_placements");
    const childLoopAt = src.indexOf("for (const table of CHILD_TABLES)");
    expect(placementAt).toBeGreaterThan(-1);
    // The route has no transaction, so a failure here has to abort while
    // nothing has moved yet.
    expect(placementAt).toBeLessThan(childLoopAt);
  });

  test("a collision keeps the primary's placement and removes the duplicate's", () => {
    expect(src).toContain("markRemoved");
    expect(src).toMatch(/status: "removed"/);
  });

  test("the unique index is treated as the authority on collisions", () => {
    // household_id is re-derived by trigger on the very update that moves the
    // row, so a third household member's claim only shows up as a 23505.
    expect(src).toContain('error?.code === "23505"');
  });

  test("both outcomes are audited", () => {
    expect(src).toContain("fundraising.gift_table_placement.merged");
    expect(src).toContain("fundraising.gift_table_placement.merged_removed");
  });
});

describe("history can show what a value was, not only what it became", () => {
  test("getEntityHistory selects and returns before", () => {
    const src = read("lib/admin/history.ts");
    expect(src).toContain('"id, ts, action, actor_user_id, before, after"');
    expect(src).toContain("before: r.before");
  });

  test("the timeline renders a change as from-to", () => {
    const src = read("app/admin/_components/EntityHistory.tsx");
    expect(src).toContain("changeSummary(e.after, e.before)");
    expect(src).toContain("→");
  });
});
