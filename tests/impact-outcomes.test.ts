import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { KEPT_IN_PLACE, liveSeatFor } from "@/lib/admin/v2routes";

// Spec Impact, stage I1 — Outcomes, built provenance-first. House pins: the
// seat is kept-in-place, every value reaches the screen through the <Metric>
// primitive (Contract 2), the outcomes set is the program-department slice
// (decision 1), and nothing here fakes a bind or writes anything.

const app = join(__dirname, "..", "app");
const src = readFileSync(join(app, "admin", "impact", "outcomes", "page.tsx"), "utf8");

describe("I1 structural pins", () => {
  test("the seat exists: kept-in-place, self-resolving", () => {
    expect(KEPT_IN_PLACE).toContain("/admin/impact/outcomes");
    expect(liveSeatFor("/admin/impact/outcomes")).toBe("/admin/impact/outcomes");
  });

  test("decision 1: the outcomes set is the catalog's program-department slice", () => {
    expect(src).toMatch(/getMetricCatalog/);
    expect(src).toMatch(/m\.department === "program" && m\.active/);
  });

  test("Contract 2: values render ONLY through the <Metric> primitive — no bare figure", () => {
    expect(src).toMatch(/<Metric metricKey=\{m\.metric_key\} showName \/>/);
    // No direct formatting of a metric value on this page: the primitive owns
    // the number and its flags.
    expect(src).not.toMatch(/fmtMetricValue/);
    expect(src).not.toMatch(/m\.latest\.value/);
  });

  test("provenance is the screen, not the fine print — and nothing is faked or written", () => {
    // The provenance line states origin, capture date, and cadence.
    expect(src).toMatch(/Entered by hand/);
    expect(src).toMatch(/never captured/);
    expect(src).toMatch(/cadence/);
    // Reads only — the update flow stays on KPIs; no snapshot reads outside
    // the catalog, no writes, no funnel.
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(src).not.toMatch(/from\("metric_snapshots"\)/);
    expect(src).not.toMatch(/getSupabaseAdmin/);
  });

  test("the seat's gate mirrors the metrics section", () => {
    const layout = readFileSync(join(app, "admin", "impact", "outcomes", "layout.tsx"), "utf8");
    expect(layout).toMatch(/feature="modules\.metrics"/);
  });
});
