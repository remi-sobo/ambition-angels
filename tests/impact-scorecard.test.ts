import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Spec Impact, stage I3 — KPIs absorbs the scorecard (decision 3, resolved).
// House structural pins: the owner-segmented view moved whole (editing
// intact — the client islands travel), the V1 route stayed byte-identical,
// and the composition puts the catalog hub first.

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("I3 structural pins", () => {
  test("the V1 scorecard route is a thin stub over the extracted ScorecardSection", () => {
    const s = src("admin", "strategic-plan", "scorecard", "page.tsx");
    expect(s).toMatch(/import ScorecardSection from "\.\/ScorecardSection"/);
    expect(s).toMatch(/<ScorecardSection \/>/);
    expect(s).not.toMatch(/embedded/);
    expect(s).not.toMatch(/supabase/i);
    expect(s).toMatch(/force-dynamic/);
  });

  test("the section carries the moved working surface — reads, cards, and the in-place editing", () => {
    const s = src("admin", "strategic-plan", "scorecard", "ScorecardSection.tsx");
    // The owner segmentation and its reads travel as-is.
    expect(s).toMatch(/from\("plan_kpis"\)/);
    expect(s).toMatch(/from\("plan_kpi_snapshots"\)/);
    expect(s).toMatch(/from\("metric_snapshots"\)/); // the Phase-4 catalog read-swap survives
    expect(s).toMatch(/<ScorecardCard key=\{c\.id\} kpi=\{c\} \/>/);
    // The failure mode "the scorecard loses its hands": the refresh action
    // renders in BOTH variants — the embedded chrome keeps the button.
    const refreshes = s.match(/<RefreshMetricsButton \/>/g) ?? [];
    expect(refreshes.length).toBe(2);
  });

  test("Impact → KPIs composes the catalog hub → the embedded scorecard, in that order", () => {
    const s = src("admin", "impact", "kpis", "page.tsx");
    expect(s).toMatch(/import KpisPage from "@\/app\/admin\/kpis\/page"/);
    expect(s).toMatch(/<ScorecardSection embedded \/>/);
    expect(s.indexOf("<KpisPage />")).toBeLessThan(s.indexOf("<ScorecardSection embedded"));
    // The catalog hub itself is rendered, not reimplemented.
    expect(s).not.toMatch(/getMetricCatalog|plan_kpis/);
  });

  test("the V1 catalog hub page is untouched (it serves both /admin/kpis and the composition)", () => {
    const s = src("admin", "kpis", "page.tsx");
    expect(s).toMatch(/getMetricCatalog/);
    expect(s).not.toMatch(/ScorecardSection/);
  });
});
