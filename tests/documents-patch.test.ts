import { beforeEach, describe, expect, test, vi } from "vitest";

// Shannon's report: metadata had to be editable after upload without
// re-uploading the file. These pin the PATCH contract for the fields the
// edit modal sends — notably issued_at, which the upload form could set but
// nothing could later correct.

vi.mock("@/lib/admin/auth", () => ({ getOrgContext: vi.fn(async () => ({ orgId: "org-1" })) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));

// Capture whatever the route hands to .update() — that object is the contract.
let captured: Record<string, unknown> | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        captured = patch;
        return {
          eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: DOC_ID }, error: null }) }) }),
        };
      },
    }),
  }),
}));

import { PATCH } from "@/app/api/admin/documents/[id]/route";

const DOC_ID = "11111111-1111-1111-1111-111111111111";

const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/admin/documents/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    { params: { id: DOC_ID } },
  );

beforeEach(() => {
  captured = null;
});

describe("PATCH /api/admin/documents/[id] — editable metadata", () => {
  test("accepts an issue date and stores it", async () => {
    const res = await patch({ issued_at: "2026-07-24" });
    expect(res.status).toBe(200);
    expect(captured).toEqual({ issued_at: "2026-07-24" });
  });

  test("a past issue date is valid — documents are usually issued before upload", async () => {
    const res = await patch({ issued_at: "2019-01-31" });
    expect(res.status).toBe(200);
    expect(captured).toEqual({ issued_at: "2019-01-31" });
  });

  test("an empty issue date clears it", async () => {
    await patch({ issued_at: "" });
    expect(captured).toEqual({ issued_at: null });
  });

  test("a malformed issue date is rejected", async () => {
    const res = await patch({ issued_at: "07/24/2026" });
    expect(res.status).toBe(400);
    expect(captured).toBeNull();
  });

  test("saves the whole edit-modal payload in one call", async () => {
    const res = await patch({
      title: "  501c3 determination  ",
      doc_type: "policy",
      notes: "  Filed with the state — renew nothing, permanent.  ",
      issued_at: "2026-07-24",
      expires_at: null,
      visibility: "restricted",
    });
    expect(res.status).toBe(200);
    expect(captured).toEqual({
      title: "501c3 determination",
      doc_type: "policy",
      notes: "Filed with the state — renew nothing, permanent.",
      issued_at: "2026-07-24",
      expires_at: null,
      visibility: "restricted",
    });
  });

  test("whitespace-only notes clear the field rather than storing blanks", async () => {
    await patch({ notes: "   " });
    expect(captured).toEqual({ notes: null });
  });

  test("unknown doc types are rejected", async () => {
    const res = await patch({ doc_type: "not_a_type" });
    expect(res.status).toBe(400);
    expect(captured).toBeNull();
  });

  test("an empty body is a no-op error, not a wipe", async () => {
    const res = await patch({});
    expect(res.status).toBe(400);
    expect(captured).toBeNull();
  });
});
