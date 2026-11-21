import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveShellNav } from "@/lib/admin/v2shellNav";
import { visibleSettingsSections } from "@/lib/admin/settingsSections";
import { navHelp, navPageIndex } from "@/lib/admin/navIndex";
import { matchPages } from "@/app/admin/_components/search/types";

// V4 Stage A2 (spec §4): How-To and global search are generated from the nav
// model, so each org sees only its own destinations and tabs, under their
// current labels, and never the V1 product (audit finding 4).

const AA = [
  "aa.app", "aa.bv", "aa.demoday", "aa.hubspot_mirror", "aa.site_analytics", "aa.ygb",
  "ai.capture", "ai.reed", "modules.board", "modules.comms", "modules.compliance",
  "modules.content", "modules.documents", "modules.finance", "modules.fundraising",
  "modules.meetings", "modules.messages", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program", "modules.staff", "modules.strategy",
];
const NINE_KEY = [
  "modules.board", "modules.compliance", "modules.documents",
  "modules.finance", "modules.fundraising", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program",
];
const index = (f: string[], role: "owner" | "staff" = "owner") =>
  navPageIndex(resolveShellNav(f), visibleSettingsSections(role, f));

describe("global search's page list", () => {
  test("lists every visible tab with its live href, and nothing the org lacks", () => {
    const nine = index(NINE_KEY);
    const hrefs = nine.map((p) => p.href);
    expect(hrefs).toContain("/admin/fundraising/acknowledgments");
    expect(hrefs).not.toContain("/admin/comms/emails"); // no modules.comms
    expect(hrefs).not.toContain("/admin/impact/analytics"); // AA-only
    expect(hrefs).not.toContain("/admin/inbox/messages"); // no modules.messages
    expect(index(AA).map((p) => p.href)).toContain("/admin/comms/emails");
  });

  test("current labels only: no V1 names, no V1 paths, YGB nowhere", () => {
    for (const f of [AA, NINE_KEY]) {
      for (const p of index(f)) {
        expect(p.label).not.toMatch(/Command Center|Executive Briefing|YGB|Overview \(V1\)|Ask Log|Monday Plan|Students/);
        expect(p.href).not.toMatch(/^\/admin\/(ops|students|strategic-plan|briefing|ygb|demoday|meetings|cohorts|partners|board|compliance|analytics)(\/|$)/);
      }
    }
    expect(index(AA).find((p) => p.href === "/admin/inbox/messages")!.label).toBe("Team chat");
  });

  test("repeated tab labels carry their destination; Settings sections follow the role", () => {
    const labels = index(AA).map((p) => p.label);
    expect(labels).toContain("Fundraising Today");
    expect(labels).toContain("Finance Reports");
    expect(labels).toContain("Impact Reports");
    expect(labels).toContain("Today"); // Home's keeps the plain label
    expect(labels).toContain("Finance settings");
    expect(labels).toContain("Categorization rules");
    const staff = index(AA, "staff").map((p) => p.label);
    expect(staff).toContain("Settings");
    expect(staff).toContain("Help");
    expect(staff).not.toContain("Finance settings");
  });

  test("matchPages searches the generated list it is given", () => {
    const hits = matchPages("thank", index(NINE_KEY));
    expect(hits[0]?.href).toBe("/admin/fundraising/acknowledgments");
    expect(matchPages("ygb", index(NINE_KEY))).toEqual([]);
  });

  test("the hand-kept V1 PAGES list is gone and the layout feeds the generated one", () => {
    const types = readFileSync(join(__dirname, "..", "app", "admin", "_components", "search", "types.ts"), "utf8");
    expect(types).not.toMatch(/export const PAGES/);
    const layout = readFileSync(join(__dirname, "..", "app", "admin", "layout.tsx"), "utf8");
    expect(layout).toMatch(/<GlobalSearch pages=\{searchPages\} \/>/);
  });
});

describe("How-To", () => {
  test("one section per visible destination, Inbox last, current tab labels", () => {
    const aa = navHelp(resolveShellNav(AA));
    expect(aa.map((d) => d.label)).toEqual([
      "Home", "Work", "Programs", "Fundraising", "Comms", "Finance", "Impact", "Organization", "Inbox",
    ]);
    expect(aa.find((d) => d.key === "comms")!.tabs.map((t) => t.label)).toEqual(["Emails"]);
    const nine = navHelp(resolveShellNav(NINE_KEY));
    expect(nine.map((d) => d.key)).not.toContain("comms");
    expect(nine.find((d) => d.key === "organization")!.tabs.map((t) => t.label)).toEqual(["Board", "Compliance"]);
  });

  test("every visible tab has a plain-language description", () => {
    for (const d of navHelp(resolveShellNav(AA))) {
      expect(d.blurb, d.key).toBeTruthy();
      for (const t of d.tabs) expect(t.what, `${d.key}/${t.key}`).toBeTruthy();
    }
  });

  test("the page renders from the model: no V1 sections or labels left in its source", () => {
    const src = readFileSync(join(__dirname, "..", "app", "admin", "howto", "page.tsx"), "utf8");
    expect(src).toMatch(/navHelp\(resolveShellNav\(/);
    expect(src).not.toMatch(/label: "Command Center"|"Executive Briefing"|YGB Camp|href: "\/admin\//);
  });
});
