import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Capture C2 step 1: pins the shape of the match RPC migration. The RPC's row
// fence runs for real in supabase/tests/rls-leak-test.sql; this is the text
// contract (invoker, org pin, sources, no youth tables, guarded form).

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const raw = read("supabase", "migrations", "capture_match_rpc.sql");
const sql = raw.replace(/--.*$/gm, "").toLowerCase();

describe("capture_match_rpc.sql (C2)", () => {
  test("defines the RPC with the agreed signature and return shape", () => {
    expect(sql).toMatch(
      /create or replace function public\.capture_match_candidates\(q text, org uuid, lim int default 5\)\s+returns table \(id uuid, kind text, name text, org_name text, meta text, sim real\)/,
    );
    expect(sql).toMatch(/language sql\s+stable\s+security invoker\s+set search_path = public, extensions, pg_temp/);
    expect(sql).toMatch(/set check_function_bodies = off;/);
  });

  test("searches exactly constituents, partners, and fr_prospects, each pinned to the org argument", () => {
    const sources = Array.from(sql.matchAll(/from public\.([a-z_]+) (?:c|p|fp|i)\b/g)).map((m) => m[1]);
    expect(new Set(sources)).toEqual(new Set(["constituents", "partners", "fr_prospects", "interactions"]));
    expect(sql).toContain("where c.org_id = org");
    expect(sql).toContain("where p.org_id = org");
    expect(sql).toContain("where fp.org_id = org");
    expect(sql).toContain("c.archived_at is null");
    expect(sql).toContain("fp.status <> 'disqualified'");
    expect(sql).toMatch(/'constituent'::text as kind/);
    expect(sql).toMatch(/'partner'::text as kind/);
    expect(sql).toMatch(/'prospect'::text as kind/);
  });

  test("never touches a youth table", () => {
    for (const t of ["students", "applications", "cohort_members", "cohort_sessions", "attendance", "imports", "ygb_"]) {
      expect(sql, t).not.toMatch(new RegExp(`\\b${t}`));
    }
  });

  test("interactions is read only for the last-touch meta, inside a lateral max", () => {
    expect(sql).toMatch(/left join lateral \(\s*select max\(i\.occurred_at\) as last_at\s+from public\.interactions i/);
    expect(sql).not.toMatch(/insert into|update public\.|delete from/);
  });

  test("anon cannot call it; members can", () => {
    expect(sql).toContain("revoke all on function public.capture_match_candidates(text, uuid, int) from public;");
    expect(sql).toContain("grant execute on function public.capture_match_candidates(text, uuid, int) to authenticated;");
  });

  test("guarded form: no drop policy / drop trigger, idempotent create", () => {
    expect(sql).not.toMatch(/drop policy|drop trigger|drop function/);
    expect(sql).toMatch(/create extension pg_trgm/);
    expect(sql).toMatch(/if not exists \(select 1 from pg_extension where extname = 'pg_trgm'\)/);
    expect(sql.match(/create\s+table\s+(?!if\s+not\s+exists)/g)).toBeNull();
    expect(sql.match(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/g)).toBeNull();
  });

  test("is registered in the RLS runner after the C1 migration", () => {
    const runner = read("scripts", "test-rls.sh");
    expect(runner).toMatch(/^\s*capture_match_rpc\.sql\s*$/m);
    expect(runner.indexOf("capture_tables.sql")).toBeLessThan(runner.indexOf("capture_match_rpc.sql"));
  });
});
