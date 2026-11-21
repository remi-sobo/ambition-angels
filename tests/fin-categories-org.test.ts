import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Finance categories are per-org (fin_categories_org_scope.sql). These pin the
// app side: every read/write of a category id is fenced to the caller's org,
// a foreign category id is rejected before any write, budget upserts conflict
// on (org_id, year, category_id), and an org with no categories gets a clear
// message instead of an error.

const ORG = "org-b";

vi.mock("@/lib/admin/auth", () => ({ getOrgContext: vi.fn(async () => ({ orgId: ORG })) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

// ── A recording fake of the supabase-js query builder ──────────────────────
type Call = { table: string; op: string; args: unknown[]; filters: Array<[string, string, unknown]>; opts?: unknown };
let calls: Call[] = [];
// Categories that exist per org in the fake database.
let categoriesByOrg: Record<string, string[]> = {};

function builder(table: string) {
  const call: Call = { table, op: "select", args: [], filters: [] };
  calls.push(call);
  const result = () => {
    if (table === "fin_categories" && call.op === "select") {
      const org = call.filters.find((f) => f[0] === "eq" && f[1] === "org_id")?.[2] as string | undefined;
      const inIds = call.filters.find((f) => f[0] === "in" && f[1] === "id")?.[2] as string[] | undefined;
      const ids = (org ? categoriesByOrg[org] ?? [] : []).filter((id) => !inIds || inIds.includes(id));
      return { data: ids.map((id) => ({ id })), error: null };
    }
    if (call.op === "select" && table === "fin_category_rules") return { data: [], error: null };
    return { data: { id: "row-1" }, error: null, count: 1 };
  };
  const b: Record<string, unknown> = {
    select: (..._a: unknown[]) => b,
    insert: (...a: unknown[]) => ((call.op = "insert"), (call.args = a), b),
    update: (...a: unknown[]) => ((call.op = "update"), (call.args = a), b),
    upsert: (row: unknown, opts: unknown) => ((call.op = "upsert"), (call.args = [row]), (call.opts = opts), b),
    delete: () => ((call.op = "delete"), b),
    eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), b),
    in: (c: string, v: unknown) => (call.filters.push(["in", c, v]), b),
    is: (c: string, v: unknown) => (call.filters.push(["is", c, v]), b),
    order: () => b,
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
  };
  return b;
}
const fakeSupabase = { from: (t: string) => builder(t), rpc: async () => ({ error: null }) };
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => fakeSupabase }));

import { orgCategoryIds, FIN_BUDGET_CONFLICT } from "@/lib/finance/categories";
import { PATCH as patchTxn } from "@/app/api/admin/finance/transactions/[id]/route";
import { POST as createRule } from "@/app/api/admin/finance/rules/route";
import { PATCH as patchRule } from "@/app/api/admin/finance/rules/[id]/route";
import { POST as upsertBudget } from "@/app/api/admin/finance/budget/route";
import { POST as seedRules } from "@/app/api/admin/finance/rules/seed/route";
import { POST as applyAi } from "@/app/api/admin/finance/categorize/apply/route";
import { DEFAULT_RULES } from "@/lib/finance/default-rules";

const ID = "11111111-1111-1111-1111-111111111111";
const req = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
const writes = () => calls.filter((c) => c.op !== "select");

beforeEach(() => {
  calls = [];
  // Same text id in two orgs; 'aa.only' exists only in org A.
  categoriesByOrg = { "org-a": ["payroll.taxes", "aa.only"], [ORG]: ["payroll.taxes", "b.only"] };
});

