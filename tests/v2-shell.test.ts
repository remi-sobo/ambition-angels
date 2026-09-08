import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { V2_DESTINATIONS, V2_INBOX } from "@/lib/admin/nav";
import { canonicalSeat, liveSeatFor } from "@/lib/admin/v2routes";
import {
  V2_CUTOVER_DESTINATIONS,
  activeShellKey,
  resolveShellNav,
} from "@/lib/admin/v2shellNav";

// Spec B, stage B3 — the shell's navigation resolution: B1's model × B2's
// map. Fixtures are the four live orgs' key sets (as in tests/nav-v2.test.ts).

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
const YGB = [
  "ai.prospect_research", "ai.reed", "coaching",
  "modules.board", "modules.comms", "modules.compliance", "modules.documents",
  "modules.finance", "modules.fundraising", "modules.meetings",
  "modules.messages", "modules.metrics", "modules.ops", "modules.partners",
  "modules.program", "modules.reviews", "modules.staff", "modules.strategy",
];
const NINE_KEY = [
  "modules.board", "modules.compliance", "modules.documents",
  "modules.finance", "modules.fundraising", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program",
];

describe("liveSeatFor: every canonical tab route resolves to a screen that exists", () => {
  test("the seatless set is pinned — it only SHRINKS (a destination spec building the screen removes its entry)", () => {
    const seatless: string[] = [];
    for (const d of [...V2_DESTINATIONS, V2_INBOX]) {
      for (const t of d.tabs) {
        if (liveSeatFor(t.href) === null) seatless.push(t.href);
      }
    }
    expect(seatless.sort()).toEqual([
      "/admin/impact/outcomes",       // Impact spec builds Outcomes
      "/admin/impact/reports",        // Impact spec builds Reports
      "/admin/organization-health",   // Home spec builds Organization Health
      "/admin/programs/attendance",   // Programs spec builds Attendance
    ]);
  });

  test("merge seats resolve to their FIRST live V1 source in map order", () => {
    expect(liveSeatFor("/admin/today")).toBe("/admin"); // Home's seat is the V1 cockpit
    expect(liveSeatFor("/admin/work/plan-close")).toBe("/admin/ops/monday");
    expect(liveSeatFor("/admin/fundraising/donors-funders")).toBe("/admin/fundraising/donors");
    expect(liveSeatFor("/admin/fundraising/pipeline")).toBe("/admin/fundraising/asks");
    expect(liveSeatFor("/admin/inbox/messages")).toBe("/admin/messages");
  });

  test("active hosts and kept-in-place paths resolve to themselves", () => {
    for (const path of [
      "/admin/work/tasks",
      "/admin/organization/strategy",
      "/admin/programs/people",
      "/admin/finance/snapshot",
      "/admin/fundraising/today",
      "/admin/fundraising/grants",
      "/admin/fundraising/campaigns",
      "/admin/finance/budget",
      "/admin/finance/transactions", // same-path at-cutover row
      "/admin/finance/forecast",
      "/admin/inbox",
    ]) {
      expect(liveSeatFor(path), path).toBe(path);
    }
  });

  test("every rendered shell tab opens a page.tsx that exists on disk (no dead links, any org)", () => {
    const app = join(__dirname, "..", "app");
    const nav = resolveShellNav(AA); // AA renders the superset of tabs
    const all = [...nav.destinations, ...(nav.inbox ? [nav.inbox] : [])];
    for (const dest of all) {
      for (const tab of dest.tabs) {
        const page = join(app, ...tab.href.split("/").filter(Boolean), "page.tsx");
        expect(existsSync(page), `${dest.key}/${tab.key} links ${tab.href} — missing ${page}`).toBe(true);
      }
    }
  });
});

