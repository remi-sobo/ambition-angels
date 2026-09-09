import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { rankObligations, whyFallback, type ObligationRow } from "@/lib/admin/todayRank";

// Spec Fundraising, stage F5 — the fr_next_step arm (decision 2, signed).
// Structural pins on the F5 migration mirror tests/obligations-view.test.ts'
// contract for A2 (which keeps pinning the ORIGINAL nine-arm file): the
// re-created view must keep every A2 guarantee and add exactly one arm.

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "spec_fr_next_step_obligations.sql"),
  "utf8",
);
const body = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("the F5 migration re-creates v_obligations with exactly ten arms", () => {
  test("security_invoker stays on", () => {
    expect(body).toMatch(/create or replace view public\.v_obligations\s+with \(security_invoker = on\)/);
  });

  test("ten arms (nine union alls), the new one over opportunities", () => {
    expect(body.match(/union all/g)?.length).toBe(9);
    expect(body).toMatch(/'fr_next_step:' \|\| o\.id/);
    expect(body).toMatch(/from public\.opportunities o/);
  });

  test("connection_candidates stays excluded, and the reasoning stays in the file", () => {
    expect(body).not.toMatch(/from\s+public\.connection_candidates/i);
    expect(sql).toMatch(/An obligation is something[\s']*you owe/i);
  });

  test("the flood guard is the DATE: only dated, non-empty next steps on open stages", () => {
    expect(body).toMatch(/o\.next_step is not null and btrim\(o\.next_step\) <> ''/);
    expect(body).toMatch(/o\.next_step_due is not null/);
    expect(body).toMatch(/o\.stage not in \('steward', 'lost'\)/);
  });

  test("the arm snoozes like the primary sources (A1 column pattern)", () => {
    expect(body).toMatch(/alter table public\.opportunities add column if not exists snoozed_until date/);
    expect(body).toMatch(/o\.snoozed_until is null or o\.snoozed_until <= current_date/);
    // snooze_obligation gains the branch:
    expect(body).toMatch(/elsif p_source = 'fr_next_step' then[\s\S]*?set snoozed_until = p_until/);
  });

  test("resolve means THE MOVE WAS MADE: both step fields clear, nothing else changes", () => {
    expect(body).toMatch(/set next_step = null, next_step_due = null, snoozed_until = null/);
    // Never a stage change from the RPC:
    expect(body).not.toMatch(/update public\.opportunities[\s\S]{0,200}set[\s\S]{0,80}stage/);
  });

  test("the arm is not participant data, and sets the literal explicitly", () => {
    const arm = body.split(/union all/).at(-1)!;
    expect(arm).toMatch(/from public\.opportunities o/);
    expect(/^\s+false\s*$/m.test(arm)).toBe(true);
    expect(/^\s+true\s*$/m.test(arm)).toBe(false);
  });
});

describe("Today integration (rank + honest fallback)", () => {
  const row = (over: Partial<ObligationRow>): ObligationRow => ({
    id: "fr_next_step:x",
    type: "fr_next_step",
    title: "Next move: send the FY27 proposal",
    why_it_matters: null,
    due_date: "2026-09-01",
    state: "open",
    module: "fundraising",
    ...over,
  });

  test("an overdue next move ranks with the overdue bucket, most overdue first", () => {
    const ranked = rankObligations(
      [
        row({ id: "a", due_date: "2026-09-05" }),
        { ...row({ id: "b" }), type: "ops_task", title: "Task", due_date: "2026-09-01" },
        row({ id: "c", due_date: "2026-08-20" }),
      ],
      "2026-09-08",
    );
    expect(ranked.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  test("the fallback line is honest and type-specific — never a bare checkbox", () => {
    expect(whyFallback(row({}), "2026-09-08")).toBe(
      "A move you set on an open ask — was due 2026-09-01.",
    );
    expect(whyFallback(row({ due_date: "2026-09-08" }), "2026-09-08")).toBe(
      "A move you set on an open ask — due today.",
    );
  });
});
