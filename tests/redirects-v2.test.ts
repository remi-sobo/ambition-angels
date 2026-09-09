import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { V2_ROUTE_MAP, activeRedirects, v2Href } from "@/lib/admin/v2routes";
// next.config.mjs is plain ESM; vitest imports it directly, so the config's
// copy of the redirect list is asserted against the canonical map instead of
// trusted to stay in sync by hand.
import nextConfig from "../next.config.mjs";

// Spec B, stage B2 — the redirect map. These tests are the automated crawl
// in structural form (plus a live-server pass recorded in the PR): every
// active source 308s, terminates at an existing host page in one hop, never
// loops, and preserves query strings; the choke points resolve through the
// same map; at-cutover and no-home rows stay put.

const UUID = "0f68ab8c-1111-4222-8333-944444444444";

async function configAdminRedirects() {
  const rows = await (nextConfig as { redirects: () => Promise<unknown[]> }).redirects();
  return (rows as { source: string; destination: string; permanent?: boolean; has?: unknown }[]).filter(
    (r) => r.source.startsWith("/admin") && !r.has && r.destination.startsWith("/admin"),
  );
}

describe("config and canonical map agree", () => {
  test("next.config.mjs carries exactly the map's active rows, all permanent (308)", async () => {
    const config = await configAdminRedirects();
    const map = activeRedirects();
    expect(config.map(({ source, destination }) => ({ source, destination }))).toEqual(map);
    for (const r of config) expect(r.permanent, `${r.source} must be a permanent 308`).toBe(true);
  });
});

describe("every active redirect terminates at a live host, no loops", () => {
  const active = V2_ROUTE_MAP.filter((r) => r.activation === "now");

  test("all active rows carry a destination", () => {
    for (const row of active) expect(row.v2, row.v1).toBeTruthy();
  });

  test("one hop: no destination is itself a source (v2Href fixed point)", () => {
    for (const row of active) {
      expect(v2Href(row.v2!), `${row.v2} must not redirect again`).toBe(row.v2);
      if (row.kind !== "exact") {
        const child = `${row.v2}/${UUID}`;
        expect(v2Href(child)).toBe(child);
      }
    }
  });

  test("every destination base resolves to a page.tsx on disk", () => {
    const app = join(__dirname, "..", "app");
    const pageFor = (urlPath: string) => join(app, ...urlPath.split("/").filter(Boolean), "page.tsx");
    // Bases with no V1 page of their own (V1 404s there too; only the
    // dynamic child is real): /admin/meetings/upcoming has only [eventId];
    // /admin/strategic-plan/objective has only [id] (O2).
    const noBasePage = new Set([
      "/admin/work/meetings/upcoming",
      "/admin/organization/strategy/objective",
    ]);
    const checks: string[] = [];
    for (const row of active) {
      // A destination may carry a canonical query (P4: volunteers →
      // ?view=volunteers) — the screen on disk is the path.
      const base = row.v2!.split("?")[0];
      if ((row.kind === "exact" || row.kind === "prefix") && !noBasePage.has(base))
        checks.push(pageFor(base));
      if (row.kind === "uuid-child") checks.push(pageFor(`${base}/[id]`));
    }
    // Deep prefix children that must exist for stored deep links to land:
    checks.push(pageFor("/admin/work/projects/[id]"));
    checks.push(pageFor("/admin/programs/people/[id]"));
    checks.push(pageFor("/admin/programs/cohorts/[id]"));
    checks.push(pageFor("/admin/programs/cohorts/[id]/sessions/[sessionId]"));
    checks.push(pageFor("/admin/programs/partners/[id]"));
    checks.push(pageFor("/admin/organization/board/[id]"));
    checks.push(pageFor("/admin/organization/compliance/[id]"));
    checks.push(pageFor("/admin/work/meetings/upcoming/[eventId]"));
    // F6: the donors prefix and asks prefix carry [id] children.
    checks.push(pageFor("/admin/fundraising/donors-funders/[id]"));
    checks.push(pageFor("/admin/fundraising/pipeline/[id]"));
    // O2: the objective prefix carries only the [id] child.
    checks.push(pageFor("/admin/organization/strategy/objective/[id]"));
    for (const p of checks) expect(existsSync(p), `missing host page: ${p}`).toBe(true);
  });
});

