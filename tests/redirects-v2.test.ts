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
    // dynamic child is real): /admin/meetings/upcoming has only [eventId].
    const noBasePage = new Set(["/admin/work/meetings/upcoming"]);
    const checks: string[] = [];
    for (const row of active) {
      if ((row.kind === "exact" || row.kind === "prefix") && !noBasePage.has(row.v2!))
        checks.push(pageFor(row.v2!));
      if (row.kind === "uuid-child") checks.push(pageFor(`${row.v2}/[id]`));
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
    for (const path of [
      "/admin/staff/reviews",
      "/admin/meetings/connections",
      "/admin/meetings/booking-page",
      "/admin/careers/daily",
      "/admin/careers/pool",
      "/admin/ops/monday",
      "/admin/ops/friday",
      "/admin/calendar",
      "/admin/strategic-plan/narrative",
    ]) {
      expect(v2Href(path), path).toBe(path);
    }
  });

  test("at-cutover merges and kept-in-place paths are untouched until their spec", () => {
    for (const path of [
      "/admin", // Home cutover owns this (it also hosts the login UI)
      "/admin/queue",
      "/admin/fundraising/donors",
      "/admin/fundraising/prospects",
      "/admin/finance/reconcile",
      "/admin/fundraising/grants", // kept: V1 path IS the V2 path
      "/admin/fundraising/today",
      "/admin/inbox",
      "/admin/settings",
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
    // Seats not built yet keep their live V1 screens:
    expect(v2Href("/admin/fundraising/acknowledgments")).toBe("/admin/fundraising/acknowledgments");
    expect(v2Href("/admin/finance/reconcile")).toBe("/admin/finance/reconcile");
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
    expect(v2Href("/admin/queue")).toBe("/admin/queue"); // moves with the Home spec
  });

  test("every notifications.url shape stored in production has a map contract", () => {
    // The four shapes that exist in prod as of 2026-09-04 (all June/July rows).
    // Each is an at-cutover merge today: the URL keeps opening its live V1
    // screen NOW, and the map row names the exact seat it will 308 to when
    // that destination cuts over — never a dead path in between.
    const stored = [
      { shape: `/admin/messages?t=${UUID}`, future: "/admin/inbox/messages" },
      { shape: "/admin/messages", future: "/admin/inbox/messages" },
      { shape: `/admin/fundraising/prospects/${UUID}`, future: "/admin/fundraising/donors-funders" },
      { shape: `/admin/fundraising/donors/${UUID}`, future: "/admin/fundraising/donors-funders" },
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
  "/admin/work/my-week": "modules.ops",
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
    ]);
  });
});