describe("resolveShellNav: the four orgs (DoD 1, shell level)", () => {
  test("Organization lands on Strategy for AA and YGB, on Board for the 9-key orgs", () => {
    for (const features of [AA, YGB]) {
      const org = resolveShellNav(features).destinations.find((d) => d.key === "organization")!;
      expect(org.href).toBe("/admin/organization/strategy");
    }
    const nine = resolveShellNav(NINE_KEY).destinations.find((d) => d.key === "organization")!;
    expect(nine.href).toBe("/admin/organization/board");
    expect(nine.tabs.map((t) => t.key)).toEqual(["board", "compliance"]);
  });

  test("Home is visible for every org and lands on the V1 cockpit pre-cutover", () => {
    for (const features of [AA, YGB, NINE_KEY]) {
      const home = resolveShellNav(features).destinations.find((d) => d.key === "home")!;
      expect(home.href).toBe("/admin");
    }
  });

  test("pre-cutover deviation, stated: the 9-key orgs' Impact lands on KPIs (the model lands Outcomes, whose screen doesn't exist yet)", () => {
    const impact = resolveShellNav(NINE_KEY).destinations.find((d) => d.key === "impact")!;
    expect(impact.href).toBe("/admin/impact/kpis");
    expect(impact.tabs.map((t) => t.key)).toEqual(["kpis"]);
  });

  test("9-key orgs: Work lands on Plan & Close's live seat; Inbox keeps only its own tab", () => {
    const nav = resolveShellNav(NINE_KEY);
    expect(nav.destinations.find((d) => d.key === "work")!.href).toBe("/admin/ops/monday");
    expect(nav.inbox!.tabs.map((t) => t.key)).toEqual(["inbox"]);
  });

  test("no shell tab ever carries a null/empty href", () => {
    for (const features of [AA, YGB, NINE_KEY]) {
      const nav = resolveShellNav(features);
      for (const d of [...nav.destinations, ...(nav.inbox ? [nav.inbox] : [])]) {
        for (const t of d.tabs) expect(t.href, `${d.key}/${t.key}`).toBeTruthy();
      }
    }
  });
});

describe("activeShellKey: sidebar highlight + tab-slot routing", () => {
  const nav = resolveShellNav(AA);
  const UUID = "0f68ab8c-1111-4222-8333-944444444444";

  test("live seats, their children, and canonical translations all map to their destination", () => {
    expect(activeShellKey("/admin/work/tasks", nav)).toBe("work");
    expect(activeShellKey("/admin/ops", nav)).toBe("work"); // canonical translation
    expect(activeShellKey("/admin/ops/monday", nav)).toBe("work");
    expect(activeShellKey(`/admin/fundraising/donors/${UUID}`, nav)).toBe("fundraising");
    expect(activeShellKey("/admin/programs/people", nav)).toBe("programs");
    expect(activeShellKey("/admin/organization/board", nav)).toBe("organization");
    expect(activeShellKey("/admin/messages", nav)).toBe("inbox");
    expect(activeShellKey("/admin/inbox", nav)).toBe("inbox");
  });

  test("/admin matches Home EXACTLY — never as a prefix of everything", () => {
    expect(activeShellKey("/admin", nav)).toBe("home");
    expect(activeShellKey("/admin/settings", nav)).toBeNull();
    expect(activeShellKey("/admin/howto", nav)).toBeNull();
  });

  test("at-cutover merges highlight the destination that will absorb them", () => {
    expect(activeShellKey("/admin/queue", nav)).toBe("home");
    expect(activeShellKey("/admin/briefing", nav)).toBe("home");
    expect(activeShellKey("/admin/fundraising/prospects", nav)).toBe("fundraising");
    expect(activeShellKey("/admin/finance/reconcile", nav)).toBe("finance");
  });

  test("canonicalSeat is a highlighting read: it may name unbuilt seats, and nothing links through it", () => {
    expect(canonicalSeat("/admin/queue")).toBe("/admin/today");
    expect(canonicalSeat("/admin/ops")).toBe("/admin/work/tasks");
    expect(canonicalSeat("/admin/settings")).toBe("/admin/settings");
  });
});

describe("B3 shell invariants", () => {
  test("no destination has cut over yet — the tab slot renders the V1 secondary nav everywhere", () => {
    expect(V2_CUTOVER_DESTINATIONS.size).toBe(0);
  });

  test("DoD 7 structurally: the V2 tab row cannot wrap at any tenant's tab count", () => {
    const src = readFileSync(
      join(__dirname, "..", "app", "admin", "_components", "v2", "V2TabZone.tsx"),
      "utf8",
    );
    expect(src).toMatch(/flex-nowrap/);
    expect(src).toMatch(/overflow-x-auto/);
    expect(src).toMatch(/shrink-0/); // pills may scroll, never shrink or stack
  });

  test("DoD 6 structurally: the Reed edge launcher renders nothing without ai.reed", () => {
    const src = readFileSync(
      join(__dirname, "..", "app", "admin", "_components", "v2", "V2ReedEdge.tsx"),
      "utf8",
    );
    expect(src).toMatch(/if \(!reed\.enabled\) return null/);
    expect(src).toMatch(/hidden lg:flex/); // launcher hidden below 1024px
  });
});
