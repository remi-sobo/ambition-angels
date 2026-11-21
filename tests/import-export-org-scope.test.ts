import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./support/fakeDb";

/**
 * Active-org fence for the data import and export paths (tenancy audit P1
 * finding 8). RLS answers "is the user a member of this row's org", not "is
 * this the ACTIVE org", so a user in two orgs reads both orgs' rows through
 * the session client unless the query pins ctx.orgId. These tests seed a
 * user who belongs to org A and org B (the fake's `visible` predicate plays
 * RLS) and prove imports and exports only ever touch the active org.
 */

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";
const ctxFor = (orgId: string) => ({ userId: "u1", email: "ops@example.org", orgId, orgName: "Org", role: "owner" as const });

let db: FakeDb;
let ctx: ReturnType<typeof ctxFor> | null = ctxFor(ORG_A);
// Permissions the caller's role holds (requirePermission → ctxHasPermission).
let perms = new Set<string>(["fundraising.read"]);

// customFields.ts calls React's RSC-only `cache` at module scope; identity shim.
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: (mod as { cache?: unknown }).cache ?? (<T,>(fn: T) => fn) };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  ctxHasPermission: vi.fn(async (_c: unknown, p: string) => perms.has(p)),
}));
// The fake has no .range(); one awaited read stands in for the paged loop.
vi.mock("@/lib/supabase/fetchAll", () => ({
  fetchAll: async (query: () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) => {
    const { data, error } = await query();
    return error ? { data: null, error, truncated: false } : { data: data ?? [], error: null, truncated: false };
  },
}));

import { GET as exportDonors } from "@/app/api/admin/donors/export/route";
import { GET as exportGifts } from "@/app/api/admin/gifts/export/route";

/** A member of both orgs: RLS shows rows from A and B alike. */
const memberOfBoth = (row: Record<string, unknown>) => row.org_id === ORG_A || row.org_id === ORG_B;

function seed() {
  return fakeDb(
    {
      constituents: [
        { id: "a-shared", org_id: ORG_A, type: "person", first_name: "Ada", last_name: "A", emails: ["shared@example.org"], source: "manual" },
        { id: "b-shared", org_id: ORG_B, type: "person", first_name: "Bea", last_name: "B", emails: ["shared@example.org"], source: "manual" },
        { id: "b-only", org_id: ORG_B, type: "person", first_name: "Bo", last_name: "B", emails: ["only-b@example.org"], source: "manual" },
      ],
      gifts: [
        { id: "ga", org_id: ORG_A, constituent_id: "a-shared", amount: 25, gift_date: "2025-02-01", external_source: "import" },
        { id: "gb1", org_id: ORG_B, constituent_id: "b-shared", amount: 500, gift_date: "2025-01-01", external_source: "import" },
        { id: "gb2", org_id: ORG_B, constituent_id: "b-only", amount: 900, gift_date: "2025-01-01", external_source: "import", campaign_id: "cb" },
      ],
      campaigns: [
        { id: "ca", org_id: ORG_A, name: "Spring A" },
        { id: "cb", org_id: ORG_B, name: "Gala B" },
      ],
    },
    {
      visible: {
        constituents: memberOfBoth,
        gifts: memberOfBoth,
        stewardship_rules: memberOfBoth,
        campaigns: memberOfBoth,
        funds: memberOfBoth,
        appeals: memberOfBoth,
      },
    },
  );
}

beforeEach(() => {
  db = seed();
  ctx = ctxFor(ORG_A);
  perms = new Set(["fundraising.read"]);
});

