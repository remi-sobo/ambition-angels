import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Life-hub snapshot adapter gate (GET /api/hub/v1/snapshot).
 *
 * The endpoint serves Remi's and Kendra's BloomOS work to the planning hub
 * in Trellis. The one rule that must never regress: nobody else's rows —
 * Shannon's above all — ever cross the wire, in tasks, projects, OR
 * full_open_ids. These tests run the real route handler against an
 * in-memory PostgREST fake seeded with adversarial fixtures (Shannon's
 * work, archived rows, out-of-scope orgs) and assert on the full response
 * surface, plus the auth and delta semantics the hub relies on.
 */

const REMI = "aa39cd02-b813-4e75-aa36-52adadf5d2fe";
const KENDRA = "e139525e-9056-4875-84ca-aac1a30f5a7e";
const SHANNON = "7312ba86-5203-4cf6-81d8-d8fbd3e2ec89";

const ORG_AA = "org-aa";
const ORG_YL = "org-yl";
const ORG_SAFESPACE = "org-ss";

const fixtures: Record<string, Record<string, unknown>[]> = { orgs: [], profiles: [], ops_projects: [], ops_tasks: [] };

function seed() {
  fixtures.orgs = [
    { id: ORG_AA, slug: "ambition-angels" },
    { id: ORG_YL, slug: "young-life-epa" },
    { id: ORG_SAFESPACE, slug: "safespace" },
  ];
  fixtures.profiles = [
    { user_id: REMI, display_name: "Remi" },
    { user_id: KENDRA, display_name: "Kendra" },
    { user_id: SHANNON, display_name: "Shannon" },
  ];
  fixtures.ops_projects = [
    { id: "p-remi", title: "Remi project", status: "active", category: "fundraising", assigned_to: "Remi", org_id: ORG_AA, updated_at: "2026-07-01T00:00:00Z" },
    { id: "p-unassigned", title: "Unassigned project", status: "active", category: "program", assigned_to: null, org_id: ORG_AA, updated_at: "2026-07-02T00:00:00Z" },
    { id: "p-yl", title: "YL project", status: "active", category: "program", assigned_to: "Kendra Soborowicz", org_id: ORG_YL, updated_at: "2026-07-03T00:00:00Z" },
    { id: "p-done", title: "Done project", status: "done", category: "admin", assigned_to: "Remi", org_id: ORG_AA, updated_at: "2026-06-01T00:00:00Z" },
    // Never in any response:
    { id: "p-shannon", title: "Shannon project", status: "active", category: "program", assigned_to: "Shannon", org_id: ORG_AA, updated_at: "2026-07-04T00:00:00Z" },
    { id: "p-archived", title: "Archived project", status: "archived", category: "admin", assigned_to: "Remi", org_id: ORG_AA, updated_at: "2026-07-05T00:00:00Z" },
    { id: "p-safespace", title: "SafeSpace project", status: "active", category: "program", assigned_to: "Remi", org_id: ORG_SAFESPACE, updated_at: "2026-07-06T00:00:00Z" },
  ];
  fixtures.ops_tasks = [
    { id: "t-remi", project_id: "p-remi", title: "Remi task", status: "todo", due_date: "2026-08-01", assigned_to_id: REMI, category: "fundraising", labels: ["grant"], org_id: ORG_AA, archived_at: null, updated_at: "2026-07-10T00:00:00Z" },
    { id: "t-kendra-yl", project_id: "p-yl", title: "Kendra YL task", status: "in_progress", due_date: null, assigned_to_id: KENDRA, category: "program", labels: [], org_id: ORG_YL, archived_at: null, updated_at: "2026-07-11T00:00:00Z" },
    { id: "t-orphan", project_id: null, title: "Projectless task", status: "todo", due_date: null, assigned_to_id: REMI, category: "operations", labels: [], org_id: ORG_AA, archived_at: null, updated_at: "2026-07-12T00:00:00Z" },
    { id: "t-unassigned-on-remi", project_id: "p-remi", title: "Unassigned on Remi's project", status: "todo", due_date: null, assigned_to_id: null, category: "other", labels: [], org_id: ORG_AA, archived_at: null, updated_at: "2026-07-13T00:00:00Z" },
    { id: "t-done", project_id: "p-remi", title: "Done task", status: "done", due_date: null, assigned_to_id: REMI, category: "finance", labels: [], org_id: ORG_AA, archived_at: null, updated_at: "2026-06-10T00:00:00Z" },
    // Never in any response:
    { id: "t-shannon", project_id: "p-shannon", title: "Shannon task", status: "todo", due_date: null, assigned_to_id: SHANNON, category: "program", labels: [], org_id: ORG_AA, archived_at: null, updated_at: "2026-07-14T00:00:00Z" },
    { id: "t-unassigned-on-shannon", project_id: "p-shannon", title: "Unassigned on Shannon's project", status: "todo", due_date: null, assigned_to_id: null, category: "program", labels: [], org_id: ORG_AA, archived_at: null, updated_at: "2026-07-15T00:00:00Z" },
    { id: "t-archived", project_id: "p-remi", title: "Archived task", status: "todo", due_date: null, assigned_to_id: REMI, category: "other", labels: [], org_id: ORG_AA, archived_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-16T00:00:00Z" },
    { id: "t-safespace", project_id: null, title: "SafeSpace task", status: "todo", due_date: null, assigned_to_id: REMI, category: "program", labels: [], org_id: ORG_SAFESPACE, archived_at: null, updated_at: "2026-07-17T00:00:00Z" },
  ];
}

// ── A minimal PostgREST fake covering exactly the chains the route uses ─────

type Row = Record<string, unknown>;

function matchesOr(row: Row, or: string): boolean {
  // Supports the route's two shapes:
  //   assigned_to_id.in.(a,b)
  //   assigned_to_id.in.(a,b),and(assigned_to_id.is.null,project_id.in.(x,y))
  return or.split(/,(?=and\(|assigned_to_id\.in)/).some((branch) => {
    const and = branch.match(/^and\(assigned_to_id\.is\.null,project_id\.in\.\(([^)]*)\)\)$/);
    if (and) {
      const ids = and[1] === "" ? [] : and[1].split(",");
      return row.assigned_to_id === null && ids.includes(String(row.project_id));
    }
    const plain = branch.match(/^assigned_to_id\.in\.\(([^)]*)\)$/);
    if (plain) {
      const ids = plain[1] === "" ? [] : plain[1].split(",");
      return ids.includes(String(row.assigned_to_id));
    }
    throw new Error(`or() shape not understood by fake: ${branch}`);
  });
}

