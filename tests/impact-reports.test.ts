import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { KEPT_IN_PLACE, liveSeatFor } from "@/lib/admin/v2routes";
import { renderReportHtml as sharedRender } from "@/lib/reports/renderHtml";
import { renderReportHtml as finRender, ARTIFACT_TYPE as FIN_TYPE } from "@/lib/finance/reportExport";
import { ARTIFACT_TYPE as IMPACT_TYPE } from "@/lib/impact/reportExport";

// Spec Impact, stage I2 — the Reports builder, Contract 7's third exit.
// House pins: the renderer generalized WITHOUT changing fin output (DoD 4),
// the Impact route mirrors the fin route's gate-before-write shape, and the
// N3 structural pins repeat verbatim on the new surface.

const root = join(__dirname, "..");
const src = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("decision 2: shared machinery, parallel exits", () => {
  test("finance re-exports the SAME renderer function — byte identity is structural", () => {
    // One function object: the fin route and the impact route literally call
    // the same code, so the fin artifact cannot drift by construction.
    expect(finRender).toBe(sharedRender);
    expect(FIN_TYPE).toBe("fin_report");
    expect(IMPACT_TYPE).toBe("impact_report");
  });

  test("the shared renderer keeps the N3 honesty rules (dates on values, waivers printed in)", () => {
    const html = sharedRender({
      title: "FY27 outcomes <update>",
      orgName: "Ambition Angels",
      generatedOn: "2026-09-09",
      metrics: [
        { key: "a", name: "Teens served", value: 3500, capturedOn: "2026-09-01", unit: null, flag: null },
        { key: "b", name: "Completion", value: null, capturedOn: null, unit: "%", flag: "conflict" },
      ],
      narrative: null,
      waivers: [{ metricKey: "b", reason: "Board approved interim figure", waivedAt: "2026-09-09T01:00:00Z" }],
    });
    expect(html).toContain("as of 2026-09-01");
    expect(html).toContain("never captured");
    expect(html).toContain("Shipped with waivers (Contract 7)");
    expect(html).toContain("waived 2026-09-09, reports.approve");
    expect(html).toContain("FY27 outcomes &lt;update&gt;"); // esc() travelled with the move
  });

  test("the compose form and gate strip are the finance components, parameterized — not copies", () => {
    const page = src("app", "admin", "impact", "reports", "page.tsx");
    expect(page).toMatch(/from "@\/app\/admin\/finance\/reports\/_components\/ComposeForm"/);
    expect(page).toMatch(/from "@\/app\/admin\/finance\/reports\/_components\/ExportControls"/);
    expect(page).toMatch(/basePath="\/admin\/impact\/reports"/);
    expect(page).toMatch(/exportUrl="\/api\/admin\/impact\/reports\/export"/);
    // The fin defaults still ARE the fin behavior.
    const compose = src("app", "admin", "finance", "reports", "_components", "ComposeForm.tsx");
    expect(compose).toMatch(/basePath = "\/admin\/finance\/reports"/);
    expect(compose).toMatch(/defaultTitle = "Financial report"/);
    const controls = src("app", "admin", "finance", "reports", "_components", "ExportControls.tsx");
    expect(controls).toMatch(/exportUrl = "\/api\/admin\/finance\/reports\/export"/);
  });
});

describe("I2 structural pins (the N3 pins, on the new surface)", () => {
  const page = src("app", "admin", "impact", "reports", "page.tsx");
  const route = src("app", "api", "admin", "impact", "reports", "export", "route.ts");

  test("the seat exists: kept-in-place, self-resolving — the seatless set is EMPTY", () => {
    expect(KEPT_IN_PLACE).toContain("/admin/impact/reports");
    expect(liveSeatFor("/admin/impact/reports")).toBe("/admin/impact/reports");
  });

  test("drafting is never blocked: the draft renders through <Metric>, gate named but never gating render", () => {
    expect(page).toMatch(/checkExportGate\(ARTIFACT_TYPE, rid, keys\)/);
    expect(page).toMatch(/<Metric metricKey=\{key\} showName \/>/);
    expect(page).not.toMatch(/gate\.blocked[\s\S]{0,40}(notFound|return null|redirect)/);
  });

  test("the exit: gate → 409 before ANY write; rid becomes the document id; loud re-export", () => {
    expect(route).toMatch(/status: 409/);
    expect(route.indexOf("gate.blocked")).toBeLessThan(route.indexOf(".upload("));
    expect(route).toMatch(/id: rid,/);
    expect(route).toMatch(/waivers: gate\.waivers/);
    expect(route).toMatch(/upsert: false/);
    expect(route).toMatch(/impact\.report\.export/);
  });

  test("the permission authority stays the waiver route's RLS — nothing here writes a waiver", () => {
    for (const s of [page, route]) {
      expect(s).not.toMatch(/from\("export_waivers"\)[\s\S]{0,80}insert/);
      expect(s).not.toMatch(/has_permission/);
    }
    // The narrative slot renders only an APPROVED Reed draft.
    for (const s of [page, route]) {
      expect(s).toMatch(/eq\("status", "approved"\)/);
      expect(s).toMatch(/"report_narrative"/);
    }
  });

  test("the spec's ONE migration: the impact_report entity_types row, registered in the harness", () => {
    const mig = src("supabase", "migrations", "spec_impact_report_artifacts.sql");
    expect(mig).toMatch(/values \('impact_report',/);
    expect(mig).toMatch(/on conflict \(entity_type\) do nothing/);
    expect(mig).not.toMatch(/alter table[\s\S]*reed_drafts/i); // the kind check is untouched (spec ruling)
    const harness = src("scripts", "test-rls.sh");
    expect(harness).toMatch(/spec_impact_report_artifacts\.sql/);
  });
});
