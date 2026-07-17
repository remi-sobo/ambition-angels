import { describe, expect, test } from "vitest";

// Plan completeness (strategy builders, spec #6). The contract: functioning =
// real mission + ≥3 objectives + every objective has a goal + every goal has a
// measure; gaps are named in fix-first order; bracketed template placeholders
// count as missing; `empty` distinguishes "build" from "finish".

import { planCompleteness, isPlaceholder } from "@/lib/admin/plan/completeness";

const obj = (id: string, title = id) => ({ id, title });
const goal = (id: string, objective_id: string | null) => ({ id, objective_id });

describe("isPlaceholder", () => {
  test.each([
    ["[Your mission — one sentence]", true],
    ["  [Edit me]  ", true],
    ["To empower teens", false],
    ["", false],
    [null, false],
  ])("%s → %s", (input, expected) => {
    expect(isPlaceholder(input)).toBe(expected);
  });
});

describe("planCompleteness", () => {
  test("a functioning plan reports no gaps", () => {
    const c = planCompleteness({
      mission: "To empower teens.",
      objectives: [obj("a"), obj("b"), obj("c")],
      goals: [goal("g1", "a"), goal("g2", "b"), goal("g3", "c")],
      kpis: [{ goal_id: "g1" }, { goal_id: "g2" }, { goal_id: "g3" }],
    });
    expect(c).toEqual({ functioning: true, gaps: [], empty: false });
  });

  test("nothing at all → empty build state with the full gap list", () => {
    const c = planCompleteness({ mission: null, objectives: [], goals: [], kpis: [] });
    expect(c.empty).toBe(true);
    expect(c.functioning).toBe(false);
    expect(c.gaps[0]).toBe("a mission");
    expect(c.gaps.some((g) => g.includes("objectives"))).toBe(true);
  });

  test("a bracketed template mission counts as missing", () => {
    const c = planCompleteness({
      mission: "[Your mission — one sentence]",
      objectives: [obj("a"), obj("b"), obj("c")],
      goals: [goal("g1", "a"), goal("g2", "b"), goal("g3", "c")],
      kpis: [{ goal_id: "g1" }, { goal_id: "g2" }, { goal_id: "g3" }],
    });
    expect(c.functioning).toBe(false);
    expect(c.gaps).toEqual(["a mission"]);
  });

  test("two objectives → asks for one more (aim 3–5), soft not fatal", () => {
    const c = planCompleteness({
      mission: "M",
      objectives: [obj("a"), obj("b")],
      goals: [goal("g1", "a"), goal("g2", "b")],
      kpis: [{ goal_id: "g1" }, { goal_id: "g2" }],
    });
    expect(c.gaps).toEqual(["1 more objective (aim for 3–5)"]);
  });

  test("an objective without a goal is named", () => {
    const c = planCompleteness({
      mission: "M",
      objectives: [obj("a", "Fundraising"), obj("b"), obj("c")],
      goals: [goal("g1", "b"), goal("g2", "c")],
      kpis: [{ goal_id: "g1" }, { goal_id: "g2" }],
    });
    expect(c.gaps).toEqual(["a goal under “Fundraising”"]);
  });

  test("goals without measures are counted", () => {
    const c = planCompleteness({
      mission: "M",
      objectives: [obj("a"), obj("b"), obj("c")],
      goals: [goal("g1", "a"), goal("g2", "b"), goal("g3", "c")],
      kpis: [{ goal_id: "g1" }],
    });
    expect(c.gaps).toEqual(["a measure on 2 goals"]);
  });

  test("an objective-level measure does not satisfy a goal", () => {
    const c = planCompleteness({
      mission: "M",
      objectives: [obj("a"), obj("b"), obj("c")],
      goals: [goal("g1", "a"), goal("g2", "b"), goal("g3", "c")],
      kpis: [{ goal_id: null }, { goal_id: "g1" }, { goal_id: "g2" }, { goal_id: "g3" }],
    });
    expect(c.functioning).toBe(true);
  });
});
