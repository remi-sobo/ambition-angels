import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Drift guard: migrations are applied by hand, so the practical mitigation for
// repo↔DB drift is that re-applying the whole folder is always safe. That holds
// only if every CREATE TABLE / CREATE INDEX is idempotent. This test enforces
// the convention on every migration so a non-idempotent one can't merge.

const DIR = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));

// Strip line comments so "-- create table foo" can't trip the check.
const stripComments = (sql: string) => sql.replace(/--.*$/gm, "");

describe("migration idempotency (drift guard)", () => {
  test("migrations exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    const sql = stripComments(readFileSync(join(DIR, f), "utf8")).toLowerCase();

    test(`${f}: every create table uses 'if not exists'`, () => {
      const offending = sql.match(/create\s+table\s+(?!if\s+not\s+exists)/g);
      expect(offending, "use 'create table if not exists'").toBeNull();
    });

    test(`${f}: every create index uses 'if not exists'`, () => {
      const offending = sql.match(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/g);
      expect(offending, "use 'create index if not exists'").toBeNull();
    });
  }
});
