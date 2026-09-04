import { describe, expect, test, vi } from "vitest";

// React's RSC-only `cache` doesn't exist here; finance.ts (on the resolver
// import path) calls it at module scope. Identity shim, as in metrics.test.ts.
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: (mod as { cache?: unknown }).cache ?? (<T,>(fn: T) => fn) };
});
vi.mock("server-only", () => ({}));

import { METRIC_RESOLVERS, RESOLVER_KEYS } from "@/lib/admin/metrics/resolvers";
import { PLAN_METRICS, PLAN_METRIC_META } from "@/lib/admin/plan/metrics";
import { fiscalYearBounds } from "@/lib/admin/fiscal";
import { fiscalYearBounds as financeFiscalYearBounds } from "@/lib/admin/finance";

// Spec A, stage A4 — one resolver registry, loudly complete (Contract 2).
// "Any definition marked computed without a resolver becomes a build-time
// error rather than a runtime skip": definitions are tenant DATA, so the
// build-time half of that promise is this drift guard — every computed
// source_key that exists in production (pinned below as of 2026-09-04) and
// every key the code itself offers must resolve. The runtime half is the
// `unresolved` finding surfaced by getMetricCatalog / the capture cron /
// refreshOrgPlanMetrics / Reed's audit tool.

// All computed source_keys live in metric_definitions on 2026-09-04
// (docs/v2-recon.md §B.2 called the unresolved ones "the dozen silent
// no-ops"). If a new computed definition is seeded without extending the
// registry, add it HERE with its resolver — this list only grows.
const PROD_COMPUTED_SOURCE_KEYS = [
  "anchor_gifts_closed",
  "attendance_rate", // A6 seed (spec_a_seed_contract2_metrics.sql)
  "cash_runway_months",
  "corporate_dollars_ytd",
  "corporate_raised",
  "dollars_ceiling_fy26",
  "dollars_raised_fy26",
  "dollars_raised_grants_ytd",
  "enrolled_in_cohort", // A6 seed (spec_a_seed_contract2_metrics.sql)
  "gifts_10k_closed",
  "gifts_this_month",
  "grants_submitted_ytd",
  "monthly_burn",
  "monthly_donors",
  "ogsm_reviews_held",
  "weighted_pipeline_fy26",
];

describe("the registry covers every computed definition", () => {
  test("every production computed source_key has a resolver — zero silent no-ops", () => {
    for (const key of PROD_COMPUTED_SOURCE_KEYS) {
      expect(typeof METRIC_RESOLVERS[key], `no resolver for "${key}"`).toBe("function");
    }
  });

  test("every metric the Library offers to bind (PLAN_METRIC_META) is computable", () => {
    // A meta row without a function would render an "auto" badge on a value
    // nothing updates — the fake-liveness failure the Library rules out.
    for (const key of Object.keys(PLAN_METRIC_META)) {
      expect(typeof PLAN_METRICS[key], `META offers "${key}" but PLAN_METRICS can't compute it`).toBe(
        "function",
      );
    }
  });

  test("RESOLVER_KEYS is the honest surface: superset of PLAN_METRICS, no phantom keys", () => {
    for (const key of Object.keys(PLAN_METRICS)) expect(RESOLVER_KEYS).toContain(key);
    for (const key of RESOLVER_KEYS) expect(typeof METRIC_RESOLVERS[key]).toBe("function");
  });
});

describe("one fiscal-year function (the copied-math era is over)", () => {
  test("finance.ts re-exports the pure lib/admin/fiscal.ts function — same identity", () => {
    expect(financeFiscalYearBounds).toBe(fiscalYearBounds);
  });

  test("calendar and offset fiscal years compute as documented", () => {
    expect(fiscalYearBounds(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(fiscalYearBounds(2026, 7)).toEqual({ start: "2025-07-01", end: "2026-06-30" });
  });

  test("no copied fiscal/finance math remains in Reed's tools", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "lib", "agents", "reed", "tools.ts"), "utf8");
    expect(src).not.toMatch(/function fiscalYearBounds/);
    expect(src).not.toMatch(/Copied from lib\/admin\/finance/);
    // The two finance tools call the canonical loaders, not local math.
    expect(src).toMatch(/getFinanceSnapshot\(\)/);
    expect(src).toMatch(/getForecast\(\)/);
    expect(src).not.toMatch(/loadFinConfig/);
  });
});