describe("orgCategoryIds", () => {
  test("looks categories up inside the given org only", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const got = await orgCategoryIds(fakeSupabase as any, ORG, ["payroll.taxes", "aa.only", "b.only", ""]);
    expect(Array.from(got).sort()).toEqual(["b.only", "payroll.taxes"]);
    expect(calls[0].filters).toContainEqual(["eq", "org_id", ORG]);
  });

  test("no ids → no query", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await orgCategoryIds(fakeSupabase as any, ORG, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("transactions PATCH", () => {
  test("rejects another org's category before writing", async () => {
    const res = await patchTxn(req({ category_id: "aa.only" }), { params: { id: ID } });
    expect(res.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test("accepts its own category and pins the update to its org", async () => {
    const res = await patchTxn(req({ category_id: "payroll.taxes" }), { params: { id: ID } });
    expect(res.status).toBe(200);
    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ table: "fin_transactions", op: "update" });
    expect(w[0].filters).toContainEqual(["eq", "org_id", ORG]);
  });

  test("clearing a category needs no lookup", async () => {
    const res = await patchTxn(req({ category_id: "" }), { params: { id: ID } });
    expect(res.status).toBe(200);
    expect(calls.filter((c) => c.table === "fin_categories")).toHaveLength(0);
  });
});

describe("rules", () => {
  test("create rejects another org's category", async () => {
    const res = await createRule(req({ pattern: "GUSTO", category_id: "aa.only" }));
    expect(res.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test("create stamps the caller's org", async () => {
    const res = await createRule(req({ pattern: "GUSTO", category_id: "b.only" }));
    expect(res.status).toBe(200);
    expect(writes()[0].args[0]).toMatchObject({ org_id: ORG, category_id: "b.only" });
  });

  test("patch rejects re-pointing at another org's category", async () => {
    const res = await patchRule(req({ category_id: "aa.only" }), { params: { id: ID } });
    expect(res.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test("seed only inserts default rules whose category exists in the org", async () => {
    const someDefault = DEFAULT_RULES[0].category_id;
    categoriesByOrg[ORG] = [someDefault];
    const res = await seedRules(req({}));
    expect(res.status).toBe(200);
    const inserted = writes()[0].args[0] as Array<{ org_id: string; category_id: string }>;
    expect(inserted.length).toBe(DEFAULT_RULES.filter((r) => r.category_id === someDefault).length);
    expect(inserted.every((r) => r.org_id === ORG && r.category_id === someDefault)).toBe(true);
  });

  test("seed on an org with no categories explains instead of erroring", async () => {
    categoriesByOrg[ORG] = [];
    const res = await seedRules(req({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/finance categories/);
    expect(writes()).toHaveLength(0);
  });
});

describe("budget upsert", () => {
  test("conflicts on (org_id, year, category_id), never (year, category_id)", async () => {
    expect(FIN_BUDGET_CONFLICT).toBe("org_id,year,category_id");
    const res = await upsertBudget(req({ year: 2026, category_id: "payroll.taxes", base_amount: 100 }));
    expect(res.status).toBe(200);
    const w = writes()[0];
    expect(w).toMatchObject({ table: "fin_budget", op: "upsert", opts: { onConflict: "org_id,year,category_id" } });
    expect(w.args[0]).toMatchObject({ org_id: ORG, year: 2026, category_id: "payroll.taxes" });
  });

  test("rejects another org's category", async () => {
    const res = await upsertBudget(req({ year: 2026, category_id: "aa.only", base_amount: 100 }));
    expect(res.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test("no route still upserts on the old global key", () => {
    for (const f of ["app/api/admin/finance/budget/route.ts", "app/api/admin/finance/budget/import/route.ts"]) {
      expect(readFileSync(join(process.cwd(), f), "utf8")).not.toMatch(/onConflict:\s*"year,category_id"/);
    }
  });
});

describe("AI categorize apply", () => {
  test("drops items pointing at another org's category", async () => {
    const res = await applyAi(
      req({ items: [{ id: ID, category_id: "aa.only" }, { id: "t2", category_id: "b.only" }] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rejected).toBe(1);
    const updates = writes().filter((c) => c.table === "fin_transactions");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual({ category_id: "b.only" });
    expect(updates[0].filters).toContainEqual(["eq", "org_id", ORG]);
  });
});

describe("fin_categories_org_scope migration", () => {
  const root = process.cwd();
  const sql = readFileSync(join(root, "supabase/migrations/fin_categories_org_scope.sql"), "utf8");
  const code = sql.replace(/--.*$/gm, "");

  test("is registered in the RLS test's ordered list", () => {
    expect(readFileSync(join(root, "scripts/test-rls.sh"), "utf8")).toMatch(/^\s+fin_categories_org_scope\.sql$/m);
  });

  test("resolves Ambition Angels by slug, never a hardcoded uuid", () => {
    expect(code).toMatch(/slug = 'ambition-angels'/);
    expect(code).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  test("keys categories and budget by org, with org-checked foreign keys", () => {
    expect(code).toMatch(/fin_categories_pkey primary key \(org_id, id\)/);
    expect(code).toMatch(/fin_budget_pkey primary key \(org_id, year, category_id\)/);
    expect(code.match(/foreign key \(org_id, category_id\) references public\.fin_categories \(org_id, id\)/g)).toHaveLength(3);
    expect(code).toMatch(/on delete set null \(category_id\)/);
  });

  test("drops the org_id default and keeps the operator seed off browser roles", () => {
    expect(code).toMatch(/fin_categories\s+alter column org_id drop default/);
    expect(code).toMatch(/revoke execute on function public\.fin_seed_starter_categories\(uuid\) from anon/);
    expect(code).toMatch(/revoke execute on function public\.fin_seed_starter_categories\(uuid\) from authenticated/);
  });
});
