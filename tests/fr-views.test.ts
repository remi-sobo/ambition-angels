import { describe, expect, test } from "vitest";
import {
  BUILT_IN_VIEWS,
  RESEARCH_VIEWS,
  definitionToParams,
  fiscalYearStart,
  isLapsed,
  matchesView,
  sanitizeQuery,
  toDefinition,
  type RollupRow,
} from "@/lib/fundraising/views";

// Spec Fundraising, stage F1 — the view semantics of Donors & Funders.
// matchesView is the documented contract the loader's PostgREST filters
// must stay equivalent to (lib/admin/donorsFunders.ts points here).

const TODAY = "2026-09-08";

const row = (over: Partial<RollupRow>): RollupRow => ({
  type: "person",
  gift_count: 0,
  last_gift: null,
  recurring_active: false,
  archived_at: null,
  lifetime_total: 0,
  ...over,
});

describe("isLapsed — RESOLVED decision 3: computed, never stored", () => {
  test("gave a prior fiscal (calendar) year, nothing this year → lapsed", () => {
    expect(isLapsed("2025-12-31", 3, TODAY)).toBe(true);
    expect(isLapsed("2020-01-01", 1, TODAY)).toBe(true);
  });
  test("gave this year → not lapsed, even on Jan 1", () => {
    expect(isLapsed("2026-01-01", 1, TODAY)).toBe(false);
    expect(isLapsed("2026-09-08", 5, TODAY)).toBe(false);
  });
  test("never gave → not lapsed (a prospect is not a lapsed donor)", () => {
    expect(isLapsed(null, 0, TODAY)).toBe(false);
  });
  test("the database filter's boundary matches: last_gift < fiscalYearStart", () => {
    expect(fiscalYearStart(TODAY)).toBe("2026-01-01");
    // String comparison on ISO dates is the rule both sides use.
    expect("2025-12-31" < fiscalYearStart(TODAY)).toBe(true);
    expect("2026-01-01" < fiscalYearStart(TODAY)).toBe(false);
  });
});

describe("matchesView — the one-list rule's filters", () => {
  test("archived constituents are hidden in EVERY view", () => {
    const archived = row({ gift_count: 9, recurring_active: true, archived_at: "2026-01-01T00:00:00Z", last_gift: "2020-01-01" });
    for (const v of ["all", "donors", "recurring", "lapsed"] as const) {
      expect(matchesView(archived, v, TODAY), v).toBe(false);
    }
  });

  test("all: every unarchived constituent, gifts or not", () => {
    expect(matchesView(row({}), "all", TODAY)).toBe(true);
    expect(matchesView(row({ gift_count: 4 }), "all", TODAY)).toBe(true);
  });

  test("donors: at least one gift ever", () => {
    expect(matchesView(row({ gift_count: 1, last_gift: "2026-02-02" }), "donors", TODAY)).toBe(true);
    expect(matchesView(row({}), "donors", TODAY)).toBe(false);
  });

  test("recurring: an active plan, regardless of gift history", () => {
    expect(matchesView(row({ recurring_active: true }), "recurring", TODAY)).toBe(true);
    expect(matchesView(row({ gift_count: 20 }), "recurring", TODAY)).toBe(false);
  });

  test("lapsed applies the decision-3 rule", () => {
    expect(matchesView(row({ gift_count: 2, last_gift: "2025-06-01" }), "lapsed", TODAY)).toBe(true);
    expect(matchesView(row({ gift_count: 2, last_gift: "2026-06-01" }), "lapsed", TODAY)).toBe(false);
    expect(matchesView(row({}), "lapsed", TODAY)).toBe(false);
  });

  test("DoD 2 (one person, one row): a PROMOTED prospect's constituent row is a normal list member — Prospects is the only view reading the other table", () => {
    // Prospects view is excluded from matchesView by type: the compiler
    // enforces that the constituents list never tries to render it. The
    // loader reads fr_prospects with status='active' only, so a promoted
    // prospect (status='promoted') cannot appear there — and its
    // constituent row matches the ordinary views:
    const promoted = row({ gift_count: 0 });
    expect(matchesView(promoted, "all", TODAY)).toBe(true);
    expect(matchesView(promoted, "donors", TODAY)).toBe(false); // until a first gift
  });
});

describe("saved-view definitions (R11): validate on the way in, degrade never crash", () => {
  test("round-trips a full definition through URL params", () => {
    const def = toDefinition({ view: "lapsed", q: "smith", type: "person", min_total: "500" });
    expect(def).toEqual({ view: "lapsed", q: "smith", type: "person", min_total: "500" });
    expect(definitionToParams(def)).toBe("view=lapsed&q=smith&type=person&min_total=500");
    // And back:
    expect(toDefinition(Object.fromEntries(new URLSearchParams(definitionToParams(def))))).toEqual(def);
  });

  test("unknown or invalid values fall away instead of erroring", () => {
    expect(toDefinition({ view: "everyone", type: "alien", min_total: "lots", q: "   " })).toEqual({});
    expect(toDefinition({ min_total: "-5" })).toEqual({});
    expect(toDefinition({ min_total: "10000000000" })).toEqual({}); // > 9 digits
  });

  test('view "all" is the default and stays out of the params', () => {
    expect(definitionToParams({ view: "all" })).toBe("");
    expect(definitionToParams({})).toBe("");
  });

  test("sanitizeQuery strips PostgREST or() syntax so a search string stays data", () => {
    expect(sanitizeQuery("smith,org_id.eq.x)")).toBe("smith org_id.eq.x");
    expect(sanitizeQuery("100% (match)")).toBe("100 match");
    expect(sanitizeQuery("a".repeat(200))).toHaveLength(80);
    // toDefinition applies it:
    expect(toDefinition({ q: "a,b(c)" }).q).toBe("a b c");
  });

  test("the built-in view strip is the spec's five plus Promoted (F4, R1)", () => {
    expect(BUILT_IN_VIEWS.map((v) => v.value)).toEqual([
      "all", "donors", "prospects", "promoted", "recurring", "lapsed",
    ]);
  });

  test("the research views (R1) are exactly the bench and its promotions — gated together", () => {
    expect(Array.from(RESEARCH_VIEWS).sort()).toEqual(["promoted", "prospects"]);
    // A promoted-view definition round-trips like any other.
    expect(toDefinition({ view: "promoted" })).toEqual({ view: "promoted" });
  });
});
