import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Capture C5: the capture_obligations migration's shape. The RLS harness
// proves the behavior (supabase/tests/rls-leak-test.sql, C5 block); this pins
// the text so it can't drift in review.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const raw = read("supabase", "migrations", "capture_obligations.sql");
const body = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .toLowerCase();
const prev = read("supabase", "migrations", "spec_fr_next_step_obligations.sql");

const between = (s: string, a: string, b: string) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

describe("capture_obligations.sql (C5)", () => {
  test("eleven arms, invoker on, the new arm is capture", () => {
    expect(body).toMatch(/create or replace view public\.v_obligations\s+with \(security_invoker = on\)/);
    expect(body.match(/union all/g)?.length).toBe(10);
    expect(body).toMatch(/select 'capture:' \|\| c\.id,\s+c\.org_id, 'capture',/);
  });

  test("the ten existing arms are verbatim from the F5 file", () => {
    const old = between(prev, "create or replace view public.v_obligations", "    and (o.snoozed_until is null or o.snoozed_until <= current_date);");
    expect(raw).toContain(old);
  });

  test("the capture arm: creator only, pending cards only, snoozable, flagged as participant data", () => {
    const arm = body.slice(body.indexOf("select 'capture:'"), body.indexOf("comment on view"));
    expect(arm).toMatch(/c\.created_by = auth\.uid\(\)/);
    expect(arm).toMatch(/k\.status in \('proposed', 'held'\)/);
    expect(arm).toMatch(/c\.status = 'ready'/);
    expect(arm).toMatch(/c\.snoozed_until is null or c\.snoozed_until <= current_date/);
    expect(arm).toMatch(/'ops',\s+true\s+from public\.captures c/);
    // The title is a count and a time; never transcript or card text.
    expect(arm).not.toMatch(/transcript|payload|heard_name/);
  });

  test("every arm still sets the participant flag explicitly", () => {
    const view = body.slice(body.indexOf("create or replace view"), body.indexOf("comment on view"));
    const arms = view.split("union all");
    expect(arms).toHaveLength(11);
    for (const a of arms) expect(a).toMatch(/\b(true|false)\s+(as contains_participant_data\s+)?from public\./);
  });

  test("resolve and snooze gain a capture branch, creator-only; the other branches are verbatim", () => {
    for (const fn of ["resolve_obligation", "snooze_obligation"]) {
      const at = body.indexOf(`create or replace function public.${fn}`);
      const src = body.slice(at, body.indexOf("$$;", at));
      expect(src, fn).toMatch(/elsif p_source = 'capture' then/);
      expect(src, fn).toMatch(/from public\.captures\s+where id = p_source_id and created_by = auth\.uid\(\)/);
      expect(src, fn).toMatch(/private\.has_permission\(v_org, 'ops\.write'\)/);
    }
    for (const branch of ["'ops_task'", "'grant_requirement'", "'compliance_item'", "'acknowledgment'", "'fr_next_step'"]) {
      expect(body).toContain(`p_source = ${branch} then`);
    }
    // resolve discards only what is still pending, and closes the capture
    expect(body).toMatch(/set status = 'discarded', decided_by = auth\.uid\(\), decided_at = now\(\)\s+where capture_id = p_source_id and status in \('proposed', 'held'\)/);
    expect(body).toMatch(/update public\.captures set status = 'done', snoozed_until = null where id = p_source_id/);
  });

  test("captures.snoozed_until is additive", () => {
    expect(body).toContain("alter table public.captures add column if not exists snoozed_until date;");
  });

  test("the purge clears transcripts and source sentences after 90 days, scheduled only where pg_cron exists", () => {
    expect(body).toMatch(/create or replace function private\.capture_purge_transcripts\(p_days int default 90\)/);
    expect(body).toMatch(/set transcript = null/);
    expect(body).toMatch(/payload = k\.payload - 'source_sentence'/);
    expect(body).toMatch(/revoke all on function private\.capture_purge_transcripts\(int\) from public;/);
    expect(body).toMatch(/if exists \(select 1 from pg_extension where extname = 'pg_cron'\)/);
    expect(body).toMatch(/if not exists \(select 1 from cron\.job where jobname = 'capture-transcript-purge'\)/);
    expect(body).toMatch(/cron\.schedule\('capture-transcript-purge', '17 10 \* \* \*', 'select private\.capture_purge_transcripts\(90\)'\)/);
    // the purge never touches a destination table
    const purge = body.slice(body.indexOf("create or replace function private.capture_purge_transcripts"));
    expect(purge).not.toMatch(/public\.(interactions|partner_interactions|ops_tasks|reed_drafts)/);
  });

  test("guarded form", () => {
    expect(body).not.toMatch(/drop policy|drop trigger|drop view|drop function/);
  });

  test("registered in the RLS runner after the grants migration", () => {
    const runner = read("scripts", "test-rls.sh");
    expect(runner).toMatch(/^\s*capture_obligations\.sql\s*$/m);
    expect(runner.indexOf("capture_rpc_grants.sql")).toBeLessThan(runner.indexOf("capture_obligations.sql"));
  });
});
