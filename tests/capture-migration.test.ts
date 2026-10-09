import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Capture C1 (specs/bloomos-capture.md): pins the shape of the migration that
// creates the staging tables. Text assertions, like tests/migrations.test.ts
// and tests/fr-obligations.test.ts: the RLS matrix itself runs in
// supabase/tests/rls-leak-test.sql against a scratch Postgres.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const stripComments = (sql: string) => sql.replace(/--.*$/gm, "");

const raw = read("supabase", "migrations", "capture_tables.sql");
const sql = stripComments(raw).toLowerCase();

// Everything between `create table if not exists public.<name> (` and the
// matching `);` at column 0.
function tableBody(name: string): string {
  const m = sql.match(new RegExp(`create table if not exists public\\.${name}\\s*\\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`no create table for ${name}`);
  return m[1];
}

describe("capture_tables.sql (C1)", () => {
  test("creates both staging tables idempotently", () => {
    expect(sql).toMatch(/create table if not exists public\.captures\s*\(/);
    expect(sql).toMatch(/create table if not exists public\.capture_cards\s*\(/);
    // No bare create table / create index anywhere in the file.
    expect(sql.match(/create\s+table\s+(?!if\s+not\s+exists)/g)).toBeNull();
    expect(sql.match(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)/g)).toBeNull();
  });

  test("org_id is NOT NULL with no default on both tables (tenant-default ratchet)", () => {
    for (const t of ["captures", "capture_cards"]) {
      const body = tableBody(t);
      const orgLine = body.split("\n").find((l) => /^\s*org_id\s/.test(l));
      expect(orgLine, `${t}.org_id column`).toBeDefined();
      expect(orgLine).toMatch(/uuid\s+not\s+null/);
      expect(orgLine).not.toMatch(/default/);
    }
  });

  test("RLS is enabled on both tables", () => {
    expect(sql).toMatch(/alter table public\.captures enable row level security/);
    expect(sql).toMatch(/alter table public\.capture_cards enable row level security/);
  });

  test("four policies per table (select / insert / update / delete), each owner-fenced", () => {
    for (const t of ["captures", "capture_cards"]) {
      const re = new RegExp(`create policy "([^"]+)" on public\\.${t}\\b([\\s\\S]*?);`, "g");
      const policies: RegExpExecArray[] = [];
      for (let m = re.exec(sql); m; m = re.exec(sql)) policies.push(m);
      expect(policies, `${t} policies`).toHaveLength(4);
      const cmds = policies.map((p) => p[2].match(/for\s+(select|insert|update|delete)/)?.[1]).sort();
      expect(cmds).toEqual(["delete", "insert", "select", "update"]);
      for (const p of policies) {
        expect(p[2], `${t} policy "${p[1]}" is personal`).toMatch(/created_by\s*=\s*\(select auth\.uid\(\)\)/);
        expect(p[2], `${t} policy "${p[1]}" is permission-gated`).toMatch(/private\.has_permission\(org_id, 'ops\.(read|write)'\)/);
      }
      // Every policy is dropped before it is created (re-apply safe).
      for (const p of policies) {
        expect(sql).toContain(`drop policy if exists "${p[1]}" on public.${t}`);
      }
    }
  });

  test("capture_cards.entity_type never admits a student (youth-data fence)", () => {
    const body = tableBody("capture_cards");
    const check = body.match(/entity_type\s+text\s+check\s*\(([\s\S]*?)\),/);
    expect(check, "entity_type check clause").not.toBeNull();
    expect(check![1]).toContain("'constituent'");
    expect(check![1]).toContain("'partner'");
    expect(check![1]).not.toContain("student");
  });

  test("a card is tied to a capture in the same org by a composite FK", () => {
    expect(sql).toMatch(/create unique index if not exists captures_id_org_idx\s+on public\.captures \(id, org_id\)/);
    expect(tableBody("capture_cards")).toMatch(
      /foreign key \(capture_id, org_id\) references public\.captures \(id, org_id\) on delete cascade/,
    );
  });

  test("reed_drafts.kind gains capture_message without dropping existing kinds", () => {
    const m = sql.match(/add constraint reed_drafts_kind_check\s+check \(kind in \(([\s\S]*?)\)\)/);
    expect(m).not.toBeNull();
    for (const k of ["grant_narrative", "board_update", "acknowledgment", "strategy_review", "report_narrative", "capture_message"]) {
      expect(m![1]).toContain(`'${k}'`);
    }
    expect(sql).toContain("drop constraint if exists reed_drafts_kind_check");
  });

  test("seeds ai.capture for AA and YGB by slug, upsert", () => {
    expect(sql).toMatch(/'ai\.capture', true, 'seed:capture'/);
    expect(sql).toContain("'ambition-angels'");
    expect(sql).toContain("'young-gifted-black'");
    expect(sql).toMatch(/on conflict \(org_id, feature_key\)/);
    // Data, not code: no hardcoded org uuid.
    expect(sql).not.toMatch(/17c75da8-082d-4c8f-b00b-a4100fb2eb22/);
  });

  test("partners_name_trgm is guarded on pg_trgm being installed", () => {
    expect(sql).toContain("partners_name_trgm");
    expect(sql).toMatch(/from pg_extension e[\s\S]*where e\.extname = 'pg_trgm'/);
  });

  test("is registered in the RLS runner and the entitlement vocabulary", () => {
    expect(read("scripts", "test-rls.sh")).toMatch(/^\s*capture_tables\.sql\s*$/m);
    expect(read("lib", "admin", "entitlements.ts")).toMatch(/"ai\.capture"/);
  });
});