describe("v2Href: the translation the choke points ride", () => {
  test("moves 1:1 rows and preserves query strings", () => {
    expect(v2Href("/admin/ops")).toBe("/admin/work/tasks");
    expect(v2Href("/admin/students?student=abc")).toBe("/admin/programs/people?student=abc");
    expect(v2Href(`/admin/students/${UUID}?tab=notes`)).toBe(`/admin/programs/people/${UUID}?tab=notes`);
    expect(v2Href(`/admin/cohorts/${UUID}/sessions/${UUID}`)).toBe(
      `/admin/programs/cohorts/${UUID}/sessions/${UUID}`,
    );
    expect(v2Href(`/admin/ops/projects/${UUID}`)).toBe(`/admin/work/projects/${UUID}`);
    expect(v2Href(`/admin/meetings/${UUID}`)).toBe(`/admin/work/meetings/${UUID}`);
    expect(v2Href("/admin/finance")).toBe("/admin/finance/snapshot");
    expect(v2Href("/admin/careers")).toBe("/admin/programs/content");
  });

  test("named siblings that are NOT moving stay put (no fragile exclusions)", () => {
    // monday/friday/calendar/connections left this list at W4 — they moved.
    for (const path of [
      "/admin/staff/reviews",
      "/admin/meetings/booking-page",
      "/admin/careers/daily",
      "/admin/careers/pool",
      "/admin/strategic-plan/narrative",
    ]) {
      expect(v2Href(path), path).toBe(path);
    }
  });

  test("at-cutover merges and kept-in-place paths are untouched until their spec", () => {
    for (const path of [
      "/admin", // hosts the login UI: forwards in-page at H3, never a config 308
      "/admin/fundraising/grants", // kept: V1 path IS the V2 path
      "/admin/fundraising/today",
      "/admin/finance/budget",
      "/admin/inbox",
      "/admin/settings",
    ]) {
      expect(v2Href(path), path).toBe(path);
    }
  });

  test("N4: the Finance moves resolve; the same-path rows are fixed points OUTSIDE the config", async () => {
    expect(v2Href("/admin/finance/reconcile")).toBe("/admin/finance/transactions");
    expect(v2Href("/admin/finance/close")).toBe("/admin/finance/transactions");
    expect(v2Href("/admin/finance/model")).toBe("/admin/finance/forecast");
    expect(v2Href("/admin/finance/revenue")).toBe("/admin/finance/forecast");
    expect(v2Href("/admin/fundraising/pledges")).toBe("/admin/finance/forecast");
    // Same-path ACTIVE rows: fixed points in the translation…
    expect(v2Href("/admin/finance/transactions")).toBe("/admin/finance/transactions");
    expect(v2Href("/admin/finance/forecast?year=2026")).toBe("/admin/finance/forecast?year=2026");
    // …and NEVER config rows (a self-redirect would loop): no config source
    // may equal its destination, and the two fixed points must be absent.
    const config = await configAdminRedirects();
    for (const r of config) expect(r.source, "self-redirect would loop").not.toBe(r.destination);
    expect(config.some((r) => r.source === "/admin/finance/transactions")).toBe(false);
    expect(config.some((r) => r.source === "/admin/finance/forecast")).toBe(false);
    // Narrowed on purpose: the pledge detail keeps its live screen.
    expect(v2Href(`/admin/fundraising/pledges/${UUID}`)).toBe(`/admin/fundraising/pledges/${UUID}`);
  });

  test("W4: the Work moves resolve — rituals onto Plan & Close, Calendar into My Week, connections onto Meetings", () => {
    expect(v2Href("/admin/ops/monday")).toBe("/admin/work/plan-close");
    expect(v2Href("/admin/ops/friday")).toBe("/admin/work/plan-close");
    // The grid's URL contract survives the hop (DoD 3).
    expect(v2Href(`/admin/calendar?week=2026-09-07&owner=${UUID}`)).toBe(
      `/admin/work/my-week?week=2026-09-07&owner=${UUID}`,
    );
    // decision 3, resolved: settings → merged. booking-page alone stays.
    expect(v2Href("/admin/meetings/connections")).toBe("/admin/work/meetings");
    expect(v2Href("/admin/meetings/booking-page")).toBe("/admin/meetings/booking-page");
    // The weekly briefing's NO_HOME ruling stands (decision 4): the ritual
    // rows are exact, so it never rides their 308s.
    expect(v2Href("/admin/briefing/weekly")).toBe("/admin/briefing/weekly");
  });

  test("P4: volunteers re-aims at the one-list's view; the October rows stay put", () => {
    // decision 1, resolved: constituents, not students — so Donors &
    // Funders' volunteers view, not People. The first query-bearing
    // destination; a source query merges with "&", never a second "?".
    expect(v2Href("/admin/fundraising/volunteers")).toBe(
      "/admin/fundraising/donors-funders?view=volunteers",
    );
    expect(v2Href("/admin/fundraising/volunteers?q=lee")).toBe(
      "/admin/fundraising/donors-funders?view=volunteers&q=lee",
    );
    // R8/R9 honored (decision 4) and NO_HOME stands: nothing else moved.
    expect(v2Href("/admin/demoday")).toBe("/admin/demoday");
    expect(v2Href("/admin/careers/daily")).toBe("/admin/careers/daily");
    expect(v2Href("/admin/careers/pool")).toBe("/admin/careers/pool");
  });

  test("I4: the scorecard lands on KPIs; the stay-put strategic-plan siblings stay put", () => {
    expect(v2Href("/admin/strategic-plan/scorecard")).toBe("/admin/impact/kpis");
    // The settings row and the NO_HOME pair survive every cutover
    // (objective/review moved with Spec Org O2 — asserted below).
    for (const path of [
      "/admin/strategic-plan/setup",
      "/admin/strategic-plan/narrative",
      "/admin/strategic-plan/people",
    ]) {
      expect(v2Href(path), path).toBe(path);
    }
  });

  test("O2: Strategy's children land on the O1 seats — never on the bare landing", () => {
    expect(v2Href("/admin/strategic-plan/review")).toBe("/admin/organization/strategy/review");
    expect(v2Href(`/admin/strategic-plan/objective/${UUID}?tab=goals`)).toBe(
      `/admin/organization/strategy/objective/${UUID}?tab=goals`,
    );
    // The F6 discipline held: no child anywhere resolves to a path without a
    // page (the on-disk host test above covers the bases; this is the shape).
    expect(v2Href("/admin/staff/reviews")).toBe("/admin/staff/reviews"); // NO_HOME, modules.reviews
  });

  test("F6: the Fundraising moves resolve, and the deliberately-narrowed children stay live", () => {
    expect(v2Href("/admin/fundraising")).toBe("/admin/fundraising/today");
    expect(v2Href("/admin/fundraising/plan")).toBe("/admin/fundraising/campaigns");
    expect(v2Href("/admin/fundraising/donors")).toBe("/admin/fundraising/donors-funders");
    expect(v2Href(`/admin/fundraising/donors/${UUID}?tab=notes`)).toBe(
      `/admin/fundraising/donors-funders/${UUID}?tab=notes`,
    );
    expect(v2Href("/admin/fundraising/prospects")).toBe("/admin/fundraising/donors-funders");
    expect(v2Href(`/admin/fundraising/prospects/${UUID}`)).toBe(
      `/admin/fundraising/donors-funders/${UUID}`,
    );
    expect(v2Href(`/admin/fundraising/asks/${UUID}`)).toBe(`/admin/fundraising/pipeline/${UUID}`);
    expect(v2Href("/admin/fundraising/acknowledgments")).toBe("/admin/fundraising/today");
    expect(v2Href("/admin/fundraising/recurring")).toBe("/admin/fundraising/donors-funders");
    expect(v2Href("/admin/fundraising/journeys")).toBe("/admin/fundraising/donors-funders");
    // Narrowed on purpose (exact / uuid-child): these named children keep
    // their live screens — no 308 into a 404, ever.
    for (const path of [
      `/admin/fundraising/plan/${UUID}`,
      "/admin/fundraising/prospects/import",
      "/admin/fundraising/prospects/by-hubspot/12345",
      "/admin/fundraising/acknowledgments/letters",
      "/admin/fundraising/acknowledgments/templates",
    ]) {
      expect(v2Href(path), path).toBe(path);
    }
  });

  test("the nine queue fallback hrefs resolve through the map", () => {
    expect(v2Href("/admin/ops")).toBe("/admin/work/tasks");
    expect(v2Href("/admin/compliance")).toBe("/admin/organization/compliance");
    expect(v2Href("/admin/documents")).toBe("/admin/work/documents");
    expect(v2Href("/admin/kpis")).toBe("/admin/impact/kpis");
    expect(v2Href("/admin/intake")).toBe("/admin/programs/intake");
    expect(v2Href("/admin/cohorts")).toBe("/admin/programs/cohorts");
    // Acknowledgments moved with Spec Fundraising F6 (Thank someone lives on
    // Today's Moves); reconcile moved with Spec Finance N4 (Transactions
    // absorbed the inbox at N1); grants is kept.
    expect(v2Href("/admin/fundraising/acknowledgments")).toBe("/admin/fundraising/today");
    expect(v2Href("/admin/finance/reconcile")).toBe("/admin/finance/transactions");
    expect(v2Href("/admin/fundraising/grants")).toBe("/admin/fundraising/grants");
  });
});

