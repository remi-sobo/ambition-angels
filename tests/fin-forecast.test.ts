import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Spec Finance, stage N2 — Forecast absorbs Model + Revenue + the pledges
// tier. Structural pins in the house pattern (tests/fin-transactions.test.ts).

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("N2 structural pins", () => {
  test("the V1 revenue and pledges routes are thin stubs over the extracted sections", () => {
    const rev = src("admin", "finance", "revenue", "page.tsx");
    expect(rev).toMatch(/import RevenueSection from "\.\/RevenueSection"/);
    expect(rev).toMatch(/<RevenueSection searchParams=\{searchParams\} \/>/);
    expect(rev).not.toMatch(/embedded/i);
    expect(rev).not.toMatch(/basePath=/);
    const pl = src("admin", "fundraising", "pledges", "page.tsx");
    expect(pl).toMatch(/import PledgesSection from "\.\/PledgesSection"/);
    expect(pl).toMatch(/<PledgesSection \/>/);
    expect(pl).not.toMatch(/<PledgesSection embedded/);
  });

  test("the V1 model route keeps its hourly cache and gains the aa.finance_model fence", () => {
    const s = src("admin", "finance", "model", "page.tsx");
    expect(s).toMatch(/export const revalidate = 3600/);
    expect(s).toMatch(/<FeatureGate feature="aa\.finance_model"/);
    expect(s).toMatch(/<ModelSection \/>/);
  });

  test("Forecast composes model → scenario board → revenue tiers → pledges, in order", () => {
    const s = src("admin", "finance", "forecast", "page.tsx");
    expect(s).toMatch(/<ModelSection embedded \/>/);
    expect(s).toMatch(/<ForecastBoard/);
    expect(s).toMatch(/basePath="\/admin\/finance\/forecast"/);
    expect(s).toMatch(/<PledgesSection embedded \/>/);
    const order = [
      s.indexOf("<ModelSection embedded"),
      s.indexOf("<ForecastBoard"),
      s.indexOf("<RevenueSection"),
      s.indexOf("<PledgesSection embedded"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Composes, never re-derives: the tiers ride the canonical schedule and
    // the extracted sections — no direct tier math here.
    expect(s).toMatch(/loadRevenueSchedule/);
  });

  test("the model section fences itself (embedded null without the key) and caches hourly when embedded", () => {
    const s = src("admin", "finance", "model", "ModelSection.tsx");
    expect(s).toMatch(/hasEntitlement\("aa\.finance_model"\)/);
    expect(s).toMatch(/return null/);
    expect(s).toMatch(/unstable_cache/);
    expect(s).toMatch(/revalidate: 3600/);
  });
});
