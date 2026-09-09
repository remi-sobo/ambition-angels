import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Spec Programs, stage P2 — Overview, the destination's landing. House
// structural pins: the host stops re-exporting the placeholder, the build is
// bound data only (no funnel — decision 3), reads only, and the V1
// /admin/program placeholder stays byte-identical behind its 308.

const app = join(__dirname, "..", "app");
const src = readFileSync(join(app, "admin", "programs", "overview", "page.tsx"), "utf8");

describe("P2 structural pins", () => {
  test("the host is a real page now — no re-export of the placeholder", () => {
    expect(src).not.toMatch(/from "@\/app\/admin\/program\/page"/);
    expect(src).toMatch(/Needs attention/);
    expect(src).toMatch(/force-dynamic/);
  });

  test("bound data only — the UNBOUND funnel stays out (decision 3, failure mode 2)", () => {
    // No metric_snapshots read, no funnel stages: the landing never fakes a
    // platform-app number.
    expect(src).not.toMatch(/metric_snapshots/);
    expect(src).not.toMatch(/signed.?up[\s\S]*started[\s\S]*finished/i);
  });

  test("reads only, org-fenced, and every row links the owning screen", () => {
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    const fences = src.match(/\.eq\("org_id", orgId\)/g) ?? [];
    expect(fences.length).toBe(6); // cohorts, sessions, members, attendance, students, applications
    expect(src).toMatch(/\/admin\/programs\/people\/\$\{/); // drops + guardian rows → the person
    expect(src).toMatch(/href="\/admin\/programs\/intake"/); // intake row → intake
    expect(src).toMatch(/href="\/admin\/programs\/attendance"/); // schedule → the P1 surface
    expect(src).toMatch(/\/admin\/programs\/cohorts\/\$\{s\.cohort_id\}\/sessions\/\$\{s\.id\}/);
  });

  test("the rollups and contact rule speak the module's own language", () => {
    // Attendance math matches the Groups page (present+late attend; excused
    // marks count against no one); the contact rule matches the roster
    // (reachable = student email OR guardian email/phone via cf).
    expect(src).toMatch(/m\.status === "present" \|\| m\.status === "late"/);
    expect(src).toMatch(/"excused"/);
    expect(src).toMatch(/cf\(s, "guardian_email"\)/);
    expect(src).toMatch(/getProgramTerms/);
  });

  test("the V1 /admin/program placeholder is untouched behind its 308", () => {
    const v1 = readFileSync(join(app, "admin", "program", "page.tsx"), "utf8");
    expect(v1).toMatch(/Partners, teens, outcomes\./);
    expect(v1).not.toMatch(/supabase/i);
  });
});
