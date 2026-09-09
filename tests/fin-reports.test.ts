import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ARTIFACT_TYPE, renderReportHtml } from "@/lib/finance/reportExport";

// Spec Finance, stage N3 — the Reports builder: Contract 7's exit gate as a
// user experience. Pure artifact rendering + the house structural pins.

describe("renderReportHtml — the artifact carries its own honesty", () => {
  const base = {
    title: "FY27 Q1 <update>",
    orgName: "Ambition Angels",
    generatedOn: "2026-09-09",
    narrative: null as string | null,
    waivers: [] as { metricKey: string | null; reason: string | null; waivedAt: string }[],
  };
  const metric = {
    key: "attendance_rate",
    name: "Attendance rate",
    value: 87,
    capturedOn: "2026-09-01",
    unit: "%",
    flag: null as string | null,
  };

  test("every value prints with its captured-on date; a never-captured value says so", () => {
    const html = renderReportHtml({ ...base, metrics: [metric, { ...metric, key: "x", name: "X", value: null, capturedOn: null }] });
    expect(html).toContain("as of 2026-09-01");
    expect(html).toContain("87%");
    expect(html).toContain("never captured");
  });

  test("waivers are printed INTO the shipped file — they travel with the artifact", () => {
    const html = renderReportHtml({
      ...base,
      metrics: [{ ...metric, flag: "conflict" }],
      waivers: [{ metricKey: "attendance_rate", reason: "Board approved interim figure", waivedAt: "2026-09-09T01:00:00Z" }],
    });
    expect(html).toContain("Shipped with waivers (Contract 7)");
    expect(html).toContain("Board approved interim figure");
    expect(html).toContain("waived 2026-09-09, reports.approve");
    expect(html).toContain("<strong>conflict</strong>");
  });

  test("all free text is HTML-escaped — titles, names, narrative, reasons", () => {
    const html = renderReportHtml({
      ...base,
      metrics: [{ ...metric, name: 'Rate <img src=x onerror="1">' }],
      narrative: "Growth & focus <script>alert(1)</script>",
      waivers: [{ metricKey: null, reason: '"><script>', waivedAt: "2026-09-09T00:00:00Z" }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("FY27 Q1 &lt;update&gt;");
  });

  test("the artifact type is the vocabulary everything shares", () => {
    expect(ARTIFACT_TYPE).toBe("fin_report");
  });
});

const root = join(__dirname, "..");
const src = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("N3 structural pins", () => {
  test("the V1 board-report route is a thin stub over the extracted BoardReport", () => {
    const s = src("app", "admin", "finance", "report", "page.tsx");
    expect(s).toMatch(/import BoardReport from "\.\/BoardReport"/);
    expect(s).toMatch(/<BoardReport \/>/);
  });

  test("drafting is never blocked: the draft renders <Metric> rows with no gate short-circuit", () => {
    const s = src("app", "admin", "finance", "reports", "page.tsx");
    expect(s).toMatch(/checkExportGate\(ARTIFACT_TYPE, rid, keys\)/);
    expect(s).toMatch(/<Metric metricKey=\{key\} showName \/>/);
    // The gate result feeds the banner; it must never gate the render.
    expect(s).not.toMatch(/gate\.blocked[\s\S]{0,40}(notFound|return null|redirect)/);
  });

  test("the export route gates before writing, ships waivers into the file, and reuses rid as the document id", () => {
    const s = src("app", "api", "admin", "finance", "reports", "export", "route.ts");
    expect(s.indexOf("checkExportGate")).toBeLessThan(s.indexOf(".upload("));
    expect(s).toMatch(/status: 409/);
    expect(s).toMatch(/id: rid,/);
    expect(s).toMatch(/waivers: gate\.waivers/);
    expect(s).toMatch(/upsert: false/);
    // Never writes a waiver, never re-implements the permission.
    expect(s).not.toMatch(/from\("export_waivers"\)[\s\S]{0,80}insert/);
    expect(s).not.toMatch(/has_permission/);
  });

  test("the migration registers the vocabulary additively", () => {
    const s = src("supabase", "migrations", "spec_fin_report_artifacts.sql");
    expect(s).toMatch(/'report_narrative'/);
    expect(s).toMatch(/'grant_narrative', 'board_update', 'acknowledgment', 'strategy_review', 'report_narrative'/);
    expect(s).toMatch(/values \('fin_report',/);
    expect(s).toMatch(/on conflict \(entity_type\) do nothing/);
  });

  test("the narrative slot reads only APPROVED report_narrative drafts", () => {
    const page = src("app", "admin", "finance", "reports", "page.tsx");
    const route = src("app", "api", "admin", "finance", "reports", "export", "route.ts");
    for (const s of [page, route]) {
      expect(s).toMatch(/eq\("kind", "report_narrative"\)/);
      expect(s).toMatch(/eq\("status", "approved"\)/);
    }
  });
});
