import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as plan from "@/lib/fundraising/plan";

/**
 * Phase 4: work the table, wiring, and the v1 retirement
 * (specs/fundraising-gift-tables.md, Phase 4).
 *
 * Two kinds of guarantee here. The retirement half is a DELETION, and a
 * deletion that nothing asserts comes back — so these pin that the v1 gift
 * levels are gone from every layer at once. The wiring half is about where
 * work is allowed to come from, which no type can express.
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("the v1 gift-range table is retired, at every layer", () => {
  test("its API route is off disk", () => {
    expect(existsSync(join(ROOT, "app/api/admin/fundraising/plan/levels/route.ts"))).toBe(false);
  });

  test("its generator and matcher are gone from the plan module", () => {
    for (const gone of ["generateGiftLevels", "matchGiftLevels", "LevelMatch"]) {
      expect(Object.keys(plan), `${gone} must stay deleted`).not.toContain(gone);
    }
    // The strategy rollup and the ask calendar are NOT part of the retirement.
    for (const kept of ["rollupStrategy", "statusWord", "upcomingAskMoments", "groupByMonth"]) {
      expect(Object.keys(plan)).toContain(kept);
    }
  });

  test("no page or component still QUERIES fr_plan_gift_levels", () => {
    // The word survives in comments that record the retirement, which is the
    // point of them. What must be gone is the read.
    for (const f of [
      "app/admin/fundraising/plan/[id]/page.tsx",
      "app/admin/fundraising/plan/_components/PlanControls.tsx",
      "lib/fundraising/plan.ts",
    ]) {
      expect(read(f), f).not.toMatch(/from\(\s*["'`]fr_plan_gift_levels/);
    }
  });

  test("the drop migration checks for rows at drop time, not from a Phase 0 reading", () => {
    const sql = read("supabase/migrations/drop_fr_plan_gift_levels.sql");
    expect(sql).toContain("select count(*) from public.fr_plan_gift_levels");
    expect(sql).toMatch(/raise exception/i);
    // Idempotent: applying twice must not error.
    expect(sql).toContain("to_regclass('public.fr_plan_gift_levels') is null");
  });

  test("fr_plan_strategies survives, because the strategy links do", () => {
    const sql = read("supabase/migrations/drop_fr_plan_gift_levels.sql");
    expect(sql).not.toMatch(/drop table public\.fr_plan_strategies/);
    // Start ask writes plan_strategy_id, which is the reason to keep it.
    expect(read("app/api/admin/fundraising/gift-tables/[id]/placements/[pid]/start-ask/route.ts"))
      .toContain("planStrategyId");
  });
});

describe("every Bloom-opened ask goes through one create path", () => {
  const shared = "lib/fundraising/create-opportunity.ts";

  test("the shared path reads pipelines.is_default rather than a literal", () => {
    const src = read(shared);
    expect(src).toContain("isDefault");
    expect(src).toContain("firstOpenStageKey");
  });

  test("a blank expected close stays blank", () => {
    const src = read(shared);
    // Only set when supplied. A fabricated close date makes a forecast
    // nobody chose.
    expect(src).toContain("if (input.expectedClose) insert.expected_close");
  });

  test("all three callers use it, and none still hardcodes the pipeline", () => {
    for (const f of [
      "app/api/admin/opportunities/route.ts",
      "app/api/admin/fundraising/prospects/promote/route.ts",
      "app/api/admin/fundraising/gift-tables/[id]/placements/[pid]/start-ask/route.ts",
    ]) {
      const src = read(f);
      expect(src, f).toContain("createOpportunity");
      expect(src, f).not.toMatch(/pipeline:\s*"default"/);
    }
  });

  test("HubSpot mirroring is identical across all three", () => {
    // Open decision 11: a gift table must not invent its own HubSpot rule
    // while HubSpot is being retired.
    for (const f of [
      "app/api/admin/opportunities/route.ts",
      "app/api/admin/fundraising/prospects/promote/route.ts",
      "app/api/admin/fundraising/gift-tables/[id]/placements/[pid]/start-ask/route.ts",
    ]) {
      expect(read(f), f).toContain("pushOpportunityToHubSpot");
    }
  });

  test("start ask refuses a donor who is do not contact", () => {
    const src = read("app/api/admin/fundraising/gift-tables/[id]/placements/[pid]/start-ask/route.ts");
    expect(src).toContain("do_not_contact");
    expect(src).toMatch(/already has an ask open/);
  });
});

describe("work only comes from an active table", () => {
  const page = read("app/admin/fundraising/campaigns/gift-tables/[id]/page.tsx");
  const today = read("app/admin/fundraising/today/page.tsx");

  test("the detail page renders work cards only when active", () => {
    expect(page).toContain('table.status === "active" && (');
  });

  test("Today's Moves filters to active gift tables in the query itself", () => {
    // Not in JS after the fact: a draft or closed table must not even be
    // fetched into the queue ("Zombie work").
    expect(today).toContain('.eq("gift_table.status", "active")');
  });

  test("a donor who turned do-not-contact leaves the Today queue", () => {
    expect(today).toContain("do_not_contact !== true");
  });

  test("the stale Plan link is re-aimed at Campaigns", () => {
    // /admin/fundraising/plan 308s to Campaigns, and gift tables live there.
    expect(today).not.toContain('href="/admin/fundraising/plan"');
    expect(today).toContain('href="/admin/fundraising/campaigns"');
  });
});