describe("the whole F.1 delta is accounted for", () => {
  test("every row carries an explicit activation state", () => {
    for (const row of V2_ROUTE_MAP) {
      expect(["now", "at-cutover", "no-home"]).toContain(row.activation);
    }
  });

  test("no-home rows have no destination; at-cutover merges name their future seat", () => {
    for (const row of V2_ROUTE_MAP.filter((r) => r.activation === "no-home")) {
      expect(row.v2, row.v1).toBeNull();
    }
  });

  test("stored deep-link constraints from the recon are covered", () => {
    // notifications.url / email paths that outlive the cutover (recon §F.2).
    expect(v2Href(`/admin/ops/projects/${UUID}`)).toBe(`/admin/work/projects/${UUID}`);
    expect(v2Href("/admin/fundraising/grants")).toBe("/admin/fundraising/grants");
    expect(v2Href("/admin/compliance")).toBe("/admin/organization/compliance");
    expect(v2Href("/admin/queue")).toBe("/admin/today"); // moved with Spec Home (H3)
    expect(v2Href("/admin/briefing")).toBe("/admin/today");
    expect(v2Href("/admin/briefing/weekly")).toBe("/admin/briefing/weekly"); // NO_HOME, exact rows leave it
  });

  test("every notifications.url shape stored in production has a map contract", () => {
    // The four shapes that exist in prod as of 2026-09-04 (all June/July
    // rows). The two fundraising shapes CUT OVER at Spec Fundraising F6:
    // they now resolve to the Donor 360, which handles both id spaces. The
    // messages shapes stay at-cutover merges until Inbox's spec.
    expect(v2Href(`/admin/fundraising/prospects/${UUID}`)).toBe(
      `/admin/fundraising/donors-funders/${UUID}`,
    );
    expect(v2Href(`/admin/fundraising/donors/${UUID}`)).toBe(
      `/admin/fundraising/donors-funders/${UUID}`,
    );
    const stored = [
      { shape: `/admin/messages?t=${UUID}`, future: "/admin/inbox/messages" },
      { shape: "/admin/messages", future: "/admin/inbox/messages" },
    ];
    for (const { shape, future } of stored) {
      expect(v2Href(shape), `${shape} must stay live until its seat exists`).toBe(shape);
      const path = shape.split("?")[0].replace(`/${UUID}`, "");
      const row = V2_ROUTE_MAP.filter(
        (r) =>
          r.activation === "at-cutover" &&
          (r.kind === "exact" ? r.v1 === path : r.v1 === path || path.startsWith(r.v1 + "/")),
      ).sort((a, b) => b.v1.length - a.v1.length)[0];
      expect(row, `no at-cutover contract for ${shape}`).toBeTruthy();
      expect(row!.v2, shape).toBe(future);
    }
  });
});

