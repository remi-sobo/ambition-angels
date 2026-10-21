import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// resolve_obligation_ack_stamps.sql: an acknowledgment resolved through the
// RPC is stamped and closes its sys:gift task, like /acknowledgments/mark.
// The RLS harness proves the behavior (supabase/tests/rls-leak-test.sql,
// ack-stamp block); this pins the text so it can't drift in review.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const fn = (sql: string) =>
  sql.slice(
    sql.indexOf("create or replace function public.resolve_obligation"),
    sql.indexOf("end $$;", sql.indexOf("create or replace function public.resolve_obligation")) + 7,
  );
const next = fn(read("supabase", "migrations", "resolve_obligation_ack_stamps.sql"));
const prev = fn(read("supabase", "migrations", "capture_obligations.sql"));

describe("resolve_obligation_ack_stamps.sql", () => {
  test("the acknowledgment branch stamps acknowledged_at and closes the sys:gift task in the gift's org", () => {
    expect(next).toMatch(/set acknowledgment_status = 'sent', acknowledged_at = now\(\) where id = p_source_id;/);
    expect(next).toMatch(
      /update public\.ops_tasks set status = 'done', completed_at = now\(\)\s+where org_id = v_org and labels @> array\['sys:gift:' \|\| p_source_id::text\] and status <> 'done';/,
    );
  });

  test("everything else is verbatim from the previous definition", () => {
    const strip = (s: string) =>
      s
        .replace(
          /    update public\.gifts set acknowledgment_status = 'sent'[^\n]*\n(    --[^\n]*\n)*(    update public\.ops_tasks[^\n]*\n      where org_id = v_org[^\n]*\n)?/,
          "",
        );
    expect(strip(next)).toBe(strip(prev));
  });

  test("the permission fence is still in front of the write", () => {
    const ack = next.slice(next.indexOf("p_source = 'acknowledgment'"), next.indexOf("p_source = 'fr_next_step'"));
    expect(ack.indexOf("private.has_permission(v_org, 'fundraising.write')")).toBeLessThan(ack.indexOf("update public.gifts"));
  });

  test("the RLS harness applies it and asserts the result", () => {
    expect(read("scripts", "test-rls.sh")).toMatch(/resolve_obligation_ack_stamps\.sql/);
    expect(read("supabase", "tests", "rls-leak-test.sql")).toMatch(/ack-stamp: resolve left acknowledged_at null/);
  });
});
