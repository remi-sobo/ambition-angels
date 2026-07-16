import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// React's RSC-only `cache` doesn't exist in the test environment; the finance
// module (pulled in via the resolver registry) calls it at module scope. An
// identity shim preserves behavior for these pure-identity assertions.
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: (mod as { cache?: unknown }).cache ?? (<T,>(fn: T) => fn) };
});
// finance.ts resolves its org via lib/admin/orgs.ts, which is server-only.
vi.mock("server-only", () => ({}));
import { STALE_AFTER_DAYS, staleAfter, isStale } from "@/lib/admin/metrics/staleness";
import { METRIC_RESOLVERS } from "@/lib/admin/metrics/resolvers";
import { PLAN_METRICS } from "@/lib/admin/plan/metrics";

// Metric Catalog (spec #3) — the invariants that keep one number one number.

describe("resolver registry", () => {
  test("absorbs PLAN_METRICS verbatim — no forked formulas", () => {
    for (const [key, fn] of Object.entries(PLAN_METRICS)) {
      expect(METRIC_RESOLVERS[key], `resolver missing for plan metric ${key}`).toBe(fn);
    }
  });

  test("runway resolver IS the plan registry's canonical one (verdict parity)", () => {
    // The Command Center verdict reads getFinanceSnapshot().runwayMonths;
    // PLAN_METRICS.cash_runway_months wraps the same function. Identity here
    // means hub, scorecard, and verdict cannot disagree on runway.
    expect(METRIC_RESOLVERS.cash_runway_months).toBe(PLAN_METRICS.cash_runway_months);
  });

  test("v1 computed metrics are registered", () => {
    expect(typeof METRIC_RESOLVERS.monthly_burn).toBe("function");
    expect(typeof METRIC_RESOLVERS.gifts_this_month).toBe("function");
  });
});

describe("staleness", () => {
  const day = 86_400_000;
  const now = new Date("2026-07-10T12:00:00Z").getTime();
  const daysAgo = (n: number) => new Date(now - n * day).toISOString().slice(0, 10);

  test("no snapshot is always stale", () => {
    expect(isStale(null, "monthly", now)).toBe(true);
  });

  test("boundaries per cadence", () => {
    for (const [cadence, allow] of Object.entries(STALE_AFTER_DAYS)) {
      expect(isStale(daysAgo(allow), cadence, now), `${cadence} at limit`).toBe(false);
      expect(isStale(daysAgo(allow + 1), cadence, now), `${cadence} past limit`).toBe(true);
    }
  });

  test("unknown cadence falls back to monthly allowance", () => {
    expect(staleAfter("fortnightly")).toBe(STALE_AFTER_DAYS.monthly);
  });
});

describe("SQL drift guard", () => {
  test("the metric_stale queue arm uses the same allowance table", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "metrics_stale_queue_arm.sql"),
      "utf8",
    );
    for (const [cadence, days] of Object.entries(STALE_AFTER_DAYS)) {
      const re = new RegExp(`when\\s+'${cadence}'\\s+then\\s+${days}\\b`);
      expect(re.test(sql), `SQL arm allowance for ${cadence} must be ${days} days`).toBe(true);
    }
  });
});
