import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BUILT_IN_VIEWS, RESEARCH_VIEWS, toDefinition } from "@/lib/fundraising/views";

// Spec Programs, stage P3 — the volunteers view (decision 1, resolved:
// volunteers are constituents wearing a different hat, so their V2 home is
// a view of the one list on Donors & Funders, not a second list on People).
// House pins: the id-set mechanism (no migration), the terminology relabel,
// and the V1 list byte-identical until its P4 308.

const root = join(__dirname, "..");
const src = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("the volunteers view (P3)", () => {
  test("volunteers is a built-in view, visible to every org (not research-fenced)", () => {
    expect(BUILT_IN_VIEWS.some((v) => v.value === "volunteers")).toBe(true);
    expect(RESEARCH_VIEWS.has("volunteers")).toBe(false);
    // URL + saved-view definitions accept it like any other view.
    expect(toDefinition({ view: "volunteers" }).view).toBe("volunteers");
  });

  test("the loader uses the Promoted id-set mechanism — no migration, empty set short-circuits", () => {
    const s = src("lib", "admin", "donorsFunders.ts");
    expect(s).toMatch(/eq\("is_volunteer", true\)/);
    // The flag is read from constituents (v_fr_rollups doesn't carry it, and
    // this spec ships no migrations), and the rollup query filters by id.
    expect(s).toMatch(/from\("constituents"\)/);
    expect(s).toMatch(/if \(volunteerIds\) q = q\.in\("id", volunteerIds\);/);
    expect(s).toMatch(/volunteerIds\.length === 0/); // empty → empty page, never unfiltered
  });

  test("the pill speaks the org's vocabulary — the V1 page's own lookup", () => {
    const page = src("app", "admin", "fundraising", "donors-funders", "page.tsx");
    expect(page).toMatch(/getTermLabel\("volunteer", "Volunteer"\)/);
    expect(page).toMatch(/v\.value === "volunteers" \? volunteersLabel/);
  });

  test("the V1 volunteers list is untouched until its P4 308", () => {
    const v1 = src("app", "admin", "fundraising", "volunteers", "page.tsx");
    expect(v1).toMatch(/eq\("is_volunteer", true\)/); // same flag, same people
    expect(v1).toMatch(/getTermLabel\("volunteer", "Volunteer"\)/);
  });
});
