import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Capture C6: the edited stamp on filed rows. The RLS harness proves the
// behavior; this pins the shape.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const body = read("supabase", "migrations", "capture_fix_stamps.sql")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .toLowerCase();

describe("capture_fix_stamps.sql", () => {
  test("edited_at and edited_by on both filed-row tables, nullable, guarded", () => {
    for (const t of ["interactions", "partner_interactions"]) {
      expect(body).toContain(`alter table public.${t} add column if not exists edited_at timestamptz;`);
      expect(body).toContain(`alter table public.${t} add column if not exists edited_by text;`);
    }
    expect(body).not.toMatch(/not null|default/);
  });

  test("columns only: no policies, grants, drops, or backfill", () => {
    expect(body).not.toMatch(/policy|grant|revoke|drop|update |insert |delete /);
    expect(body.match(/add column if not exists/g)).toHaveLength(4);
  });

  test("registered in the RLS runner after capture_drafts_permission", () => {
    const runner = read("scripts", "test-rls.sh");
    expect(runner).toMatch(/^\s*capture_fix_stamps\.sql\s*$/m);
    expect(runner.indexOf("capture_drafts_permission.sql")).toBeLessThan(runner.indexOf("capture_fix_stamps.sql"));
  });
});
