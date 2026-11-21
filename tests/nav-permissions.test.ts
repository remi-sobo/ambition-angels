import { describe, expect, test, vi } from "vitest";
import { seededRolePermissions } from "./support/roleSeed";

// requirePermission.ts imports lib/admin/auth, which wraps reads in React's
// server-only cache(); the value import below needs it to be a pass-through.
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: <T,>(fn: T) => fn };
});
import { MODULE_PERMISSIONS } from "@/lib/admin/requirePermission";
import { FEATURE_MODULE, MODULE_READ, tabPermission } from "@/lib/admin/navPermissions";
import { V2_DESTINATIONS, V2_INBOX } from "@/lib/admin/nav";
import { resolveShellNav, shellMobileSplit } from "@/lib/admin/v2shellNav";
import { navPageIndex } from "@/lib/admin/navIndex";

// V4 A2: the nav hides destinations and tabs the ROLE cannot open, using the
// same module map as the #593 server guard (lib/admin/requirePermission.ts).
// Role permission sets are the seeded role_permissions rows.

const ALL = [
  "aa.coach", "aa.site_analytics", "modules.board", "modules.comms", "modules.compliance",
  "modules.content", "modules.documents", "modules.finance", "modules.fundraising",
  "modules.meetings", "modules.messages", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program", "modules.staff", "modules.strategy",
];
// The migrations' own seed, so a role change is reflected here.
const seed = seededRolePermissions();
const permsOf = (role: string) => seed.filter((r) => r.role === role).map((r) => r.permission);
const STAFF = permsOf("staff");
const FINANCE = permsOf("finance");
const BOARD = permsOf("board_viewer");

describe("the nav's permission map follows the server guard", () => {
  test("MODULE_READ is MODULE_PERMISSIONS[module].read, row for row", () => {
    for (const [mod, perms] of Object.entries(MODULE_PERMISSIONS)) {
      expect(MODULE_READ[mod as keyof typeof MODULE_READ], mod).toBe(perms.read);
    }
    expect(Object.keys(MODULE_READ).sort()).toEqual(Object.keys(MODULE_PERMISSIONS).sort());
  });

  test("every gated tab in the model has a permission (no tab slips past the filter)", () => {
    for (const d of [...V2_DESTINATIONS, V2_INBOX]) {
      for (const t of d.tabs) {
        if (t.feature) expect(tabPermission(t.feature), `${d.key}/${t.key} (${t.feature})`).not.toBeNull();
      }
    }
    expect(FEATURE_MODULE["modules.strategy"]).toBe("strategy");
  });
});

describe("resolveShellNav with role permissions", () => {
  const keys = (perms: string[] | null) => resolveShellNav(ALL, null, perms).destinations.map((d) => d.key);

  test("no permissions passed = no role filter (pre-auth and the per-org fixtures)", () => {
    expect(keys(null)).toEqual(["home", "work", "programs", "fundraising", "comms", "finance", "impact", "organization"]);
  });

  test("finance role: no Programs, Fundraising or Comms; Work is Documents only; Organization keeps Team and Compliance", () => {
    expect(keys(FINANCE)).toEqual(["home", "work", "finance", "impact", "organization"]);
    const work = resolveShellNav(ALL, null, FINANCE).destinations.find((d) => d.key === "work")!;
    expect(work.tabs.map((t) => t.key)).toEqual(["documents"]);
    const org = resolveShellNav(ALL, null, FINANCE).destinations.find((d) => d.key === "organization")!;
    expect(org.tabs.map((t) => t.key)).toEqual(["strategy", "team", "compliance"]);
  });

  test("board viewer: Home, Impact, Organization (no Compliance), Inbox without Team chat", () => {
    const nav = resolveShellNav(ALL, null, BOARD);
    expect(nav.destinations.map((d) => d.key)).toEqual(["home", "impact", "organization"]);
    expect(nav.destinations.find((d) => d.key === "organization")!.tabs.map((t) => t.key)).toEqual([
      "strategy", "team", "board",
    ]);
    expect(nav.inbox!.tabs.map((t) => t.key)).toEqual(["inbox"]);
    // The mobile bar and search follow, by construction.
    expect(shellMobileSplit(nav).bar.map((d) => d.key)).toEqual(["home"]);
    expect(navPageIndex(nav).map((p) => p.href)).not.toContain("/admin/finance/snapshot");
  });

  test("staff: everything but Board", () => {
    const nav = resolveShellNav(ALL, null, STAFF);
    expect(nav.destinations.map((d) => d.key)).toEqual([
      "home", "work", "programs", "fundraising", "comms", "finance", "impact", "organization",
    ]);
    expect(nav.destinations.find((d) => d.key === "organization")!.tabs.map((t) => t.key)).toEqual([
      "strategy", "team", "compliance",
    ]);
  });
});
