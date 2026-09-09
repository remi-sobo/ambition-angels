import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { V2_ROUTE_MAP, v2Href } from "@/lib/admin/v2routes";

// Spec Org, stage O1 — Strategy's children get their seats BEFORE their rows
// activate (the F6 no-child-into-a-404 discipline). House pins: pure
// re-export hosts, the chip bar preserved, rows re-targeted but still
// at-cutover — nothing 308s until O2.

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("O1 structural pins", () => {
  test("the child hosts are pure re-exports of the V1 screens", () => {
    const obj = src("admin", "organization", "strategy", "objective", "[id]", "page.tsx");
    expect(obj).toMatch(/export \{ default \} from "@\/app\/admin\/strategic-plan\/objective\/\[id\]\/page"/);
    const rev = src("admin", "organization", "strategy", "review", "page.tsx");
    expect(rev).toMatch(/export \{ default \} from "@\/app\/admin\/strategic-plan\/review\/page"/);
  });

  test("the chip bar survives at the new paths (failure mode 2) and hides on both landings", () => {
    for (const dir of ["objective", "review"]) {
      const layout = src("admin", "organization", "strategy", dir, "layout.tsx");
      expect(layout).toMatch(/<SectionNav \/>/);
    }
    const nav = src("admin", "strategic-plan", "_components", "SectionNav.tsx");
    expect(nav).toMatch(/V2_BASE = "\/admin\/organization\/strategy"/);
    expect(nav).toMatch(/pathname === BASE \|\| pathname === V2_BASE/);
  });

  test("the rows carry the O1 re-targets and are ACTIVE since O2", () => {
    const objective = V2_ROUTE_MAP.find(
      (r) => r.v1 === "/admin/strategic-plan/objective" && r.kind === "prefix",
    )!;
    expect(objective.v2).toBe("/admin/organization/strategy/objective");
    expect(objective.activation).toBe("now");
    const review = V2_ROUTE_MAP.find((r) => r.v1 === "/admin/strategic-plan/review")!;
    expect(review.v2).toBe("/admin/organization/strategy/review");
    expect(review.activation).toBe("now");
    expect(v2Href("/admin/strategic-plan/review")).toBe("/admin/organization/strategy/review");
    expect(v2Href("/admin/strategic-plan/objective/abc")).toBe("/admin/organization/strategy/objective/abc");
  });
});
