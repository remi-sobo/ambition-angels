import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveShellNav, activeShellKey } from "@/lib/admin/v2shellNav";
import { V2_ROUTE_MAP } from "@/lib/admin/v2routes";
import { V2_DESTINATIONS } from "@/lib/admin/nav";

/**
 * The gift table's seat in the shell (specs/fundraising-gift-tables.md,
 * Phase 2 · DoD "Surfaces and lifecycle").
 *
 * Phase 0 found that the spec's original route, /admin/fundraising/gift-tables/[id],
 * would have rendered with NO tab row and NO sidebar highlight: both
 * activeShellKey and V2TabRow match by href prefix against the five
 * fundraising tabs, and that path is a prefix of none of them. The proposed
 * remedy — a v2routes row — would have been worse: v2routes is the V1→V2
 * REDIRECT map, and an ACTIVE row there makes next.config.mjs 308 the page
 * out of existence.
 *
 * Nesting under Campaigns fixes it structurally. These tests pin that, and
 * pin the negative half too: no new tab, and the three nav files untouched.
 */

const ROOT = join(__dirname, "..");
const DETAIL = "/admin/fundraising/campaigns/gift-tables/6f1d9d3e-1111-4222-8333-444455556666";
const nav = resolveShellNav(["modules.fundraising"], null);

describe("the gift table detail route sits inside Campaigns", () => {
  test("the shell resolves it to the Fundraising destination", () => {
    expect(activeShellKey(DETAIL, nav)).toBe("fundraising");
  });

  test("the unnested route it replaced would have resolved to nothing", () => {
    // The regression this nesting exists to prevent. If someone ever "tidies"
    // the route back up a level, this is the line that explains the cost.
    expect(activeShellKey("/admin/fundraising/gift-tables/abc", nav)).toBeNull();
  });

  test("the Campaigns tab is the one that highlights", () => {
    const fundraising = nav.destinations.find((d) => d.key === "fundraising");
    expect(fundraising).toBeDefined();
    // V2TabRow's rule, verbatim: path === tab.href || path.startsWith(tab.href + "/").
    const active = fundraising!.tabs.filter(
      (t) => DETAIL === t.href || DETAIL.startsWith(t.href + "/"),
    );
    expect(active.map((t) => t.key)).toEqual(["campaigns"]);
  });

  test("no sixth fundraising tab was added", () => {
    const fundraising = V2_DESTINATIONS.find((d) => d.key === "fundraising");
    expect(fundraising!.tabs.map((t) => t.key)).toEqual([
      "today",
      "donors-funders",
      "pipeline",
      "grants",
      "campaigns",
    ]);
  });

  test("the redirect map carries no gift-table row", () => {
    // A row here would make activeRedirects() emit a 308 and the page would
    // vanish. The seat is structural, not a redirect.
    expect(V2_ROUTE_MAP.filter((r) => r.v1.includes("gift-table"))).toEqual([]);
    expect(
      V2_ROUTE_MAP.filter((r) => (r.v2 ?? "").includes("gift-table")),
    ).toEqual([]);
  });

  test("next.config.mjs has no gift-table redirect", () => {
    const config = readFileSync(join(ROOT, "next.config.mjs"), "utf8");
    expect(config).not.toContain("gift-table");
  });
});
