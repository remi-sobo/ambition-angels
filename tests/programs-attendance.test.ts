import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { KEPT_IN_PLACE, liveSeatFor } from "@/lib/admin/v2routes";

// Spec Programs, stage P1 — Attendance, the model's one seatless screen.
// House structural pins: the screen reads and links, the session sheet keeps
// owning every attendance write, and the seat is kept-in-place (a V2-only
// screen whose own path IS the seat — the organization-health precedent).

const app = join(__dirname, "..", "app");
const src = readFileSync(join(app, "admin", "programs", "attendance", "page.tsx"), "utf8");

describe("P1 structural pins", () => {
  test("the seat exists: kept-in-place, self-resolving", () => {
    expect(KEPT_IN_PLACE).toContain("/admin/programs/attendance");
    expect(liveSeatFor("/admin/programs/attendance")).toBe("/admin/programs/attendance");
  });

  test("READS ONLY — the sheet keeps owning every attendance write (failure mode 1)", () => {
    // No insert/update/upsert/delete anywhere on this screen, and no fetch
    // to a write route: rows only link the existing check-in sheet.
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(src).not.toMatch(/fetch\(/);
    expect(src).toMatch(/\/admin\/programs\/cohorts\/\$\{s\.cohort_id\}\/sessions\/\$\{s\.id\}/);
  });

  test("every read is org-fenced (the house trap)", () => {
    const fences = src.match(/\.eq\("org_id", orgId\)/g) ?? [];
    expect(fences.length).toBe(4); // cohorts, cohort_sessions, cohort_members, attendance
  });

  test("the rollup speaks the Groups page's language: present+late attend, canceled sessions excluded", () => {
    expect(src).toMatch(/m\.status === "present" \|\| m\.status === "late"/);
    expect(src).toMatch(/s\.status !== "canceled"/);
    // Terminology rides the same resolver as the rest of the program module.
    expect(src).toMatch(/getProgramTerms/);
  });

  test("the sheet's own page still exists at the seat this screen links", () => {
    const sheet = join(
      app, "admin", "programs", "cohorts", "[id]", "sessions", "[sessionId]", "page.tsx",
    );
    expect(readFileSync(sheet, "utf8")).toBeTruthy();
  });
});
