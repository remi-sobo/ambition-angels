import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Capture close-out: capture_message drafts need ops.write in the database.
// The RLS harness proves the behavior; this pins the shape.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const body = read("supabase", "migrations", "capture_drafts_permission.sql")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .toLowerCase();

describe("capture_drafts_permission.sql", () => {
  test("three restrictive policies on reed_drafts: insert, update, delete", () => {
    for (const cmd of ["insert", "update", "delete"]) {
      expect(body).toContain(`create policy "capture drafts need ops.write (${cmd})" on public.reed_drafts`);
      expect(body).toMatch(new RegExp(`as restrictive for ${cmd} to authenticated`));
    }
    expect(body).not.toMatch(/as permissive|for select|for all/);
  });

  test("scoped to capture_message only, gated on ops.write", () => {
    const clauses = body.match(/kind <> 'capture_message' or \(select private\.has_permission\(org_id, 'ops\.write'\)\)/g) ?? [];
    // insert: with check; update: using + with check; delete: using
    expect(clauses).toHaveLength(4);
  });

  test("guarded form: created only if absent, nothing dropped", () => {
    expect(body).not.toMatch(/drop policy|drop table|alter table/);
    expect(body.match(/if not exists \(select 1 from pg_policies/g)).toHaveLength(3);
  });

  test("registered in the RLS runner after capture_obligations", () => {
    const runner = read("scripts", "test-rls.sh");
    expect(runner).toMatch(/^\s*capture_drafts_permission\.sql\s*$/m);
    expect(runner.indexOf("capture_obligations.sql")).toBeLessThan(runner.indexOf("capture_drafts_permission.sql"));
  });

  test("the leak test asserts the board_viewer refusal instead of the old gap", () => {
    const leak = read("supabase", "tests", "rls-leak-test.sql");
    expect(leak).toContain("LEAK: board_viewer inserted a capture_message draft");
    expect(leak).not.toContain("reed_drafts now refuses board_viewer: tighten this block");
  });
});
