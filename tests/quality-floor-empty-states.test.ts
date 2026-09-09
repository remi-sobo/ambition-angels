import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Quality Floor, stage Q5 — EmptyState adoption (the audit's F5: the
// component lived in 7 files, all under /admin/staff, while every other
// module hand-rolled its "nothing here yet"). House structural pins: the
// component carries the action slot and the title override, the first-run
// screens and the V2 converge targets import it, and the two empties that
// leaked internals at the user (a migration name, a seed-template failure)
// stay gone.

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("Q5: the component (DoD 6)", () => {
  test("EmptyState keeps the action slot and the title override", () => {
    const s = src("admin", "_components", "EmptyState.tsx");
    expect(s).toMatch(/action\?: ReactNode/);
    expect(s).toMatch(/title\?: string/);
    // The house rule lives in the doc comment: all-clear states are data,
    // never this component.
    expect(s).toMatch(/ALL-CLEAR/);
  });
});

describe("Q5: adoption on the first-run screens and V2 converge targets", () => {
  const ADOPTERS: string[][] = [
    // First-run four (spec: "first-run screens first").
    ["admin", "today", "page.tsx"],
    ["admin", "students", "page.tsx"],
    ["admin", "fundraising", "donors-funders", "page.tsx"],
    ["admin", "ops", "_components", "TaskListView.tsx"],
    // The V2 screens whose inline empties converge (spec Q5).
    ["admin", "programs", "attendance", "page.tsx"],
    ["admin", "impact", "outcomes", "page.tsx"],
    ["admin", "programs", "overview", "page.tsx"],
    ["admin", "finance", "reports", "page.tsx"],
    ["admin", "impact", "reports", "page.tsx"],
    ["admin", "finance", "reports", "_components", "ComposeForm.tsx"],
  ];
  test("each adopter imports and renders the component", () => {
    for (const p of ADOPTERS) {
      const s = src(...p);
      expect(s, p.join("/")).toMatch(/from ["'].*_components\/EmptyState["']/);
      expect(s, p.join("/")).toMatch(/<EmptyState/);
    }
  });

  test("first-run empties carry a creating action (the DoD tests the action, not the prose)", () => {
    // Donors & Funders offers the import; the roster offers the roster
    // import; Today's mission-health empty opens the Metric Catalog.
    expect(src("admin", "fundraising", "donors-funders", "page.tsx")).toMatch(
      /href="\/admin\/fundraising\/import"/,
    );
    expect(src("admin", "students", "page.tsx")).toMatch(/href="\/admin\/imports"/);
    expect(src("admin", "today", "page.tsx")).toMatch(/href="\/admin\/impact\/kpis"/);
  });

  test("first-run is distinguished from filtered-to-zero where filters exist", () => {
    // A zero-row tenant gets the EmptyState; a filtered view that happens to
    // be empty keeps its match-message (never a lecture about a first run).
    expect(src("admin", "ops", "projects", "page.tsx")).toMatch(/orgProjectCount/);
    expect(src("admin", "documents", "page.tsx")).toMatch(/orgDocCount/);
    expect(src("admin", "finance", "transactions", "page.tsx")).toMatch(
      /total === 0 \? \(/,
    );
  });
});

describe("Q5: the empties that leaked internals stay fixed", () => {
  test("no rendered empty tells the user to run a migration or blames a seed template", () => {
    expect(src("admin", "cohorts", "page.tsx")).not.toMatch(/create_cohorts_attendance migration/);
    expect(src("admin", "compliance", "page.tsx")).not.toMatch(/seed template/);
  });
});
