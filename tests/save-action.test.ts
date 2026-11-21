import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { saveAction } from "@/lib/admin/saveAction";

// V4 Stage A1: the one client mutation helper (spec §12). It must check the
// response, roll back on any failure, toast with userMessage(), and never
// throw to the caller.

const res = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const toastSpy = () => ({ success: vi.fn(), error: vi.fn() });

describe("saveAction", () => {
  test("success: returns data, toasts success, never rolls back", async () => {
    const toast = toastSpy();
    const rollback = vi.fn();
    const optimistic = vi.fn();
    const fetchImpl = vi.fn(async () => res(200, { ok: true, id: "t1" }));
    const r = await saveAction<{ ok: boolean; id: string }>({
      request: { url: "/api/admin/ops/tasks/t1", method: "PATCH", body: { status: "done" } },
      optimistic,
      rollback,
      success: "Saved",
      toast,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toEqual({ ok: true, data: { ok: true, id: "t1" }, status: 200 });
    expect(optimistic).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Saved");
    expect(toast.error).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/admin/ops/tasks/t1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "done" }) }),
    );
  });

  test("a 204 with no body is a success", async () => {
    const r = await saveAction({ request: async () => res(204), toast: toastSpy() });
    expect(r.ok).toBe(true);
  });

  test("HTTP error: rolls back and toasts the userMessage sentence, never the code", async () => {
    const toast = toastSpy();
    const rollback = vi.fn();
    const r = await saveAction({
      request: async () => res(500, { error: "HTTP 500" }),
      optimistic: vi.fn(),
      rollback,
      toast,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("http");
    expect(r.status).toBe(500);
    expect(r.message).toMatch(/not saved/i);
    expect(r.message).not.toMatch(/500/);
    expect(rollback).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith(r.message);
  });

  test("a human server message is shown as is", async () => {
    const toast = toastSpy();
    const r = await saveAction({ request: async () => res(422, { error: "Amount must be above zero." }), toast });
    expect(!r.ok && r.message).toBe("Amount must be above zero.");
    expect(toast.error).toHaveBeenCalledWith("Amount must be above zero.");
  });

  test("a 200 carrying the app's error shape is a failure", async () => {
    const rollback = vi.fn();
    const r = await saveAction({ request: async () => res(200, { ok: false, error: "That task was removed." }), rollback });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe("app");
    expect(rollback).toHaveBeenCalledOnce();
  });

  test("network error: rolls back, toasts the network sentence, does not throw", async () => {
    const toast = toastSpy();
    const rollback = vi.fn();
    const r = await saveAction({
      request: async () => {
        throw new TypeError("Failed to fetch");
      },
      rollback,
      toast,
    });
    expect(r).toMatchObject({ ok: false, kind: "network", status: null });
    expect(!r.ok && r.message).toMatch(/connection/i);
    expect(rollback).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledOnce();
  });

  test("failure: false skips the toast but still rolls back; a string replaces it", async () => {
    const toast = toastSpy();
    const rollback = vi.fn();
    await saveAction({ request: async () => res(500), rollback, toast, failure: false });
    expect(rollback).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
    await saveAction({ request: async () => res(500), toast, failure: "Could not move the task." });
    expect(toast.error).toHaveBeenCalledWith("Could not move the task.");
  });

  test("a throwing callback never escapes", async () => {
    const r = await saveAction({
      request: async () => res(500),
      rollback: () => {
        throw new Error("boom");
      },
    });
    expect(r.ok).toBe(false);
  });

  test("the module documents the money rule", () => {
    const src = readFileSync(join(__dirname, "..", "lib/admin/saveAction.ts"), "utf8");
    expect(src).toMatch(/MONEY RULE: never pass `optimistic`/);
  });
});
