import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Failure paths behind two production bugs found by the v4 phase-0 harness:
// a task tick whose save failed was silent (the PATCH response was never
// checked), and a failed read on Donor 360 rendered the 404 page.

// ── Task saves (Work / Tasks list) ─────────────────────────────────────────
import { patchTask } from "@/app/admin/ops/_components/taskSave";

const res = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("patchTask", () => {
  test("returns null when the save lands", async () => {
    const f = vi.fn(async () => res(200, { ok: true }));
    expect(await patchTask("t1", { status: "done" }, f as unknown as typeof fetch)).toBeNull();
    expect(f).toHaveBeenCalledWith("/api/admin/ops/tasks/t1", expect.objectContaining({ method: "PATCH" }));
  });

  test("a 500 yields the standard sentence, never a status code", async () => {
    const f = vi.fn(async () => res(500, { error: "HTTP 500" }));
    const msg = await patchTask("t1", { status: "done" }, f as unknown as typeof fetch);
    expect(msg).toMatch(/not saved/i);
    expect(msg).not.toMatch(/500/);
  });

  test("a thrown fetch yields the network sentence instead of throwing", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await patchTask("t1", { display_order: 2 }, f as unknown as typeof fetch)).toMatch(/connection/i);
  });

  test("the list view checks every save and rolls back on failure", () => {
    // TaskListView is the worked example of lib/admin/saveAction.ts (V4
    // Stage A1): every write goes through saveAction, which checks res.ok
    // and the error shape, rolls back, and toasts with userMessage().
    const view = readFileSync(join(__dirname, "..", "app/admin/ops/_components/TaskListView.tsx"), "utf8");
    // No raw, unchecked PATCH left in the view.
    expect(view).not.toMatch(/method:\s*"PATCH"/);
    const status = view.slice(view.indexOf("async function patchStatus"), view.indexOf("const onCompleteTask"));
    expect(status).toMatch(/await saveAction\(/);
    expect(status).toMatch(/rollback: \(\) => cancel\(t\.id\)/);
    expect(status).toMatch(/toast,/);
    const reorder = view.slice(view.indexOf("async function persist"), view.indexOf("function onDrop"));
    expect(reorder).toMatch(/await saveAction\(/);
    expect(reorder).toMatch(/rollback: \(\) => setLocal\(previous\)/);
    expect(reorder).toMatch(/toast,/);
  });
});

// ── Donor 360 read failure vs. a real miss ─────────────────────────────────
import { resolveDonor360 } from "@/app/admin/fundraising/donors-funders/[id]/resolve";

type R = { data: unknown; error: { message: string } | null };
const client = (reads: Record<string, R>) => async (table: string) => reads[table];
const ok = (data: unknown): R => ({ data, error: null });
const fail: R = { data: null, error: { message: "boom" } };
const ID = "00000000-0000-4000-8000-000000000001";

describe("resolveDonor360", () => {
  test("a failed constituent read throws (error boundary), not a miss", async () => {
    await expect(resolveDonor360(client({ constituents: fail, fr_prospects: ok(null) }))).rejects.toThrow(
      /constituent read failed/,
    );
  });

  test("a failed prospect read throws (error boundary), not a miss", async () => {
    await expect(resolveDonor360(client({ constituents: ok(null), fr_prospects: fail }))).rejects.toThrow(
      /prospect read failed/,
    );
  });

  test("resolves each id space, and a clean miss on both is missing", async () => {
    expect(await resolveDonor360(client({ constituents: ok({ id: ID }), fr_prospects: fail }))).toBe("constituent");
    expect(await resolveDonor360(client({ constituents: ok(null), fr_prospects: ok({ id: ID }) }))).toBe("prospect");
    expect(await resolveDonor360(client({ constituents: ok(null), fr_prospects: ok(null) }))).toBe("missing");
  });

  test("the page routes through the resolver (no read-error-as-404 path)", () => {
    const page = readFileSync(join(__dirname, "..", "app/admin/fundraising/donors-funders/[id]/page.tsx"), "utf8");
    expect(page).toMatch(/resolveDonor360\(/);
    expect(page).not.toMatch(/const \{ data: [cp] \}/);
  });
});
