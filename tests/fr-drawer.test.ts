import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Spec Fundraising, stage F4 — structural pins for the R1 research drawer
// (the house pattern from the B3 DoD tests and tests/fr-pipeline.test.ts).

const app = join(__dirname, "..", "app", "admin", "fundraising");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("F4 drawer invariants (R1, signed)", () => {
  test("the V1 prospects route is a thin stub over ProspectBench with drawer OFF", () => {
    const s = src("prospects", "page.tsx");
    expect(s).toMatch(/import ProspectBench from "\.\/ProspectBench"/);
    expect(s).toMatch(/<ProspectBench searchParams=\{searchParams\} \/>/);
    expect(s).not.toMatch(/drawer=/); // no variant props: V1 output unchanged
    expect(s).not.toMatch(/basePath=/);
  });

  test("the drawer is URL-driven and entitlement-gated on the page, never open by default", () => {
    const s = src("donors-funders", "page.tsx");
    expect(s).toMatch(/researchEnabled && searchParams\?\.drawer === "research"/);
    expect(s).toMatch(/\{drawerOpen && \(/);
    // The launcher renders only under the same key — never a sixth tab.
    expect(s).toMatch(/researchEnabled \? \(/);
  });

  test("the drawer renders the bench pointed back at Donors & Funders, drawer param preserved", () => {
    const s = src("donors-funders", "_components", "ResearchDrawer.tsx");
    expect(s).toMatch(/basePath="\/admin\/fundraising\/donors-funders"/);
    expect(s).toMatch(/extraParams=\{\{ drawer: "research" \}\}/);
    expect(s).toMatch(/drawer\b/);
    // R6: the angle briefs fold in, linking their live per-angle funnels.
    expect(s).toMatch(/\/admin\/fundraising\/strategy\/\$\{a\.key\}/);
  });

  test("ProspectBench keeps the V1 chrome in its standalone branch", () => {
    const s = src("prospects", "ProspectBench.tsx");
    expect(s).toMatch(/drawer = false/);
    expect(s).toMatch(/<PageHeader\s*\n?\s*title=\{disqualifiedView \? "Prospects · Disqualified" : "Prospects"\}/);
  });
});
