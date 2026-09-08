import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { sanitizeOriginPath } from "@/lib/admin/originPath";

// Spec B, stage B6 — Quick Add and issue reporting in the shell. DoD 5:
// report-an-issue works from Quick Add and mobile More, files into "BloomOS
// Upgrades" with the claude-prompt label, and carries origin_path.

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

describe("sanitizeOriginPath: structured, never attacker-shaped", () => {
  test("accepts app-relative /admin paths, capped at 200 chars", () => {
    expect(sanitizeOriginPath("/admin/work/tasks")).toBe("/admin/work/tasks");
    expect(sanitizeOriginPath("/admin")).toBe("/admin");
    expect(sanitizeOriginPath(`/admin/${"x".repeat(300)}`)).toHaveLength(200);
  });

  test("rejects anything that is not a plain /admin path", () => {
    expect(sanitizeOriginPath("https://evil.example/admin")).toBeNull();
    expect(sanitizeOriginPath("//evil.example/admin")).toBeNull();
    expect(sanitizeOriginPath("/admin//x")).toBeNull();
    expect(sanitizeOriginPath('/admin/<script>"')).toBeNull();
    expect(sanitizeOriginPath("/teens")).toBeNull();
    expect(sanitizeOriginPath("")).toBeNull();
    expect(sanitizeOriginPath(null)).toBeNull();
    expect(sanitizeOriginPath(42)).toBeNull();
  });
});

describe("origin_path flows end to end (structural)", () => {
  test("ReportModal sends the page it was opened on as a structured field", () => {
    const src = read("app", "admin", "_components", "ReportModal.tsx");
    expect(src).toMatch(/fd\.append\("origin_path", pathname\)/);
  });

  test("the report route validates it and writes ops_tasks.origin_path", () => {
    const src = read("app", "api", "admin", "report", "route.ts");
    expect(src).toMatch(/sanitizeOriginPath\(form\.get\("origin_path"\)\)/);
    expect(src).toMatch(/origin_path: originPath/);
    // The preservation-gate essentials stay intact:
    expect(src).toMatch(/BloomOS Upgrades/);
    expect(src).toMatch(/claude-prompt/);
    expect(src).toMatch(/bloomos-reports/);
  });
});

describe("the shell triggers (structural)", () => {
  test("V2QuickAdd: task + report + Reed (gated) + the search overlay, desktop-only", () => {
    const src = read("app", "admin", "_components", "v2", "V2QuickAdd.tsx");
    expect(src).toMatch(/hidden lg:flex/);
    expect(src).toMatch(/setModal\("task"\)/);
    expect(src).toMatch(/setModal\("report"\)/);
    expect(src).toMatch(/bloomos:search:open/); // the search overlay trigger
    expect(src).toMatch(/reedEnabled && \(/);
    expect(src).toMatch(/ReportModal/);
  });

  test("mobile More sheet carries Report an issue (DoD 5's second trigger)", () => {
    const src = read("app", "admin", "_components", "v2", "V2MobileBar.tsx");
    // The More sheet section sets the report modal, beyond the + action sheet.
    expect(src.match(/setModal\("report"\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("the V2 layout mounts V2QuickAdd and drops the V1 FAB from the V2 branch only", () => {
    const src = read("app", "admin", "layout.tsx");
    expect(src).toMatch(/<V2QuickAdd currentUser=\{user\} reedEnabled=\{reedEnabled\} \/>/);
    // The V1 branch keeps its FAB untouched (DoD 8).
    expect(src).toMatch(/\{authed && <QuickAddButton currentUser=\{user\} \/>\}/);
  });
});
