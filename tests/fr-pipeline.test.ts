import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Spec Fundraising, stage F3 — structural pins for the Pipeline
// recomposition (the house pattern from the B3 DoD tests): the V1 routes
// must render the extracted components UNMODIFIED (byte-identical output,
// spec DoD 7), and the V2 screen must compose both.

const app = join(__dirname, "..", "app", "admin", "fundraising");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("F3 extraction invariants", () => {
  test("the V1 pipeline home is a thin stub over PipelineHome with the DEFAULT basePath", () => {
    const s = src("page.tsx");
    expect(s).toMatch(/import PipelineHome from "\.\/PipelineHome"/);
    expect(s).toMatch(/<PipelineHome searchParams=\{searchParams\} \/>/);
    expect(s).not.toMatch(/basePath=/); // no prop passed: default = /admin/fundraising, V1 unchanged
    expect(s).toMatch(/force-dynamic/);
  });

  test("the V1 ask log is a thin stub over AskLog with embedded OFF", () => {
    const s = src("asks", "page.tsx");
    expect(s).toMatch(/import AskLog from "\.\/AskLog"/);
    expect(s).toMatch(/<AskLog \/>/);
    expect(s).not.toMatch(/embedded/i);
  });

  test("the V2 Pipeline screen composes the board (filters pointed at itself) above the embedded log", () => {
    const s = src("pipeline", "page.tsx");
    expect(s).toMatch(/basePath="\/admin\/fundraising\/pipeline"/);
    expect(s).toMatch(/<AskLog embedded \/>/);
    // Board first, log second — the merge's shape, not an accident.
    expect(s.indexOf("PipelineHome searchParams")).toBeLessThan(s.indexOf("<AskLog embedded"));
  });

  test("PipelineHome routes its URL-driven filter tabs through basePath (never a hardcoded route)", () => {
    const s = src("PipelineHome.tsx");
    expect(s).toMatch(/basePath = "\/admin\/fundraising"/); // the V1 default
    expect(s).toMatch(/basePath=\{basePath\}/);
    expect(s).not.toMatch(/basePath="\/admin\/fundraising"\s*$/m);
  });

  test("AskLog embedded swaps page chrome for a section heading and nothing else", () => {
    const s = src("asks", "AskLog.tsx");
    expect(s).toMatch(/embedded = false/);
    expect(s).toMatch(/embedded \? undefined : "min-h-screen bg-ink"/);
    // The standalone branch still renders the exact V1 PageHeader.
    expect(s).toMatch(/<PageHeader\s*\n?\s*title="Ask Log"/);
  });
});
