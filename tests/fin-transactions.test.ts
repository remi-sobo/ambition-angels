import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { CLOSE_ARTIFACT_TYPE, closeBlocked, periodKey } from "@/lib/finance/closeGate";

// Spec Finance, stage N1 — Transactions absorbs Reconcile + the gated Close.
// Pure gate semantics plus the house structural pins (fr-pipeline pattern).

describe("the close gate (Contract 7 on the period close)", () => {
  test("blocked iff proposals are pending and this period has no waiver", () => {
    expect(closeBlocked(3, false)).toBe(true);
    expect(closeBlocked(1, true)).toBe(false); // waived — ships, on the record
    expect(closeBlocked(0, false)).toBe(false); // clean close needs no waiver
    expect(closeBlocked(0, true)).toBe(false);
  });

  test("the artifact is the calendar month — a prior month's waiver can never match", () => {
    expect(periodKey("2026-09-09T01:00:00Z")).toBe("2026-09");
    expect(periodKey("2026-10-01")).toBe("2026-10");
    expect(CLOSE_ARTIFACT_TYPE).toBe("period_close"); // the Spec A schema's own vocabulary
  });
});

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("N1 structural pins", () => {
  test("the V1 reconcile and close routes are thin stubs over the extracted sections", () => {
    const rec = src("admin", "finance", "reconcile", "page.tsx");
    expect(rec).toMatch(/import ReconcileSection from "\.\/ReconcileSection"/);
    expect(rec).toMatch(/<ReconcileSection \/>/);
    expect(rec).not.toMatch(/embedded/i);
    const close = src("admin", "finance", "close", "page.tsx");
    expect(close).toMatch(/import CloseSection from "\.\/CloseSection"/);
    expect(close).toMatch(/<CloseSection \/>/);
    expect(close).not.toMatch(/embedded/i);
  });

  test("Transactions embeds ledger → reconcile → close, in that order", () => {
    const s = src("admin", "finance", "transactions", "page.tsx");
    expect(s).toMatch(/<ReconcileSection embedded \/>/);
    expect(s).toMatch(/<CloseSection embedded \/>/);
    expect(s.indexOf("fin_transactions")).toBeLessThan(s.indexOf("<ReconcileSection embedded"));
    expect(s.indexOf("<ReconcileSection embedded")).toBeLessThan(s.indexOf("<CloseSection embedded"));
  });

  test("the close route gates the exit and only the exit", () => {
    const s = readFileSync(
      join(app, "api", "admin", "finance", "close", "route.ts"),
      "utf8",
    );
    // The gate reads pending proposals + this period's waiver, org-fenced.
    expect(s).toMatch(/fin_reconciliation_items/);
    expect(s).toMatch(/export_waivers/);
    expect(s).toMatch(/eq\("artifact_id", period\)/);
    expect(s).toMatch(/status: 409/);
    // The permission authority stays the waiver route's RLS — this route
    // never writes a waiver and never re-implements reports.approve.
    expect(s).not.toMatch(/insert/i);
    expect(s).not.toMatch(/has_permission/);
  });

  test("the wizard waives through the Contract 7 API, never around it", () => {
    const s = src("admin", "finance", "close", "_components", "CloseWizard.tsx");
    expect(s).toMatch(/\/api\/admin\/export-waivers/);
    expect(s).toMatch(/artifact_type: blocked\.artifactType/);
    expect(s).not.toMatch(/from\("export_waivers"\)/); // no direct table write
  });
});