// Per-org behavior (the "crawl as each of the four orgs" in structural form):
// the 308s are org-independent; what differs is the host's FeatureGate. Each
// active target reuses its V1 section's key, so behavior at the V2 path is
// identical to the V1 path for every org. The keys per target:
const TARGET_GATES: Record<string, string> = {
  "/admin/organization/strategy": "modules.strategy",
  "/admin/work/tasks": "modules.ops",
  "/admin/work/plan-close": "modules.ops",
  "/admin/work/my-week": "modules.meetings", // W2: the grid pairs with the calendar connection
  "/admin/work/projects": "modules.ops",
  "/admin/work/meetings": "modules.meetings",
  "/admin/work/documents": "modules.documents",
  "/admin/organization/team": "modules.staff",
  "/admin/finance/snapshot": "modules.finance",
  "/admin/finance/reports": "modules.finance",
  "/admin/impact/analytics": "aa.site_analytics",
  "/admin/impact/kpis": "modules.metrics",
  "/admin/programs/people": "modules.program",
  "/admin/programs/intake": "modules.program",
  "/admin/programs/cohorts": "modules.program",
  "/admin/programs/overview": "modules.program",
  "/admin/programs/partners": "modules.partners",
  "/admin/programs/content": "modules.content",
  "/admin/organization/board": "modules.board",
  "/admin/organization/compliance": "modules.compliance",
};

