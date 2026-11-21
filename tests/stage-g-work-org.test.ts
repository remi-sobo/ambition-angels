import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProofPoints, proofPointsToShow } from "@/lib/admin/strategy/proofPoints";

// V4 Stage G, part 1: Work and Organization on the standard
// (specs/bloomos-v4-product-readiness.md §5, §6, §13 Stage G).

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("strategy proof points: the org's own, or none (no Ambition Angels fallback)", () => {
  test("an org with no proof points gets an empty list, never another org's numbers", () => {
    expect(proofPointsToShow(null)).toEqual([]);
    expect(proofPointsToShow(undefined)).toEqual([]);
    expect(proofPointsToShow({ proofPoints: [] })).toEqual([]);
    expect(proofPointsToShow({ proofPoints: null })).toEqual([]);
  });

  test("an org's own proof points are shown as they are", () => {
    const own = [{ value: "240", label: "families served" }];
    expect(proofPointsToShow({ proofPoints: own })).toEqual(own);
  });

  test("jsonb parsing is defensive and drops blank values", () => {
    expect(parseProofPoints(null)).toEqual([]);
    expect(parseProofPoints({ value: "1" })).toEqual([]);
    expect(parseProofPoints([{ value: " 12 ", label: " sites " }, { value: "", label: "x" }, null])).toEqual([
      { value: "12", label: "sites" },
    ]);
  });

  test("no Ambition Angels headline stats anywhere in the strategy screens", () => {
    for (const f of [
      "app/admin/strategic-plan/narrative/_components/MovementPlan.tsx",
      "app/admin/strategic-plan/_components/PlanControls.tsx",
      "app/admin/strategic-plan/page.tsx",
      "lib/admin/strategy/narrative.ts",
    ]) {
      const src = strip(read(f));
      expect(src, f).not.toMatch(/3,500|87%|1,100\+|Title I|FALLBACK_PROOF/);
    }
    expect(read("app/admin/strategic-plan/narrative/_components/MovementPlan.tsx")).toMatch(/proofPointsToShow\(plan\.foundation\)/);
  });
});
