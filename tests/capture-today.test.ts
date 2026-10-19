import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rankObligations, whyFallback, type ObligationRow } from "@/lib/admin/todayRank";

vi.mock("server-only", () => ({}));

// Capture C5: pending captures on Today, and Record on a record's own page.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const row = (over: Partial<ObligationRow>): ObligationRow => ({
  id: "x:1",
  type: "ops_task",
  title: "t",
  why_it_matters: null,
  due_date: null,
  state: "open",
  module: "ops",
  ...over,
});

describe("Today ranks and explains a pending capture", () => {
  test("a capture dated today sits with today's work, after a same-day task", () => {
    const today = "2026-10-13";
    const ranked = rankObligations(
      [
        row({ id: "capture:a", type: "capture", title: "2 cards waiting from your Tue 9:14 AM recording", due_date: today }),
        row({ id: "ops_task:b", type: "ops_task", title: "Call the venue", due_date: today }),
        row({ id: "metric_stale:c", type: "metric_stale", title: "Update metric", due_date: null }),
      ],
      today,
    );
    expect(ranked.map((r) => r.id)).toEqual(["ops_task:b", "capture:a", "metric_stale:c"]);
  });

  test("an unsorted capture from yesterday is overdue", () => {
    const ranked = rankObligations(
      [row({ id: "ops_task:b", due_date: "2026-10-14" }), row({ id: "capture:a", type: "capture", due_date: "2026-10-12" })],
      "2026-10-13",
    );
    expect(ranked[0].id).toBe("capture:a");
  });

  test("the fallback line says what it is", () => {
    expect(whyFallback(row({ type: "capture" }), "2026-10-13")).toBe(
      "Cards from your recording are waiting for you to confirm, edit, or discard.",
    );
  });
});

describe("Today wiring (structural)", () => {
  test("capture links to its own page, snoozes, and is never a one-tap Done", () => {
    const src = read("lib", "admin", "today.ts");
    expect(src).toMatch(/r\.type === "capture"\s*\?\s*`\/admin\/capture\/\$\{sourceId\}`/);
    expect(src).toMatch(/const SNOOZABLE = new Set\(\[[^\]]*"capture"[^\]]*\]\)/);
    const resolvable = src.match(/const RESOLVABLE = new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";
    expect(resolvable).not.toContain("capture");
  });

  test("the obligations route accepts the capture source", () => {
    expect(read("app", "api", "admin", "obligations", "route.ts")).toMatch(/"capture",/);
  });

  test("every source map knows capture", () => {
    expect(read("lib", "admin", "actionQueue.ts")).toMatch(/\| "capture";/);
    expect(read("lib", "admin", "actionQueue.ts")).toMatch(/capture: "\/admin\/today"/);
    expect(read("app", "admin", "_components", "NeedsYouQueueClient.tsx")).toMatch(/capture: "Recording"/);
  });
});

describe("Record on a record's page", () => {
  test("donor profile: gated on ai.capture, constituent context", () => {
    const src = read("app", "admin", "fundraising", "donors", "[id]", "DonorProfile.tsx");
    expect(src).toMatch(/const captureEnabled = await hasEntitlement\("ai\.capture"\);/);
    expect(src).toMatch(/captureEnabled && <RecordButton context=\{\{ type: "constituent", id: c\.id, name \}\} \/>/);
  });

  test("partner profile: gated on ai.capture, partner context", () => {
    const src = read("app", "admin", "partners", "[id]", "page.tsx");
    expect(src).toMatch(/const captureEnabled = hasFeature\(await getEntitlements\(orgId\), "ai\.capture"\);/);
    expect(src).toMatch(/captureEnabled && <RecordButton context=\{\{ type: "partner", id: p\.id, name: p\.name \}\} \/>/);
  });

  test("ask detail: opportunity context when linked, else the funder; gated", () => {
    const src = read("app", "admin", "fundraising", "asks", "[id]", "AskDetail.tsx");
    expect(src).toMatch(/const captureEnabled = await hasEntitlement\("ai\.capture"\);/);
    expect(src).toMatch(/type: "opportunity" as const, id: opportunity\.id/);
    expect(src).toMatch(/type: "constituent" as const, id: funder\.id/);
    expect(src).toMatch(/captureEnabled && recordContext && <RecordButton context=\{recordContext\} \/>/);
  });

  test("the modal sends the context to the parse route and shows who it's about", () => {
    const src = read("app", "admin", "capture", "_components", "CaptureModal.tsx");
    expect(src).toMatch(/context_type: context\?\.type \?\? null,/);
    expect(src).toMatch(/context_id: context\?\.id \?\? null,/);
    expect(src).toMatch(/About <span[^>]*>\{context\.name\}<\/span>/);
    expect(read("app", "admin", "capture", "_components", "RecordButton.tsx")).toMatch(/<CaptureModal surface="entity_page" context=\{context\}/);
  });
});