describe("GET /api/admin/donors/export: a two-org user", () => {
  test("exports only the active org's donors and giving", async () => {
    const res = await exportDonors(new NextRequest("http://localhost/api/admin/donors/export"));
    expect(res.status).toBe(200);
    const lines = (await res.text()).split("\n");
    expect(lines).toHaveLength(2); // header + Ada
    expect(lines[1]).toContain("Ada A");
    expect(lines[1]).toContain("25.00");
    expect(lines.join("\n")).not.toMatch(/Bea|Bo B|500|900/);
  });

  test("no org context is a 401", async () => {
    ctx = null;
    const res = await exportDonors(new NextRequest("http://localhost/api/admin/donors/export"));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/gifts/export: a two-org user", () => {
  const giftsReq = (qs = "") => new NextRequest(`http://localhost/api/admin/gifts/export${qs}`);

  test("a user active in org A cannot export org B's gifts", async () => {
    const res = await exportGifts(giftsReq());
    expect(res.status).toBe(200);
    const lines = (await res.text()).split("\n");
    expect(lines).toHaveLength(2); // header + org A's one gift
    expect(lines[1]).toContain("25.00");
    expect(lines.join("\n")).not.toMatch(/500\.00|900\.00|Gala B/);
  });

  test("filtering by org B's campaign id still returns nothing from org B", async () => {
    // A caller who knows another org's campaign uuid gets an empty file, and
    // org B's campaign name never resolves.
    db.tables.campaigns[1].id = "22222222-2222-2222-2222-222222222222";
    db.tables.gifts[2].campaign_id = "22222222-2222-2222-2222-222222222222";
    const res = await exportGifts(giftsReq("?campaign_id=22222222-2222-2222-2222-222222222222"));
    expect(res.status).toBe(200);
    expect((await res.text()).split("\n")).toEqual(["date,donor,amount,method,campaign,fund,appeal"]);
  });

  test("switching the active org to B exports only B's gifts", async () => {
    ctx = ctxFor(ORG_B);
    const body = await (await exportGifts(giftsReq())).text();
    expect(body.split("\n")).toHaveLength(3);
    expect(body).toContain("500.00");
    expect(body).toContain("Gala B");
    expect(body).not.toContain("25.00");
  });

  test("no org context is a 401; a role with neither fundraising.read nor finance.read is a 403", async () => {
    ctx = null;
    expect((await exportGifts(giftsReq())).status).toBe(401);
    ctx = ctxFor(ORG_A);
    perms = new Set(["program.read", "ops.read"]);
    expect((await exportGifts(giftsReq())).status).toBe(403);
  });

  test("finance.read alone opens the export, still pinned to the active org", async () => {
    perms = new Set(["finance.read"]);
    const res = await exportGifts(giftsReq());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.split("\n")).toHaveLength(2);
    expect(body).toContain("25.00");
    expect(body).not.toMatch(/500\.00|900\.00/);
  });
});

// ── Source guard ────────────────────────────────────────────────────────────
// Every import/export route must resolve the active org and pin each read,
// update and delete of a table to org_id, on ANY client (session client too:
// RLS alone unions a multi-org user's orgs). Inserts stamp org_id in the row.

const REPO = join(__dirname, "..");
const ROUTE_SEGMENT = /(^|\/)(imports?|export[^/]*)(\/|$)/;

// `${relPath}` → reason. Remove the entry when the owning change lands.
const EXCEPTIONS = new Map<string, string>([]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else if (e.name === "route.ts") out.push(abs);
  }
  return out;
}

function importExportRoutes(): string[] {
  return walk(join(REPO, "app/api/admin"))
    .map((abs) => relative(REPO, abs))
    .filter((rel) => ROUTE_SEGMENT.test(rel.replace(/^app\/api\/admin\//, "").replace(/\/route\.ts$/, "")))
    .sort();
}

/** Unscoped table statements in a route source (forward window to the next `;`). */
function unscopedStatements(src: string): string[] {
  const out: string[] = [];
  const re = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const semi = src.indexOf(";", m.index);
    const stmt = src.slice(m.index, semi === -1 ? m.index + 800 : semi);
    if (/\.(insert|upsert)\(/.test(stmt)) continue;
    if (!/\.(select|update|delete)\(/.test(stmt)) continue;
    if (stmt.includes("org_id")) continue;
    out.push(`${m[1]}: ${stmt.replace(/\s+/g, " ").slice(0, 100)}`);
  }
  return out;
}

describe("import/export routes pin the active org (source guard)", () => {
  test("the scanner flags an unscoped read and passes a pinned one", () => {
    expect(unscopedStatements(`sb.from("gifts").select("id");`)).toHaveLength(1);
    expect(unscopedStatements(`sb.from("gifts").select("id").eq("org_id", ctx.orgId);`)).toHaveLength(0);
    expect(unscopedStatements(`sb.from("gifts").insert({ org_id: o }).select("id");`)).toHaveLength(0);
  });

  test("the guard covers the known import and export routes", () => {
    const routes = importExportRoutes();
    for (const r of [
      "app/api/admin/imports/[id]/undo/route.ts",
      "app/api/admin/imports/[id]/stage/route.ts",
      "app/api/admin/donors/export/route.ts",
      "app/api/admin/gifts/export/route.ts",
      "app/api/admin/finance/import/route.ts",
      "app/api/admin/fundraising/prospects/import/route.ts",
    ]) {
      expect(routes).toContain(r);
    }
  });

  test("every import/export route resolves the org and filters each table read by org_id", () => {
    const problems: string[] = [];
    for (const file of importExportRoutes()) {
      if (EXCEPTIONS.has(file)) continue;
      const src = readFileSync(join(REPO, file), "utf8");
      if (!src.includes("getOrgContext") && !src.includes("requirePermission(")) problems.push(`${file}: no getOrgContext() (no active org)`);
      for (const s of unscopedStatements(src)) problems.push(`${file}  ${s}`);
    }
    expect(problems, `Add .eq("org_id", ctx.orgId):\n${problems.join("\n")}`).toEqual([]);
  });
});
