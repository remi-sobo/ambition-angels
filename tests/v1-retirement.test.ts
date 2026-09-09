import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as nav from "@/lib/admin/nav";

// Spec B's named cleanup, discharged: "when V1 retires, NAV_SECTIONS (and
// visibleSections(), and every V1-only consumer) must be DELETED, not left
// as a second source of truth — two live nav models drift." The last
// destination cut over at Spec Inbox X2; this file is the record that the
// delete landed, and the guard that nothing resurrects it.

const root = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("the V1 nav model is DELETED (Spec B's named cleanup)", () => {
  test("nav.ts exports exactly one model — no NAV_SECTIONS, no V1 resolvers", () => {
    const exports = Object.keys(nav);
    for (const gone of ["NAV_SECTIONS", "visibleSections", "resolveSectionNav", "activeHref", "activeTabIndex"]) {
      expect(exports, `${gone} must stay deleted`).not.toContain(gone);
    }
    // The V2 model and the shared pieces survive.
    for (const kept of ["V2_DESTINATIONS", "V2_INBOX", "resolveV2Destination", "resolveV2Nav", "itemLabel"]) {
      expect(exports).toContain(kept);
    }
  });

  test("every V1-only chrome component is off disk", () => {
    for (const p of [
      ["app", "admin", "_components", "Sidebar.tsx"],
      ["app", "admin", "_components", "SectionSubNav.tsx"],
      ["app", "admin", "_components", "MobileTabBar.tsx"],
      ["app", "admin", "_components", "QuickAddButton.tsx"],
      ["app", "admin", "_components", "AskReedButton.tsx"],
      ["app", "admin", "_components", "rail", "Rail.tsx"],
      ["app", "admin", "v2", "page.tsx"], // the flag page went with the flag
      ["lib", "admin", "v2shell.ts"],
    ]) {
      expect(existsSync(join(root, ...p)), p.join("/")).toBe(false);
    }
    // The shared survivors moved, not died: the icon set (both chromes drew
    // it) and the entity context (profiles pin the rail-era provider).
    expect(existsSync(join(root, "app", "admin", "_components", "Icon.tsx"))).toBe(true);
    expect(existsSync(join(root, "app", "admin", "_components", "rail", "RailEntityContext.tsx"))).toBe(true);
  });

  test("the layout renders ONE chrome — no flag, no V1 branch, bare login pre-auth", () => {
    const s = read("app", "admin", "layout.tsx");
    // Comments may EULOGIZE the dead components; imports and JSX may not
    // resurrect them.
    expect(s).not.toMatch(/getV2ShellEnabled/);
    expect(s).not.toMatch(/from "\.\/_components\/(Sidebar|SectionSubNav|MobileTabBar|QuickAddButton|AskReedButton)"|from "\.\/_components\/rail\/Rail"/);
    expect(s).not.toMatch(/<(Sidebar|SectionSubNav|MobileTabBar|QuickAddButton|AskReedButton|Rail)[\s/>]/);
    expect(s).toMatch(/if \(authed\) \{/);
    expect(s).toMatch(/<V2Sidebar/);
  });

  test("the tab zone never falls back: one row, or nothing until a path's destination exists", () => {
    const s = read("app", "admin", "_components", "v2", "V2TabZone.tsx");
    expect(s).not.toMatch(/import SectionSubNav|<SectionSubNav/);
    expect(s).toMatch(/if \(!dest\) return null;/);
    expect(s).toMatch(/return <V2TabRow dest=\{dest\} pathname=\{pathname\} \/>;/);
  });
});
