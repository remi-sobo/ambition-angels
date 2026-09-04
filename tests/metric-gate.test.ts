import { describe, expect, test, vi } from "vitest";
import { metricRenderState, type MetricRenderInput } from "@/lib/admin/metrics/render";

// exportGate imports server-only + the session client for its wrappers; the
// pure core (computeGate) is what these tests exercise.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({}) }));
vi.mock("@/lib/admin/auth", () => ({ getOrgContext: async () => null }));
import { computeGate } from "@/lib/admin/metrics/exportGate";

// Spec A, stage A5 — Contract 2 render blocking + Contract 7 export gating.
// DoD #8: a report referencing finish_30_days blocks on export, and waiving
// it ships the artifact with the waiver attached.

const def = (over: Partial<MetricRenderInput>): MetricRenderInput => ({
  metric_key: "teens_reached_fy26",
  name: "Teens reached (FY26)",
  unit: null,
  confirmed_state: "confirmed",
  unresolved: false,
  stale: false,
  latest: { value: 3500, captured_on: "2026-09-01" },
  ...over,
});

describe("metricRenderState: the render decision behind <Metric>", () => {
  test("an undefined key REFUSES — never a number (the contract's teeth)", () => {
    const state = metricRenderState([def({})], "made_up_key");
    expect(state).toEqual({ kind: "undefined", key: "made_up_key" });
  });

  test("a defined metric always renders — drafting is never blocked", () => {
    for (const confirmed_state of ["confirmed", "unconfirmed", "conflict", "stale", null] as const) {
      const state = metricRenderState([def({ confirmed_state })], "teens_reached_fy26");
      expect(state.kind, String(confirmed_state)).toBe("defined");
    }
  });

  test("conflict and stale definitions render flagged 'blocks-export'", () => {
    for (const reason of ["conflict", "stale"] as const) {
      const state = metricRenderState([def({ confirmed_state: reason })], "teens_reached_fy26");
      expect(state.kind).toBe("defined");
      if (state.kind === "defined") {
        expect(state.display).toBe("3500");
        expect(state.flags).toContainEqual({ flag: "blocks-export", reason });
      }
    }
  });

  test("unconfirmed is a marker, not a block flag; confirmed and NULL carry neither", () => {
    const un = metricRenderState([def({ confirmed_state: "unconfirmed" })], "teens_reached_fy26");
    if (un.kind === "defined") {
      expect(un.flags).toContainEqual({ flag: "unconfirmed" });
      expect(un.flags.some((f) => f.flag === "blocks-export")).toBe(false);
    }
    for (const confirmed_state of ["confirmed", null] as const) {
      const state = metricRenderState([def({ confirmed_state })], "teens_reached_fy26");
      if (state.kind === "defined") expect(state.flags).toEqual([]);
    }
  });

  test("no snapshot renders an honest null display, not a made-up zero", () => {
    const state = metricRenderState([def({ latest: null })], "teens_reached_fy26");
    if (state.kind === "defined") {
      expect(state.display).toBeNull();
      expect(state.capturedOn).toBeNull();
    }
  });

  test("value formatting rides fmtMetricValue (usd / pct)", () => {
    const usd = metricRenderState(
      [def({ unit: "usd", latest: { value: 5000, captured_on: "2026-09-01" } })],
      "teens_reached_fy26",
    );
    if (usd.kind === "defined") expect(usd.display).toBe("$5,000");
    const pct = metricRenderState(
      [def({ unit: "pct", latest: { value: 87, captured_on: "2026-09-01" } })],
      "teens_reached_fy26",
    );
    if (pct.kind === "defined") expect(pct.display).toBe("87%");
  });

  test("unresolved (computed, no resolver) and stale snapshots flag inline", () => {
    const state = metricRenderState([def({ unresolved: true, stale: true })], "teens_reached_fy26");
    if (state.kind === "defined") {
      expect(state.flags).toContainEqual({ flag: "no-resolver" });
      expect(state.flags).toContainEqual({ flag: "stale-value" });
    }
  });

  test("snapshot staleness NEVER produces the blocks-export flag — only confirmed_state does", () => {
    const state = metricRenderState([def({ stale: true })], "teens_reached_fy26");
    if (state.kind === "defined") {
      expect(state.flags.some((f) => f.flag === "blocks-export")).toBe(false);
    }
  });
});

describe("computeGate: the Contract 7 exit check", () => {
  const defs = [
    { metric_key: "teens_reached_fy26", confirmed_state: "confirmed" },
    { metric_key: "finish_30_days", confirmed_state: "conflict" },
    { metric_key: "second_track_rate", confirmed_state: "conflict" },
    { metric_key: "attendance_rate", confirmed_state: "stale" },
    { metric_key: "guide_activation", confirmed_state: "unconfirmed" },
    { metric_key: "monthly_burn", confirmed_state: null },
  ];
  const none = new Set<string>();

  test("clean keys ship: confirmed, unclassified (NULL), and unconfirmed all pass", () => {
    const gate = computeGate(defs, ["teens_reached_fy26", "monthly_burn", "guide_activation"], none);
    expect(gate.blocked).toBe(false);
    expect(gate.blockers).toEqual([]);
    expect(gate.unconfirmed).toEqual(["guide_activation"]);
  });

  test("DoD #8: a report referencing finish_30_days blocks on export", () => {
    const gate = computeGate(defs, ["teens_reached_fy26", "finish_30_days"], none);
    expect(gate.blocked).toBe(true);
    expect(gate.blockers).toEqual([{ metricKey: "finish_30_days", reason: "conflict" }]);
  });

  test("confirmed_state='stale' blocks like conflict", () => {
    const gate = computeGate(defs, ["attendance_rate"], none);
    expect(gate.blockers).toEqual([{ metricKey: "attendance_rate", reason: "stale" }]);
  });

  test("an UNDEFINED key blocks — the exit refuses a number with no definition", () => {
    const gate = computeGate(defs, ["made_up_key"], none);
    expect(gate.blocked).toBe(true);
    expect(gate.blockers).toEqual([{ metricKey: "made_up_key", reason: "undefined" }]);
  });

  test("a waiver subtracts its key and travels: blocked→false, blocker moves to waived", () => {
    const gate = computeGate(defs, ["finish_30_days"], new Set(["finish_30_days"]));
    expect(gate.blocked).toBe(false);
    expect(gate.blockers).toEqual([]);
    expect(gate.waived).toEqual([{ metricKey: "finish_30_days", reason: "conflict" }]);
  });

  test("a waiver covers ONLY its key — the other conflict still blocks", () => {
    const gate = computeGate(
      defs,
      ["finish_30_days", "second_track_rate"],
      new Set(["finish_30_days"]),
    );
    expect(gate.blocked).toBe(true);
    expect(gate.blockers).toEqual([{ metricKey: "second_track_rate", reason: "conflict" }]);
    expect(gate.waived).toEqual([{ metricKey: "finish_30_days", reason: "conflict" }]);
  });

  test("duplicate keys in the artifact get one verdict, not two blockers", () => {
    const gate = computeGate(defs, ["finish_30_days", "finish_30_days"], none);
    expect(gate.blockers).toHaveLength(1);
  });

  test("no referenced metrics = nothing to gate", () => {
    const gate = computeGate(defs, [], none);
    expect(gate.blocked).toBe(false);
    expect(gate.blockers).toEqual([]);
    expect(gate.waived).toEqual([]);
    expect(gate.unconfirmed).toEqual([]);
  });
});
