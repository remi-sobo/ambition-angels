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
  test("AA: the bar is Home/Work/Fundraising (Remi's 2026-09-09 swap); More is the rest plus Inbox", () => {
    const { bar, more } = shellMobileSplit(resolveShellNav(AA));
    expect(bar.map((d) => d.key)).toEqual(["home", "work", "fundraising"]);
    // V4 A2: Comms (modules.comms) is a More destination, never a bar slot.
    expect(more.map((d) => d.key)).toEqual([
      "programs", "comms", "finance", "impact", "organization", "inbox",
    ]);
  });

  test("9-key orgs: same shape — every bar destination survives their entitlements", () => {
    const { bar, more } = shellMobileSplit(resolveShellNav(NINE_KEY));
    expect(bar.map((d) => d.key)).toEqual(["home", "work", "fundraising"]);
    expect(more.map((d) => d.key)).toEqual([
      "programs", "finance", "impact", "organization", "inbox",
    ]);
  });

  test("the fifth-tenant rule: a missing destination narrows the bar, never dead-links it", () => {
    // No ops/meetings/documents keys → Work hides; no fundraising key →
    // Fundraising hides and Programs takes its slot (V4 P1 stand-in).
    const { bar } = shellMobileSplit(resolveShellNav(["modules.program", "modules.finance"]));
    expect(bar.map((d) => d.key)).toEqual(["home", "programs"]);
    const { bar: none } = shellMobileSplit(resolveShellNav(["modules.finance"]));
    expect(none.map((d) => d.key)).toEqual(["home"]);
  });

  test("More is entitlement-filtered like everything else", () => {
    // No governance/metrics/fundraising keys → those More rows are absent;
    // Programs stands in for the missing Fundraising slot, so More is Inbox.
    const { bar, more } = shellMobileSplit(resolveShellNav(["modules.program", "modules.ops"]));
    expect(bar.map((d) => d.key)).toEqual(["home", "work", "programs"]);
    expect(more.map((d) => d.key)).toEqual(["inbox"]);
  });

  test("program staff (program.write, no fundraising): Programs is in the bar, one tap to attendance", () => {
    const owner = ["program.read", "program.write", "fundraising.read", "fundraising.write", "ops.read", "ops.write"];
    const programStaff = owner.filter((p) => !p.startsWith("fundraising."));
    const forOwner = shellMobileSplit(resolveShellNav(AA, null, owner));
    expect(forOwner.bar.map((d) => d.key)).toContain("fundraising");
    expect(forOwner.more.map((d) => d.key)).toContain("programs");
    const forStaff = shellMobileSplit(resolveShellNav(AA, null, programStaff));
    expect(forStaff.bar.map((d) => d.key)).toContain("programs");
    expect(forStaff.bar.map((d) => d.key)).not.toContain("fundraising");
    expect(forStaff.more.map((d) => d.key)).not.toContain("programs");
  });

  test("every bar and More entry carries a live href (no dead links on any org)", () => {
    for (const features of [AA, NINE_KEY]) {
      const { bar, more } = shellMobileSplit(resolveShellNav(features));
      for (const d of [...bar, ...more]) expect(d.href, d.key).toBeTruthy();
    }
  });

  test("the bar order is pinned: Today, Work, Fundraising (the + and More are chrome)", () => {
    expect(MOBILE_BAR_KEYS).toEqual(["home", "work", "fundraising"]);
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

  test("V4 A2 (spec §8): the centre is Capture with ai.capture, the ＋ sheet without it", () => {
    expect(src).toMatch(/\{captureEnabled \? \(/);
    expect(src).toMatch(/aria-label="Capture"/);
    expect(src).toMatch(/onClick=\{\(\) => setModal\("record"\)\}/);
    expect(src).toMatch(/aria-label="Quick actions"/);
    // The ＋ sheet's Add task stays reachable for capture orgs via More.
    expect(src.match(/setModal\("task"\)/g)?.length).toBeGreaterThanOrEqual(2);
    // No V1 messages path from the bar.
    expect(src).not.toMatch(/"\/admin\/messages"/);
  });
});
