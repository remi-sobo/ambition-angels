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

  test("regression: cf/fullName come from the SERVER-SAFE module, never the client one", () => {
    // Production crash (Vercel digest 573398458): this server component
    // imported cf from the "use client" StudentControls module — in the
    // build that export is a client reference, and the page threw
    // `(0, c.cf) is not a function` at render. The pure helpers live in
    // students/_lib/studentFields now; StudentControls re-exports for its
    // client importers.
    expect(src).toMatch(/from "@\/app\/admin\/students\/_lib\/studentFields"/);
    expect(src).not.toMatch(/from "@\/app\/admin\/students\/_components\/StudentControls"/);
    const fields = readFileSync(
      join(app, "admin", "students", "_lib", "studentFields.ts"),
      "utf8",
    );
    // A directive only counts at the top of the file; the header comment may
    // quote it while telling the story.
    expect(fields.startsWith('"use client"')).toBe(false);
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

  // V4 B2: the dead /admin/program placeholder is deleted; its 308 stays.
  test("/admin/program still 308s to the Overview (the placeholder page is gone)", () => {
    const config = readFileSync(join(__dirname, "..", "next.config.mjs"), "utf8");
    expect(config).toMatch(/source: "\/admin\/program", destination: "\/admin\/programs\/overview", permanent: true/);
  });
});
