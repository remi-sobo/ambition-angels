import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_NEEDS_YOU_VIEW,
  NEEDS_YOU_VIEWS,
  countObligationsByView,
  filterObligationsByView,
  parseNeedsYouView,
} from "@/lib/admin/todayRank";

// Today's Needs-you feed is per-user by default. Reported from /admin/today:
// the list showed every task in the org regardless of who was signed in.

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

const ME = "11111111-1111-1111-1111-111111111111";
const THEM = "22222222-2222-2222-2222-222222222222";

const rows = [
  { id: "ops_task:a", type: "ops_task", owner_id: ME },
  { id: "ops_task:b", type: "ops_task", owner_id: THEM },
  { id: "ops_task:c", type: "ops_task", owner_id: null },
  { id: "grant_requirement:d", type: "grant_requirement", owner_id: ME },
  { id: "acknowledgment:e", type: "acknowledgment", owner_id: null },
];

describe("parseNeedsYouView: the URL param, defaulting to the signed-in person", () => {
  test("the default is 'mine'", () => {
    expect(DEFAULT_NEEDS_YOU_VIEW).toBe("mine");
    expect(parseNeedsYouView(undefined)).toBe("mine");
    expect(parseNeedsYouView(null)).toBe("mine");
    expect(parseNeedsYouView("")).toBe("mine");
    expect(parseNeedsYouView("everything")).toBe("mine");
    expect(parseNeedsYouView(42)).toBe("mine");
  });

  test("the three views round-trip", () => {
    expect(NEEDS_YOU_VIEWS).toEqual(["mine", "unassigned", "all"]);
    for (const v of NEEDS_YOU_VIEWS) expect(parseNeedsYouView(v)).toBe(v);
  });
});

describe("filterObligationsByView", () => {
  test("'mine' keeps only rows the caller owns", () => {
    expect(filterObligationsByView(rows, "mine", ME).map((r) => r.id)).toEqual([
      "ops_task:a", "grant_requirement:d",
    ]);
    expect(filterObligationsByView(rows, "mine", THEM).map((r) => r.id)).toEqual(["ops_task:b"]);
  });

  test("'unassigned' is every row nobody owns — never silently lost", () => {
    expect(filterObligationsByView(rows, "unassigned", ME).map((r) => r.id)).toEqual([
      "ops_task:c", "acknowledgment:e",
    ]);
  });

  test("'all' is the full org feed, in the ranked order it was given", () => {
    expect(filterObligationsByView(rows, "all", ME).map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  test("does not mutate its input", () => {
    const copy = rows.map((r) => ({ ...r }));
    filterObligationsByView(rows, "mine", ME);
    expect(rows).toEqual(copy);
  });

  test("counts for the segmented control", () => {
    expect(countObligationsByView(rows, ME)).toEqual({ mine: 2, unassigned: 2, all: 5 });
  });
});

describe("the page wires it up (structural)", () => {
  test("the loader reads owner_id from v_obligations and composes the line for the caller's rows", () => {
    const src = read("lib", "admin", "today.ts");
    expect(src).toMatch(/\.select\("id, type, title, why_it_matters, owner_id, due_date, state, module"\)/);
    expect(src).toMatch(/const mine = ranked\.filter\(\(r\) => r\.owner_id === ctx\.userId\)/);
    expect(src).toMatch(/userId: ctx\.userId/);
  });

  test("the page reads ?needs= and defaults to the signed-in person's rows", () => {
    const src = read("app", "admin", "today", "page.tsx");
    expect(src).toMatch(/parseNeedsYouView\(needsParam\)/);
    expect(src).toMatch(/userId=\{data\.userId\}/);
    expect(src).toMatch(/view=\{needsView\}/);
  });

  test("Needs-you offers Mine / Unassigned / Everyone and flags ownerless work on the default view", () => {
    const src = read("app", "admin", "today", "_components", "NeedsYou.tsx");
    expect(src).toMatch(/view = DEFAULT_NEEDS_YOU_VIEW/);
    expect(src).toMatch(/filterObligationsByView\(obligations, view, userId\)/);
    expect(src).toMatch(/\{ value: "mine", label: "Mine"/);
    expect(src).toMatch(/\{ value: "unassigned", label: "Unassigned"/);
    expect(src).toMatch(/\{ value: "all", label: "Everyone"/);
    expect(src).toMatch(/view === "mine" && counts\.unassigned > 0/);
    // The cap and "show all N" apply to the filtered view, not the org list.
    expect(src).toMatch(/inView\.slice\(0, SHOW_CAP\)/);
    expect(src).toMatch(/Show all \$\{inView\.length\}/);
  });
});