function queryBuilder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let slice: [number, number] | null = null;
  const b = {
    select: () => b,
    in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return b; },
    neq: (col: string, val: unknown) => { filters.push((r) => r[col] !== val); return b; },
    is: (col: string, val: null) => { filters.push((r) => r[col] === val); return b; },
    or: (expr: string) => { filters.push((r) => matchesOr(r, expr)); return b; },
    order: (col: string) => { filters.push(() => true); void col; return b; },
    range: (from: number, to: number) => { slice = [from, to]; return b; },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
      let rows = (fixtures[table] ?? []).filter((r) => filters.every((f) => f(r)));
      rows = [...rows].sort((a, z) => String(a.id).localeCompare(String(z.id)));
      if (slice) rows = rows.slice(slice[0], slice[1] + 1);
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => queryBuilder(table) }),
}));

import { GET } from "@/app/api/hub/v1/snapshot/route";

function request(query = ""): NextRequest {
  return new NextRequest(`https://ambitionangels.org/api/hub/v1/snapshot${query}`, {
    headers: { authorization: "Bearer test-secret" },
  });
}

async function snapshot(query = "") {
  const res = await GET(request(query));
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(() => {
  seed();
  process.env.HUB_SNAPSHOT_SECRET = "test-secret";
});

describe("auth (TASK_INGEST_SECRET pattern)", () => {
  test("503 when the secret is unset", async () => {
    delete process.env.HUB_SNAPSHOT_SECRET;
    const res = await GET(request());
    expect(res.status).toBe(503);
  });

  test("401 on a wrong or missing bearer", async () => {
    const bad = new NextRequest("https://ambitionangels.org/api/hub/v1/snapshot", {
      headers: { authorization: "Bearer wrong" },
    });
    expect((await GET(bad)).status).toBe(401);
    const none = new NextRequest("https://ambitionangels.org/api/hub/v1/snapshot");
    expect((await GET(none)).status).toBe(401);
  });

  test("400 on a malformed since", async () => {
    expect((await GET(request("?since=yesterday"))).status).toBe(400);
  });
});

describe("Shannon's rows never cross the wire", () => {
  test("no Shannon task, project, or unassigned task on her project — anywhere in the response", async () => {
    const body = await snapshot();
    const everywhere = JSON.stringify(body);
    expect(everywhere).not.toContain(SHANNON);
    expect(everywhere).not.toContain("t-shannon");
    expect(everywhere).not.toContain("p-shannon");
    expect(everywhere).not.toContain("t-unassigned-on-shannon");
  });

  test("out-of-scope orgs and archived rows are absent too", async () => {
    const body = await snapshot();
    const everywhere = JSON.stringify(body);
    for (const id of ["p-safespace", "t-safespace", "p-archived", "t-archived"]) {
      expect(everywhere).not.toContain(id);
    }
  });

  test("every task owner in the response is Remi, Kendra, or null", async () => {
    const body = await snapshot();
    for (const t of body.tasks) {
      expect([REMI, KENDRA, null]).toContain(t.owner);
    }
    for (const p of body.projects) {
      expect([REMI, KENDRA, null]).toContain(p.owner);
    }
  });
});

describe("scope and shape", () => {
  test("in-scope rows arrive with the contract fields", async () => {
    const body = await snapshot();
    expect(body.system).toBe("bloomos");
    expect(body.projects.map((p: { external_id: string }) => p.external_id).sort())
      .toEqual(["p-done", "p-remi", "p-unassigned", "p-yl"]);
    expect(body.tasks.map((t: { external_id: string }) => t.external_id).sort())
      .toEqual(["t-done", "t-kendra-yl", "t-orphan", "t-remi", "t-unassigned-on-remi"]);
  });

  test("area_hint maps org to hub area on projects AND tasks (young-life-epa -> young-life)", async () => {
    const body = await snapshot();
    const project = (id: string) => body.projects.find((p: { external_id: string }) => p.external_id === id);
    const task = (id: string) => body.tasks.find((t: { external_id: string }) => t.external_id === id);
    expect(project("p-yl").area_hint).toBe("young-life");
    expect(project("p-remi").area_hint).toBe("ambition-angels");
    expect(task("t-kendra-yl").area_hint).toBe("young-life");
    // The projectless task still routes: its own org carries the hint.
    expect(task("t-orphan").project_external_id).toBeNull();
    expect(task("t-orphan").area_hint).toBe("ambition-angels");
  });

  test("free-text project assignee resolves by first display-name token", async () => {
    const body = await snapshot();
    const yl = body.projects.find((p: { external_id: string }) => p.external_id === "p-yl");
    expect(yl.owner).toBe(KENDRA); // assigned_to 'Kendra Soborowicz'
  });

  test("both category taxonomies pass through as labels, unmerged", async () => {
    const body = await snapshot();
    const t = body.tasks.find((x: { external_id: string }) => x.external_id === "t-remi");
    expect(t.labels).toEqual(["fundraising", "grant"]);
    const p = body.projects.find((x: { external_id: string }) => x.external_id === "p-remi");
    expect(p.labels).toEqual(["fundraising"]);
  });
});

describe("delta and reconciliation semantics", () => {
  test("since filters projects/tasks but full_open_ids stays complete", async () => {
    const body = await snapshot("?since=2026-07-12T06:00:00Z");
    expect(body.tasks.map((t: { external_id: string }) => t.external_id).sort())
      .toEqual(["t-unassigned-on-remi"]);
    expect(body.projects).toEqual([]);
    // The hub diffs these every run; they must never shrink to the delta.
    expect(body.full_open_ids.projects.sort()).toEqual(["p-remi", "p-unassigned", "p-yl"]);
    expect(body.full_open_ids.tasks.sort()).toEqual(["t-kendra-yl", "t-orphan", "t-remi", "t-unassigned-on-remi"]);
  });

  test("done rows are excluded from full_open_ids but still sync as delta rows", async () => {
    const body = await snapshot();
    expect(body.full_open_ids.tasks).not.toContain("t-done");
    expect(body.full_open_ids.projects).not.toContain("p-done");
    expect(body.tasks.map((t: { external_id: string }) => t.external_id)).toContain("t-done");
  });
});
