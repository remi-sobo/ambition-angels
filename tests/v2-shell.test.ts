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
      // Empty from Spec Impact I2 until V4 A2, which declared the approved
      // Comms tab row (spec §4). Stage D built Home, Stories, Editions and
      // Settings; Automations stays hidden until journeys get a page.
      "/admin/comms/automations",
    ]);
  });

  test("NO unbuilt merge seats remain (Spec Inbox X2): every canonical tab seats itself", () => {
    // The rule ("a merge seat resolves to its first live V1 source") is now
    // vacuously satisfied — Today (H3), donors-funders/pipeline (F6),
    // plan-close (W4), and finally messages (X2) all graduated. Asserted
    // exhaustively: every tab in the model resolves to its own canonical
    // path.
    for (const d of [...V2_DESTINATIONS, V2_INBOX]) {
      for (const t of d.tabs) {
        // V4 A2: Comms' unbuilt tabs are seatless (pinned above), not merges.
        if (liveSeatFor(t.href) === null) continue;
        expect(liveSeatFor(t.href), t.href).toBe(t.href);
      }
    }
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
      "/admin/today",               // ACTIVE target since H3
      "/admin/organization-health", // V2-only screen: its own path IS the seat (H3)
      "/admin/fundraising/donors-funders", // ACTIVE target since F6
      "/admin/fundraising/pipeline",       // ACTIVE target since F6
      "/admin/work/plan-close",            // ACTIVE target since W4
      "/admin/comms/emails",               // ACTIVE target since V4 A2
      "/admin/fundraising/acknowledgments", // kept in place again at V4 A2 (Thank-yous)
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

  test("Home is visible for every org and lands on Today (cut over at H3)", () => {
    for (const features of [AA, YGB, NINE_KEY]) {
      const home = resolveShellNav(features).destinations.find((d) => d.key === "home")!;
      expect(home.href).toBe("/admin/today");
      expect(home.tabs.map((t) => t.key)).toEqual(["today", "organization-health"]);
    }
  });

  test("the 9-key deviation is RETIRED (Spec Impact I1): with Outcomes seated, the model's landing holds for every org", () => {
    // Until I1, the 9-key orgs landed Impact on KPIs because Outcomes had no
    // screen — a stated deviation this test used to pin. Building the screen
    // is what retires it.
    for (const features of [AA, YGB, NINE_KEY]) {
      const impact = resolveShellNav(features).destinations.find((d) => d.key === "impact")!;
      expect(impact.href).toBe("/admin/impact/outcomes");
    }
    const nine = resolveShellNav(NINE_KEY).destinations.find((d) => d.key === "impact")!;
    // Reports joined at I2; Analytics stays AA-only (aa.site_analytics).
    expect(nine.tabs.map((t) => t.key)).toEqual(["outcomes", "kpis", "reports"]);
  });

  test("9-key orgs: Work lands on Plan & Close itself (W4); Inbox keeps only its own tab", () => {
    const nav = resolveShellNav(NINE_KEY);
    expect(nav.destinations.find((d) => d.key === "work")!.href).toBe("/admin/work/plan-close");
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
    // V4 A2: Comms owns its seat, its children and the old Fundraising path.
    expect(activeShellKey("/admin/comms/emails", nav)).toBe("comms");
    expect(activeShellKey(`/admin/comms/emails/${UUID}`, nav)).toBe("comms");
    expect(activeShellKey("/admin/fundraising/comms", nav)).toBe("comms");
    expect(activeShellKey("/admin/fundraising/acknowledgments", nav)).toBe("fundraising");
  });

  test("/admin matches Home EXACTLY — never as a prefix of everything", () => {
    expect(activeShellKey("/admin", nav)).toBe("home");
    expect(activeShellKey("/admin/settings", nav)).toBeNull();
    expect(activeShellKey("/admin/howto", nav)).toBeNull();
    expect(activeShellKey("/admin/settings/finance/rules", nav)).toBeNull();
  });

  test("absorbed and at-cutover paths highlight their destination", () => {
    expect(activeShellKey("/admin/today", nav)).toBe("home");
    expect(activeShellKey("/admin/organization-health", nav)).toBe("home");
    expect(activeShellKey("/admin/queue", nav)).toBe("home"); // ACTIVE since H3
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
  test("ALL destinations AND the Inbox utility are cut over — the V1 tab-slot fallback fires nowhere", () => {
    expect(Array.from(V2_CUTOVER_DESTINATIONS)).toEqual([
      "home", "fundraising", "finance", "work", "programs", "impact", "organization", "inbox",
    ]);
  });

  test("Inbox's tab rows (X2): Inbox · Messages for AA/YGB; the 9-key single tab pinned above", () => {
    for (const features of [AA, YGB]) {
      const inbox = resolveShellNav(features).inbox!;
      expect(inbox.href).toBe("/admin/inbox");
      expect(inbox.tabs.map((t) => t.key)).toEqual(["inbox", "messages"]);
      expect(inbox.tabs.find((t) => t.key === "messages")!.href).toBe("/admin/inbox/messages");
    }
  });

  test("Organization's tab rows (O2, DoD 1): four tabs landing Strategy for AA/YGB; the 9-key pair pinned above", () => {
    for (const features of [AA, YGB]) {
      const org = resolveShellNav(features).destinations.find((d) => d.key === "organization")!;
      expect(org.href).toBe("/admin/organization/strategy");
      expect(org.tabs.map((t) => t.key)).toEqual(["strategy", "team", "board", "compliance"]);
    }
  });

  test("Impact lands on Outcomes — four tabs for AA, three without aa.site_analytics (I4, DoD 1)", () => {
    const aa = resolveShellNav(AA).destinations.find((d) => d.key === "impact")!;
    expect(aa.href).toBe("/admin/impact/outcomes");
    expect(aa.tabs.map((t) => t.key)).toEqual(["outcomes", "kpis", "analytics", "reports"]);
    for (const features of [YGB, NINE_KEY]) {
      const imp = resolveShellNav(features).destinations.find((d) => d.key === "impact")!;
      expect(imp.href).toBe("/admin/impact/outcomes");
      expect(imp.tabs.map((t) => t.key)).toEqual(["outcomes", "kpis", "reports"]);
    }
  });

  test("Programs lands on Overview — seven tabs for AA, six without modules.content (P4, DoD 1)", () => {
    const aa = resolveShellNav(AA).destinations.find((d) => d.key === "programs")!;
    expect(aa.href).toBe("/admin/programs/overview");
    expect(aa.tabs.map((t) => t.key)).toEqual([
      "overview", "people", "intake", "cohorts", "attendance", "partners", "content",
    ]);
    // YGB and the 9-key orgs lack modules.content: the Content tab vanishes
    // by the entitlement rule, everything else identical.
    for (const features of [YGB, NINE_KEY]) {
      const prog = resolveShellNav(features).destinations.find((d) => d.key === "programs")!;
      expect(prog.href).toBe("/admin/programs/overview");
      expect(prog.tabs.map((t) => t.key)).toEqual([
        "overview", "people", "intake", "cohorts", "attendance", "partners",
      ]);
    }
  });

  test("Work lands on Plan & Close with six tabs for AA/YGB, four for the 9-key orgs (W4, DoD 1)", () => {
    for (const features of [AA, YGB]) {
      const work = resolveShellNav(features).destinations.find((d) => d.key === "work")!;
      expect(work.href).toBe("/admin/work/plan-close");
      expect(work.tabs.map((t) => t.key)).toEqual([
        "plan-close", "my-week", "tasks", "projects", "meetings", "documents",
      ]);
    }
    // No modules.meetings → My Week and Meetings vanish by the entitlement
    // rule (never dead-link), and the landing stays Plan & Close.
    const nine = resolveShellNav(NINE_KEY).destinations.find((d) => d.key === "work")!;
    expect(nine.href).toBe("/admin/work/plan-close");
    expect(nine.tabs.map((t) => t.key)).toEqual([
      "plan-close", "tasks", "projects", "documents",
    ]);
  });

  test("Finance lands on Snapshot with the five-tab V2 row for every org (N4)", () => {
    for (const features of [AA, YGB, NINE_KEY]) {
      const fin = resolveShellNav(features).destinations.find((d) => d.key === "finance")!;
      expect(fin.href).toBe("/admin/finance/snapshot");
      expect(fin.tabs.map((t) => t.key)).toEqual([
        "snapshot", "transactions", "budget", "forecast", "reports",
      ]);
    }
  });

  test("Fundraising lands on Today's Moves with six tabs for every org; Thank-yous replaced Comms (V4 A2)", () => {
    for (const features of [AA, YGB, NINE_KEY]) {
      const fr = resolveShellNav(features).destinations.find((d) => d.key === "fundraising")!;
      expect(fr.href).toBe("/admin/fundraising/today");
      expect(fr.tabs.map((t) => t.key)).toEqual([
        "today", "donors-funders", "pipeline", "grants", "campaigns", "thank-yous",
      ]);
      expect(fr.tabs.find((t) => t.key === "thank-yous")!.href).toBe("/admin/fundraising/acknowledgments");
    }
  });

  test("Comms (V4 §4, Stage D): its own destination with modules.comms, landing on Home; Automations hidden", () => {
    for (const features of [AA, YGB]) {
      const nav = resolveShellNav(features);
      expect(nav.destinations.map((d) => d.key)).toEqual([
        "home", "work", "programs", "fundraising", "comms", "finance", "impact", "organization",
      ]);
      const comms = nav.destinations.find((d) => d.key === "comms")!;
      expect(comms.href).toBe("/admin/comms/home");
      expect(comms.tabs.map((t) => t.label)).toEqual(["Home", "Stories", "Editions", "Emails", "Settings"]);
    }
    // No modules.comms → no Comms destination at all (the 9-key orgs).
    expect(resolveShellNav(NINE_KEY).destinations.map((d) => d.key)).not.toContain("comms");
  });

  test("Inbox's second tab reads Team chat in the shell too (V4 §4)", () => {
    const inbox = resolveShellNav(AA).inbox!;
    expect(inbox.tabs.map((t) => t.label)).toEqual(["Inbox", "Team chat"]);
  });

  test("DoD 7 structurally: the V2 tab row cannot wrap at any tenant's tab count", () => {
    // Visual System V3 §5 moved the tab row onto the shared <Tabs> primitive
    // (text + underline, no capsules), so the no-wrap invariant now lives
    // there. Both halves are asserted: the zone must route through the
    // primitive, and the primitive must carry the invariant.
    const zone = readFileSync(
      join(__dirname, "..", "app", "admin", "_components", "v2", "V2TabZone.tsx"),
      "utf8",
    );
    expect(zone).toMatch(/from "\.\.\/ui\/Tabs"/);
    expect(zone).toMatch(/<Tabs\b/);

    const tabs = readFileSync(
      join(__dirname, "..", "app", "admin", "_components", "ui", "Tabs.tsx"),
      "utf8",
    );
    expect(tabs).toMatch(/flex-nowrap/);
    expect(tabs).toMatch(/overflow-x-auto/);
    expect(tabs).toMatch(/shrink-0/); // tabs may scroll, never shrink or stack
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

describe("V4 A2: no dead links in the persistent chrome", () => {
  const app = join(__dirname, "..", "app");
  const read = (...p: string[]) => readFileSync(join(app, ...p), "utf8");
  // A literal /admin href resolves when a page.tsx exists for it, or when it
  // is an active redirect source (one hop to a live host).
  const pageExists = (href: string) => {
    const path = href.split(/[?#]/)[0];
    return existsSync(join(app, ...path.split("/").filter(Boolean), "page.tsx"));
  };

  test("the sidebar footer no longer links the deleted /admin/v2 page (audit finding 5)", () => {
    const src = read("admin", "_components", "v2", "V2Sidebar.tsx");
    expect(src).not.toMatch(/\/admin\/v2["'`]/);
  });

  test("every literal /admin href in the shell chrome opens a page that exists", () => {
    for (const file of ["V2Sidebar.tsx", "V2MobileBar.tsx", "V2QuickAdd.tsx", "V2TabZone.tsx"]) {
      const src = read("admin", "_components", "v2", file);
      for (const m of Array.from(src.matchAll(/["'`](\/admin[^"'`$]*)["'`]/g))) {
        const href = m[1];
        if (href === "/admin") continue; // the auth-aware Home forward
        if (/\.(png|svg|webp|ico)$/.test(href)) continue; // public assets, not pages
        expect(pageExists(href), `${file} links ${href}`).toBe(true);
      }
    }
  });

  // V4 B2: the overview widgets (RecentDonationsWidget among them) were dead
  // and are deleted. Quiz submissions (/admin/legacy) keep a live link from
  // Settings → Organization instead (tests/settings-home.test.ts).
  test("the deleted overview widgets stay deleted", () => {
    expect(existsSync(join(__dirname, "..", "app", "admin", "_components", "overview"))).toBe(false);
  });

  test("Settings is a sidebar row (active under /admin/settings/*); Help is the footer link", () => {
    const src = read("admin", "_components", "v2", "V2Sidebar.tsx");
    expect(src).toMatch(/href="\/admin\/settings"/);
    expect(src).toMatch(/pathname\.startsWith\("\/admin\/settings\/"\)/);
    expect(src).toMatch(/href="\/admin\/settings\/help"/);
  });
});

describe("V4 A2: the page frame", () => {
  const app = join(__dirname, "..", "app");
  test("desktop: espresso shell, flush sidebar, the working surface is one inset rounded panel", () => {
    const layout = readFileSync(join(app, "admin", "layout.tsx"), "utf8");
    expect(layout).toMatch(/lg:bg-navy/);
    expect(layout).toMatch(/admin-main admin-panel/);
    const css = readFileSync(join(app, "globals.css"), "utf8");
    const panel = css.slice(css.indexOf(".admin-panel {"), css.indexOf("}", css.indexOf(".admin-panel {")));
    expect(panel).toMatch(/margin: calc\(10px \+ env\(safe-area-inset-top\)\) 10px 10px 0/);
    expect(panel).toMatch(/border-radius: var\(--radius-modal\)/); // 18px
    expect(panel).toMatch(/overflow-y: auto/);
    const sidebar = readFileSync(join(app, "admin", "_components", "v2", "V2Sidebar.tsx"), "utf8");
    expect(sidebar).toMatch(/hidden lg:flex w-\[248px\] shrink-0 bg-navy/);
  });

  test("phone: the tab row scrolls inside its own clipped box with a trailing fade", () => {
    const zone = readFileSync(join(app, "admin", "_components", "v2", "V2TabZone.tsx"), "utf8");
    expect(zone).toMatch(/overflow-hidden/);
    expect(zone).toMatch(/data-tab-fade/);
    expect(zone).toMatch(/bg-gradient-to-l from-app/);
  });
});