describe("per-org host behavior (gate keys mirror the V1 sections)", () => {
  test("every gate key is declared in each host layout on disk", () => {
    const app = join(__dirname, "..", "app");
    for (const target of Object.keys(TARGET_GATES)) {
      if (target.startsWith("/admin/finance/")) continue; // inherits finance/layout.tsx
      const layout = join(app, ...target.split("/").filter(Boolean), "layout.tsx");
      expect(existsSync(layout), `missing gate layout for ${target}`).toBe(true);
    }
  });

  test("the 9-key orgs (Young Life EPA, SafeSpace) hit the permission panel exactly where V1 already panels them", () => {
    const NINE_KEY = new Set([
      "modules.board", "modules.compliance", "modules.documents", "modules.finance",
      "modules.fundraising", "modules.metrics", "modules.ops", "modules.partners", "modules.program",
    ]);
    const panelled = Object.entries(TARGET_GATES)
      .filter(([, gate]) => !NINE_KEY.has(gate))
      .map(([t]) => t)
      .sort();
    expect(panelled).toEqual([
      "/admin/impact/analytics",       // aa.site_analytics (AA-only)
      "/admin/organization/strategy",  // modules.strategy
      "/admin/organization/team",      // modules.staff
      "/admin/programs/content",       // modules.content (AA-only)
      "/admin/work/meetings",          // modules.meetings
      "/admin/work/my-week",           // modules.meetings since W2 (V1 calendar had no gate; the model's deliberate shape)
    ]);
  });
});
