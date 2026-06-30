import { describe, expect, test } from "vitest";
import { parseRecommendations } from "@/lib/agents/next-best-action/agent";

// Offline eval for the next-best-action structured-output coercion: the safety
// net that stands between a hallucinating model and the suggestions table. No
// key, no network — a golden fixture of a messy tool payload in, safe rows out.

const validIds = new Set(["opp-1", "opp-2"]);

describe("parseRecommendations", () => {
  test("drops any opportunity_id the model invented", () => {
    const out = parseRecommendations(
      {
        recommendations: [
          { opportunity_id: "opp-1", priority: 1, action: "Call", rationale: "Overdue", channel: "call", suggested_due_in_days: 2 },
          { opportunity_id: "opp-999", priority: 2, action: "Email a ghost", rationale: "n/a", channel: "email", suggested_due_in_days: 1 },
        ],
      },
      validIds,
    );
    expect(out.map((r) => r.opportunity_id)).toEqual(["opp-1"]);
  });

  test("clamps priority and due-days, and defaults missing numbers", () => {
    const out = parseRecommendations(
      {
        recommendations: [
          { opportunity_id: "opp-1", priority: 0, action: "a", rationale: "b", channel: "call", suggested_due_in_days: 99 },
          { opportunity_id: "opp-2", action: "c", rationale: "d", channel: "note" },
        ],
      },
      validIds,
    );
    const byId = Object.fromEntries(out.map((r) => [r.opportunity_id, r]));
    expect(byId["opp-1"].priority).toBe(1); // 0 -> clamped to 1
    expect(byId["opp-1"].suggested_due_in_days).toBe(30); // 99 -> clamped to 30
    expect(byId["opp-2"].priority).toBe(999); // missing -> default
    expect(byId["opp-2"].suggested_due_in_days).toBe(3); // missing -> default
  });

  test("forces an unknown channel to 'other' and truncates long text", () => {
    const out = parseRecommendations(
      {
        recommendations: [
          { opportunity_id: "opp-1", priority: 1, action: "x".repeat(500), rationale: "y".repeat(500), channel: "carrier-pigeon", suggested_due_in_days: 1 },
        ],
      },
      validIds,
    );
    expect(out[0].channel).toBe("other");
    expect(out[0].action.length).toBe(200);
    expect(out[0].rationale.length).toBe(240);
  });

  test("sorts by priority ascending", () => {
    const out = parseRecommendations(
      {
        recommendations: [
          { opportunity_id: "opp-2", priority: 5, action: "a", rationale: "b", channel: "call", suggested_due_in_days: 1 },
          { opportunity_id: "opp-1", priority: 1, action: "c", rationale: "d", channel: "call", suggested_due_in_days: 1 },
        ],
      },
      validIds,
    );
    expect(out.map((r) => r.opportunity_id)).toEqual(["opp-1", "opp-2"]);
  });

  test("returns [] for non-array or missing input (model returned junk)", () => {
    expect(parseRecommendations({ recommendations: "nope" }, validIds)).toEqual([]);
    expect(parseRecommendations({}, validIds)).toEqual([]);
    expect(parseRecommendations(null, validIds)).toEqual([]);
  });
});
