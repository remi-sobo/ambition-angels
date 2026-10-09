import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Capture C3 step 0: the match RPC loses its anon grant and keeps authenticated.
// The live check (anon cannot call it) runs in supabase/tests/rls-leak-test.sql.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const sql = read("supabase", "migrations", "capture_rpc_grants.sql").replace(/--.*$/gm, "").toLowerCase();

describe("capture_rpc_grants.sql (C3)", () => {
  test("revokes execute from public and anon, keeps authenticated", () => {
    expect(sql).toContain("revoke execute on function public.capture_match_candidates(text, uuid, int) from public;");
    expect(sql).toContain("revoke execute on function public.capture_match_candidates(text, uuid, int) from anon;");
    expect(sql).toContain("grant execute on function public.capture_match_candidates(text, uuid, int) to authenticated;");
    expect(sql).not.toMatch(/to\s+anon|to\s+public/);
  });

  test("does nothing else", () => {
    expect(sql).not.toMatch(/create |alter |drop |insert |update |delete /);
    const statements = sql.match(/\b(revoke|grant)\b/g) ?? [];
    expect(statements).toHaveLength(3);
  });

  test("guarded: a no-op when the function is absent", () => {
    expect(sql).toMatch(/if to_regprocedure\('public\.capture_match_candidates\(text, uuid, int\)'\) is not null then/);
  });

  test("is registered in the RLS runner after the RPC migration", () => {
    const runner = read("scripts", "test-rls.sh");
    expect(runner).toMatch(/^\s*capture_rpc_grants\.sql\s*$/m);
    expect(runner.indexOf("capture_match_rpc.sql")).toBeLessThan(runner.indexOf("capture_rpc_grants.sql"));
  });
});
