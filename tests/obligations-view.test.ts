import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Spec A, stage A2 — structural contract of the v_obligations migration
// (supabase/migrations/spec_a_v_obligations.sql), including the participant
// amendment (specs/spec-a-a2-participant-obligations-amendment.md): every
// arm sets contains_participant_data EXPLICITLY, participant-sourced arms
// set it true, and the view never grows a connection_candidates arm or a
// definer escape hatch. These are text-level assertions on the migration —
// the RLS harness proves the behavior; this proves the shape can't drift
// silently in review.

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "spec_a_v_obligations.sql"),
  "utf8",
);

// The executable body only — strip line comments so prose can't satisfy (or
// trip) the structural assertions.
const body = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("v_obligations: the nine arms", () => {
  test("security_invoker is on — a definer view would merge tenants", () => {
    expect(body).toMatch(/create or replace view public\.v_obligations\s+with \(security_invoker = on\)/);
  });

  test("exactly nine arms (eight union alls)", () => {
    expect(body.match(/union all/g)?.length).toBe(8);
  });

  test("connection_candidates is not an arm (excluded on purpose; the comment says why)", () => {
    expect(body).not.toMatch(/from\s+public\.connection_candidates/i);
    // The reasoning must stay in the file so nobody adds it from the column list.
    expect(sql).toMatch(/obligation is[\s']*something you owe/i);
  });

  test("every arm sets contains_participant_data as an explicit literal — no default, no NULL", () => {
    const literals = body.match(/\b(?:true|false)\b\s+as contains_participant_data|\b(?:true|false)\b(?=\s*\n\s+from\s)/g);
    // First arm aliases it; the union arms carry a bare literal in position.
    const aliased = body.match(/\b(?:true|false)\b\s+as contains_participant_data/g) ?? [];
    const bare = body.match(/^\s+(?:true|false)\s*$/gm) ?? [];
    expect(aliased.length + bare.length).toBe(9);
    expect(literals?.length).toBeGreaterThan(0);
  });

  test("participant-sourced arms are flagged true; every other arm false", () => {
    const arms = body.split(/union all/);
    expect(arms.length).toBe(9);
    for (const arm of arms) {
      const fromMatch = arm.match(/from\s+public\.(\w+)/);
      expect(fromMatch).not.toBeNull();
      const table = fromMatch![1];
      const flag = /(?:^\s+true\s*$|true\s+as contains_participant_data)/m.test(arm);
      if (table === "applications" || table === "cohort_sessions") {
        expect(flag, `${table} arm must set contains_participant_data = true`).toBe(true);
      } else {
        expect(flag, `${table} arm must set contains_participant_data = false`).toBe(false);
        expect(/(?:^\s+false\s*$|false\s+as contains_participant_data)/m.test(arm)).toBe(true);
      }
    }
  });

  test("the three snoozable arms exclude future snoozed_until; snooze is not resolution", () => {
    expect(body.match(/snoozed_until is null or \w\.snoozed_until <= current_date/g)?.length).toBe(3);
  });

  test("state is the unified enum — only open / in_progress / blocked appear", () => {
    // Every quoted literal that flows into the state position.
    const states = new Set<string>();
    for (const m of Array.from(body.matchAll(/when '(\w+)'\s+then '(\w+)'/g))) {
      states.add(m[2]);
    }
    for (const m of Array.from(body.matchAll(/then '(\w+)'\s*\n?\s*else '(\w+)' end/g))) {
      states.add(m[1]);
      states.add(m[2]);
    }
    // Constant-state arms.
    if (/'open',/.test(body)) states.add("open");
    for (const s of Array.from(states)) {
      expect(["open", "in_progress", "blocked"]).toContain(s);
    }
    expect(states.has("open")).toBe(true);
    expect(states.has("in_progress")).toBe(true);
    expect(states.has("blocked")).toBe(true);
  });

  test("v_action_items is untouched by this migration", () => {
    expect(body).not.toMatch(/v_action_items/);
  });
});
