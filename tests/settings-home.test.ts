import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SETTINGS_SECTIONS, sectionForPath, visibleSettingsSections } from "@/lib/admin/settingsSections";

// V4 Stage A2 — the Settings home (specs/bloomos-v4-product-readiness.md §4,
// §5): a left list of sections, filtered by role and by the org's modules,
// each section linking the setup screens that already exist.

const AA = [
  "aa.hubspot_mirror", "ai.capture", "ai.reed", "modules.board", "modules.comms",
  "modules.compliance", "modules.documents", "modules.finance", "modules.fundraising",
  "modules.meetings", "modules.messages", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program", "modules.staff", "modules.strategy",
];
const NINE_KEY = [
  "modules.board", "modules.compliance", "modules.documents",
  "modules.finance", "modules.fundraising", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program",
];
const keys = (role: Parameters<typeof visibleSettingsSections>[0], f: string[] | null) =>
  visibleSettingsSections(role, f).map((s) => s.key);

describe("the sections (spec §4 order)", () => {
  test("owner sees every section, in the approved order, with Your account first", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual([
      "Your account", "Organization", "People and roles", "Terms", "Modules",
      "Connections", "Fundraising", "Finance", "Imports", "Help",
    ]);
    expect(keys("owner", AA)).toEqual(SETTINGS_SECTIONS.map((s) => s.key));
  });

  test("role gating: admin = owner; finance gets Finance; staff and board see only their account and Help", () => {
    expect(keys("admin", AA)).toEqual(keys("owner", AA));
    expect(keys("finance", AA)).toEqual(["account", "finance", "help"]);
    expect(keys("staff", AA)).toEqual(["account", "help"]);
    expect(keys("board_viewer", AA)).toEqual(["account", "help"]);
    expect(keys(null, null)).toEqual(["account", "help"]);
  });

  test("module gating: a section and a link vanish with the module that backs them", () => {
    const fin = visibleSettingsSections("owner", ["modules.program"]);
    expect(fin.map((s) => s.key)).not.toContain("finance");
    expect(fin.map((s) => s.key)).not.toContain("fundraising");
    const imports = fin.find((s) => s.key === "imports")!;
    expect(imports.links.map((l) => l.label)).toEqual(["Import a CSV"]);
    // HubSpot rows are AA-only (aa.hubspot_mirror); Gmail rides modules.comms.
    const conn = visibleSettingsSections("owner", NINE_KEY).find((s) => s.key === "connections")!;
    expect(conn.links.map((l) => l.label)).toEqual(["Google Calendar"]);
    const aaConn = visibleSettingsSections("owner", AA).find((s) => s.key === "connections")!;
    expect(aaConn.links.map((l) => l.label)).toEqual([
      "Gmail for emails", "Google Calendar", "HubSpot", "HubSpot sync settings",
    ]);
  });

  test("sections with no screen yet say so honestly and name who to ask (no fake forms)", () => {
    for (const key of ["organization", "terms", "modules"]) {
      const s = SETTINGS_SECTIONS.find((x) => x.key === key)!;
      expect(s.comingNext, key).toMatch(/coming in the next stage/);
      expect(s.comingNext, key).toMatch(/ask your BloomOS contact/);
    }
    // People and roles has its screen now (V4 Stage A3).
    expect(SETTINGS_SECTIONS.find((x) => x.key === "people")!.comingNext).toBeUndefined();
  });

  test("each section links the existing scattered setup screens (audit finding 3)", () => {
    const hrefs = (key: string) => SETTINGS_SECTIONS.find((s) => s.key === key)!.links.map((l) => l.href);
    expect(hrefs("fundraising")).toEqual([
      "/admin/settings/fundraising/general",
      "/admin/settings/fundraising/stages",
      "/admin/settings/fundraising/duplicates",
      "/admin/fundraising/acknowledgments/templates",
      "/admin/settings/imports/donors",
    ]);
    expect(hrefs("finance")).toEqual([
      "/admin/settings/finance/rules",
      "/admin/settings/finance/config",
      "/admin/settings/finance/upload",
      "/admin/settings/finance/budget-import",
    ]);
    expect(hrefs("organization")).toEqual([
      "/admin/settings/organization/booking-page",
      "/admin/settings/organization/strategy-setup",
    ]);
  });

  test("every section and every link opens a page that exists on disk", () => {
    const app = join(__dirname, "..", "app");
    for (const s of SETTINGS_SECTIONS) {
      for (const href of [s.href, ...s.links.map((l) => l.href)]) {
        const path = href.split(/[?#]/)[0];
        const page = join(app, ...path.split("/").filter(Boolean), "page.tsx");
        expect(existsSync(page), `${s.key}: ${href}`).toBe(true);
      }
    }
  });

  test("the account page carries the anchors Connections links to", () => {
    const src = readFileSync(join(__dirname, "..", "app", "admin", "settings", "page.tsx"), "utf8");
    expect(src).toMatch(/id="google-calendar"/);
    expect(src).toMatch(/id="data-sources"/);
  });
});

describe("sectionForPath: the left list highlights the section a moved screen belongs to", () => {
  const sections = visibleSettingsSections("owner", AA);
  test("section pages, their moved screens, and the account root", () => {
    expect(sectionForPath("/admin/settings", sections)!.key).toBe("account");
    expect(sectionForPath("/admin/settings/finance", sections)!.key).toBe("finance");
    expect(sectionForPath("/admin/settings/finance/rules", sections)!.key).toBe("finance");
    expect(sectionForPath("/admin/settings/organization/booking-page", sections)!.key).toBe("organization");
    expect(sectionForPath("/admin/settings/help", sections)!.key).toBe("help");
  });
  test("a section the person cannot see never highlights", () => {
    const staff = visibleSettingsSections("staff", AA);
    expect(sectionForPath("/admin/settings/finance/rules", staff)).toBeNull();
  });
});
