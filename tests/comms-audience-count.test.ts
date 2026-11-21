import { beforeEach, describe, expect, test, vi } from "vitest";
import { fakeDb, type Row } from "./support/commsFakeDb";

/**
 * V4 Stage D, the segment builder's live count. The count comes from the
 * send path's own resolver, so these pin what a person sees before Send:
 * fail closed on anything unknown, "My donors" refused, archived never
 * members, do-not-contact / unsubscribed / no-email counted out by reason,
 * and every read pinned to the caller's org.
 */

const ORG = "00000000-0000-0000-0000-00000000000a";
const OTHER = "00000000-0000-0000-0000-00000000000b";

const person = (id: string, over: Partial<Row> = {}): Row => ({
  id, org_id: ORG, type: "person", first_name: id, last_name: "Example", org_name: null,
  emails: [`${id}@example.org`], do_not_contact: false, archived_at: null,
  gift_count: 2, last_gift: "2026-03-01", lifetime_total: 500, recurring_active: false, tags: [], ...over,
});

let db = fakeDb({});
let allowed = true;
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/admin/requirePermission", () => ({
  requirePermission: vi.fn(async () =>
    allowed ? { ok: true, ctx: { orgId: ORG, userId: "u1", role: "staff" } } : { ok: false, status: 403, error: "You don't have permission to do that." },
  ),
}));

beforeEach(() => {
  allowed = true;
  db = fakeDb({
    v_fr_rollups: [
      person("ana"),
      person("ben", { do_not_contact: true }),
      person("cy", { emails: [] }),
      person("dee", { emails: ["dee@example.org"] }),
      person("eli", { archived_at: "2026-10-01T00:00:00Z" }),
      person("fay", { gift_count: 1, last_gift: "2025-05-01" }),
      person("gus", { org_id: OTHER }),
    ],
    email_suppressions: [{ org_id: ORG, email: "dee@example.org" }],
    segments: [
      { id: "11111111-1111-1111-1111-111111111111", org_id: ORG, name: "Lapsed", definition: { view: "lapsed" } },
      { id: "22222222-2222-2222-2222-222222222222", org_id: OTHER, name: "Theirs", definition: {} },
    ],
    fr_prospects: [],
    constituents: [],
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const post = async (body: unknown): Promise<{ status: number; j: any }> => {
  const { POST } = await import("@/app/api/admin/comms/audience/count/route");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as any);
  return { status: res.status, j: await res.json() };
};

describe("live audience count", () => {
  test("everyone: archived and the other org never count; DNC, no email and unsubscribed are counted out by reason", async () => {
    const { j } = await post({ definition: {} });
    expect(j.error).toBeNull();
    expect(j.recipients).toBe(2); // ana, fay
    expect(j.excluded).toEqual({ doNotContact: 1, suppressed: 1, noEmail: 1 });
    expect(j.sample).not.toContain(expect.stringContaining("eli"));
  });

  test("a giving-history filter narrows the count the send would use", async () => {
    const { j } = await post({ definition: { min_total: "1000" } });
    expect(j.recipients).toBe(0);
  });

  test("a saved segment resolves by id, only in this org", async () => {
    const mine = await post({ segment_id: "11111111-1111-1111-1111-111111111111" });
    expect(mine.status).toBe(200);
    expect(mine.j.recipients).toBe(1); // fay is lapsed
    const theirs = await post({ segment_id: "22222222-2222-2222-2222-222222222222" });
    expect(theirs.status).toBe(404);
  });

  test("fail closed: an unknown filter or view emails nobody, with the reason", async () => {
    const a = await post({ definition: { zodiac: "leo" } });
    expect(a.j.recipients).toBe(0);
    expect(a.j.error).toMatch(/can't apply/);
    const b = await post({ definition: { view: "vips" } });
    expect(b.j.recipients).toBe(0);
    expect(b.j.error).toMatch(/doesn't know/);
  });

  test("My donors is refused: an email must not depend on who presses Send", async () => {
    const { j } = await post({ definition: { view: "mine" } });
    expect(j.recipients).toBe(0);
    expect(j.error).toMatch(/My donors/);
  });

  test("a read failure counts nobody rather than everybody", async () => {
    db = fakeDb({ v_fr_rollups: [person("ana")] }, { failRead: ["email_suppressions"] });
    const { j } = await post({ definition: {} });
    expect(j.recipients).toBe(0);
    expect(j.error).toMatch(/unsubscribe list/);
  });

  test("a role without fundraising.read gets no count at all", async () => {
    allowed = false;
    const { status } = await post({ definition: {} });
    expect(status).toBe(403);
  });
});
