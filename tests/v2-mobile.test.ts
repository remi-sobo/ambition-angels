import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { MOBILE_BAR_KEYS, resolveShellNav, shellMobileSplit } from "@/lib/admin/v2shellNav";

// Spec B, stage B5 — the mobile shell's composition rule: the bottom bar is
// Today, Work, [+], Programs, More; everything else lives in the More sheet,
// filtered by entitlement like everything else (spec §Mobile). Fixtures are
// the live orgs' key sets (as in tests/nav-v2.test.ts).

const AA = [
  "aa.app", "aa.bv", "aa.demoday", "aa.hubspot_mirror", "aa.internships",
  "aa.mesa", "aa.quiz", "aa.site_analytics", "aa.ygb",
  "ai.prospect_research", "ai.reed", "coaching",
  "modules.board", "modules.comms", "modules.compliance", "modules.content",
  "modules.documents", "modules.finance", "modules.fundraising",
  "modules.meetings", "modules.messages", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program", "modules.reviews", "modules.staff",
  "modules.strategy",
];
const NINE_KEY = [
  "modules.board", "modules.compliance", "modules.documents",
  "modules.finance", "modules.fundraising", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program",
];

describe("shellMobileSplit: bar + More derive from one resolved nav", () => {
  test("AA: the bar is Home/Work/Programs; More is the rest plus Inbox", () => {
    const { bar, more } = shellMobileSplit(resolveShellNav(AA));
    expect(bar.map((d) => d.key)).toEqual(["home", "work", "programs"]);
    expect(more.map((d) => d.key)).toEqual([
      "fundraising", "finance", "impact", "organization", "inbox",
    ]);
  });

  test("9-key orgs: same shape — every bar destination survives their entitlements", () => {
    const { bar, more } = shellMobileSplit(resolveShellNav(NINE_KEY));
    expect(bar.map((d) => d.key)).toEqual(["home", "work", "programs"]);
    expect(more.map((d) => d.key)).toEqual([
      "fundraising", "finance", "impact", "organization", "inbox",
    ]);
  });

  test("the fifth-tenant rule: a missing destination narrows the bar, never dead-links it", () => {
    // No ops/meetings/documents keys → Work resolves to zero tabs and is
    // hidden; the bar simply loses that slot.
    const { bar } = shellMobileSplit(resolveShellNav(["modules.program", "modules.finance"]));
    expect(bar.map((d) => d.key)).toEqual(["home", "programs"]);
  });

  test("More is entitlement-filtered like everything else", () => {
    // No governance/metrics/fundraising keys → those More rows are absent.
    const { more } = shellMobileSplit(resolveShellNav(["modules.program", "modules.ops"]));
    expect(more.map((d) => d.key)).toEqual(["inbox"]);
  });

  test("every bar and More entry carries a live href (no dead links on any org)", () => {
    for (const features of [AA, NINE_KEY]) {
      const { bar, more } = shellMobileSplit(resolveShellNav(features));
      for (const d of [...bar, ...more]) expect(d.href, d.key).toBeTruthy();
    }
  });

  test("the bar order is pinned: Today, Work, Programs (the + and More are chrome)", () => {
    expect(MOBILE_BAR_KEYS).toEqual(["home", "work", "programs"]);
  });
});

describe("B5 structural invariants (spec §Mobile)", () => {
  const src = readFileSync(
    join(__dirname, "..", "app", "admin", "_components", "v2", "V2MobileBar.tsx"),
    "utf8",
  );

  test("52px targets, phone-only, safe-area aware", () => {
    expect(src).toMatch(/min-h-\[52px\]/);
    expect(src).toMatch(/lg:hidden/);
    expect(src).toMatch(/safe-area-inset-bottom/);
  });

  test("Reed appears only behind ai.reed (both the More row and the + badge)", () => {
    expect(src.match(/reedEnabled && \(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("the Home slot renders as Today", () => {
    expect(src).toMatch(/"home" \? "Today"/);
  });
});
