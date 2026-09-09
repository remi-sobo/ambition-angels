import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveRitual, ritualForToday } from "@/lib/admin/ops/planClose";

// Spec Work, stage W1 — Plan & Close, the merged ritual screen. Pure switch
// semantics plus the house structural pins (fin-transactions pattern): the
// extraction must be a move, not a rewrite, and the V1 routes must stay
// byte-identical until their W4 308s.

describe("the ritual switch (decision 1, resolved: URL-driven)", () => {
  test("an explicit ?ritual= wins, whatever day it is", () => {
    for (let dow = 0; dow <= 6; dow++) {
      expect(resolveRitual("plan", dow)).toBe("plan");
      expect(resolveRitual("close", dow)).toBe("close");
    }
  });

  test("no param (or garbage) falls back to the doors page's split: Mon–Wed lights Plan, Thu–Sun lights Close", () => {
    // dow: 0=Sun … 6=Sat, exactly rhythmModeForToday's contract.
    for (const dow of [1, 2, 3]) {
      expect(resolveRitual(undefined, dow)).toBe("plan");
      expect(resolveRitual("nonsense", dow)).toBe("plan");
      expect(ritualForToday(dow)).toBe("plan");
    }
    for (const dow of [0, 4, 5, 6]) {
      expect(resolveRitual(undefined, dow)).toBe("close");
      expect(resolveRitual("", dow)).toBe("close");
      expect(ritualForToday(dow)).toBe("close");
    }
  });
});

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("W1 structural pins", () => {
  test("the V1 ritual routes are thin stubs over the extracted sections", () => {
    const mon = src("admin", "ops", "monday", "page.tsx");
    expect(mon).toMatch(/import PlanSection from "\.\/PlanSection"/);
    expect(mon).toMatch(/<PlanSection \/>/);
    const fri = src("admin", "ops", "friday", "page.tsx");
    expect(fri).toMatch(/import CloseSection from "\.\/CloseSection"/);
    expect(fri).toMatch(/<CloseSection \/>/);
    // Byte-identical V1: the stubs carry no data reads, no ritual switch —
    // the whole body moved into the section.
    for (const s of [mon, fri]) {
      expect(s).not.toMatch(/supabase/i);
      expect(s).not.toMatch(/searchParams/);
      expect(s).not.toMatch(/resolveRitual|\?ritual/);
      expect(s).toMatch(/force-dynamic/);
    }
  });

  test("the sections carry the moved ritual bodies, not reimplementations", () => {
    const plan = readFileSync(
      join(app, "admin", "ops", "monday", "PlanSection.tsx"),
      "utf8",
    );
    const close = readFileSync(
      join(app, "admin", "ops", "friday", "CloseSection.tsx"),
      "utf8",
    );
    // The rhythm_sessions writes and wizard steps travel as-is.
    expect(plan).toMatch(/rhythm_sessions/);
    expect(plan).toMatch(/"monday_plan"/);
    expect(plan).toMatch(/<RhythmWizard/);
    expect(close).toMatch(/rhythm_sessions/);
    expect(close).toMatch(/"friday_close"/);
    expect(close).toMatch(/<RhythmWizard/);
    expect(close).toMatch(/meeting_suggested_tasks/);
  });

  test("Plan & Close composes switch → the one lit ritual, both sections behind resolveRitual", () => {
    const s = src("admin", "work", "plan-close", "page.tsx");
    expect(s).toMatch(/import PlanSection from "@\/app\/admin\/ops\/monday\/PlanSection"/);
    expect(s).toMatch(/import CloseSection from "@\/app\/admin\/ops\/friday\/CloseSection"/);
    expect(s).toMatch(/resolveRitual\(searchParams\?\.ritual\)/);
    expect(s).toMatch(/\?ritual=/); // the switch links are URL-driven
    expect(s).toMatch(/ritual === "plan" \? <PlanSection \/> : <CloseSection \/>/);
    // The seat is gated like the V1 section it absorbs.
    const layout = src("admin", "work", "plan-close", "layout.tsx");
    expect(layout).toMatch(/feature="modules\.ops"/);
  });

  test("RhythmWizard's step writes preserve the rest of the query (?ritual= must survive stepping)", () => {
    const s = src("admin", "ops", "_components", "RhythmWizard.tsx");
    expect(s).toMatch(/new URLSearchParams\(sp\)/);
    expect(s).toMatch(/q\.set\("step"/);
    expect(s).not.toMatch(/\?step=\$\{/); // the old query-dropping template is gone
  });
});
