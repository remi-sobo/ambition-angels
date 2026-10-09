import { beforeEach, describe, expect, test, vi } from "vitest";
import { mockSupabase } from "./support/supabaseMock";
import { CAPTURE_RATE_LIMIT_PER_HOUR } from "@/lib/capture/constants";

// Capture C2 step 7: POST /api/admin/capture. Every collaborator is mocked;
// what is pinned is the order of gates, the rows the route writes (captures,
// capture_cards, nothing else), the ledger linkage, and the failure path.

const CAP_ID = "11111111-1111-1111-1111-111111111111";
const CTX = { userId: "u-remi", email: "remi@example.org", orgId: "org-1", orgName: "Org", role: "owner" as const };

let entitled: { ok: true; ctx: typeof CTX } | { ok: false; status: 401 | 402; error: string } = { ok: true, ctx: CTX };
let db = mockSupabase([]);
let capOver = false;
let modelInput: unknown = { cards: [], youth_skipped: 0 };
let modelThrows: Error | null = null;
let candidates: unknown[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/entitlements", () => ({ requireEntitlement: vi.fn(async () => entitled) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/admin/auth", () => ({ getAdminUser: vi.fn(async () => "remi") }));
vi.mock("@/lib/ai/cap", () => ({ orgOverAICap: vi.fn(async () => ({ over: capOver, spentUsd: 0, capUsd: 100 })) }));
vi.mock("@/lib/ai/ledger", () => ({ logAICall: vi.fn(async () => "call-1") }));
vi.mock("@/lib/ai/gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/gateway")>();
  return {
    ...actual,
    generateStructured: vi.fn(async () => {
      if (modelThrows) throw modelThrows;
      return { input: modelInput, model: "claude-sonnet-4-6", usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheCreationTokens: 0 }, costUsd: 0.006 };
    }),
  };
});
vi.mock("@/lib/capture/staff", () => ({
  loadStaff: vi.fn(async () => [{ ref: "s1", name: "Shannon Example", handle: "shannon", userId: "u-shannon" }]),
}));
vi.mock("@/lib/capture/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/capture/context")>();
  return { ...actual, resolveContext: vi.fn(async () => null) };
});
vi.mock("@/lib/capture/match", () => ({ findCandidates: vi.fn(async () => ({ candidates, spanMap: {} })) }));

import { POST } from "@/app/api/admin/capture/route";
import { GET } from "@/app/api/admin/capture/[id]/route";
import { logAICall } from "@/lib/ai/ledger";
import { AIKeyMissingError } from "@/lib/ai/gateway";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/admin/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );

const maria = { ref: "c1", kind: "constituent", id: "m1", name: "Maria Chen", orgName: null, meta: "person", sim: 1, spans: ["Maria Chen"], context: false };

beforeEach(() => {
  entitled = { ok: true, ctx: CTX };
  capOver = false;
  modelThrows = null;
  candidates = [maria];
  modelInput = {
    cards: [
      { dest: "interaction", source_sentence: "Had coffee with Maria Chen.", ref: "c1", heard_name: null, confidence: 0.95, kind: "meeting", notes: "Coffee. Wants the impact numbers." },
      { dest: "task", source_sentence: "Have Shannon send the one-pager by Friday.", ref: "c1", heard_name: null, confidence: 0.95, title: "Send Maria Chen the impact one-pager", category: "fundraising", assignee_ref: "s1", due_date: "2026-10-16" },
    ],
    youth_skipped: 1,
  };
  vi.mocked(logAICall).mockClear();
});

describe("POST /api/admin/capture", () => {
  test("402 when the org lacks ai.capture, before any database work", async () => {
    entitled = { ok: false, status: 402, error: "This feature requires an upgrade (ai.capture)." };
    db = mockSupabase([]);
    const res = await post({ transcript: "hello" });
    expect(res.status).toBe(402);
    expect(db.calls.from).toEqual([]);
  });

  test("429 when the caller has hit the hourly rate limit", async () => {
    db = mockSupabase([{ count: CAPTURE_RATE_LIMIT_PER_HOUR }]);
    const res = await post({ transcript: "hello" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ rate_limited: true });
    expect(db.calls.from).toEqual(["captures"]);
    expect(db.calls.eq).toContainEqual(["created_by", "u-remi"]);
  });

  test("429 with capped:true when the org is over its AI cap", async () => {
    capOver = true;
    db = mockSupabase([{ count: 0 }]);
    const res = await post({ transcript: "hello" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ capped: true });
  });

  test("400 for an empty transcript, before a captures row exists", async () => {
    db = mockSupabase([{ count: 0 }]);
    const res = await post({ transcript: "   " });
    expect(res.status).toBe(400);
    expect(db.calls.insert).toEqual([]);
  });

  test("happy path: captures row, cards, ledger link, ready", async () => {
    db = mockSupabase([
      { count: 0 }, // rate limit
      { data: { id: CAP_ID }, error: null }, // insert captures
      { error: null }, // insert cards
      { error: null }, // update captures -> ready
    ]);
    const res = await post({ transcript: "Just had coffee with Maria Chen.", source_surface: "mobile_plus", duration_seconds: 31.4 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ capture_id: CAP_ID, status: "ready", youth_skipped: 1 });
    expect(json.cards).toHaveLength(2);
    expect(json.cards[0]).toMatchObject({ dest: "interaction", status: "proposed", entity_type: "constituent", entity_id: "m1" });
    expect(json.cards[1].payload).toMatchObject({ title: "Send Maria Chen the impact one-pager", due_date: "2026-10-16", assignee: { handle: "shannon", user_id: "u-shannon" } });

    // The captures row: org from session context, never a default; status parsing.
    expect(db.calls.insert[0]).toMatchObject({
      org_id: "org-1",
      created_by: "u-remi",
      source_surface: "mobile_plus",
      transcript: "Just had coffee with Maria Chen.",
      duration_seconds: 31,
      status: "parsing",
      context_type: null,
      context_id: null,
    });
    // The cards: one row per validated card, in position order, same org.
    const cards = db.calls.insert[1] as Record<string, unknown>[];
    expect(cards.map((c) => c.position)).toEqual([1, 2]);
    expect(cards.every((c) => c.org_id === "org-1" && c.capture_id === CAP_ID && c.created_by === "u-remi")).toBe(true);
    // Only the two staging tables are ever written.
    expect(new Set(db.calls.from)).toEqual(new Set(["captures", "capture_cards"]));
    // Ledger: surface capture, metadata carries the capture, linked back on the row.
    expect(vi.mocked(logAICall)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logAICall).mock.calls[0][1]).toMatchObject({
      orgId: "org-1",
      surface: "capture",
      model: "claude-sonnet-4-6",
      triggeredBy: "remi",
      metadata: { capture_id: CAP_ID, card_count: 2, youth_skipped: 1 },
    });
    expect(db.calls.update.at(-1)).toMatchObject({ status: "ready", model_used: "claude-sonnet-4-6", ai_call_id: "call-1" });
  });

  test("an unknown surface falls back to paste and bad context is ignored", async () => {
    db = mockSupabase([{ count: 0 }, { data: { id: CAP_ID }, error: null }, { error: null }, { error: null }]);
    await post({ transcript: "Hello there", source_surface: "carrier_pigeon", context_type: "student", context_id: "not-a-uuid" });
    expect(db.calls.insert[0]).toMatchObject({ source_surface: "paste", context_type: null, context_id: null });
  });

  test("model failure marks the capture failed and returns 502 with the id", async () => {
    modelThrows = new Error("upstream exploded");
    db = mockSupabase([{ count: 0 }, { data: { id: CAP_ID }, error: null }, { error: null }]);
    const res = await post({ transcript: "Hello there" });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ capture_id: CAP_ID });
    expect(db.calls.update[0]).toMatchObject({ status: "failed", parse_error: "Capture parsing failed" });
    expect(db.calls.from.filter((t) => t === "capture_cards")).toEqual([]);
    expect(vi.mocked(logAICall)).not.toHaveBeenCalled();
  });

  test("a missing API key is a 503 and still leaves the transcript saved as failed", async () => {
    modelThrows = new AIKeyMissingError();
    db = mockSupabase([{ count: 0 }, { data: { id: CAP_ID }, error: null }, { error: null }]);
    const res = await post({ transcript: "Hello there" });
    expect(res.status).toBe(503);
    expect(db.calls.update[0]).toMatchObject({ status: "failed" });
  });

  test("re-parse of an existing capture resets it and replaces undecided cards", async () => {
    db = mockSupabase([
      { count: 0 }, // rate limit
      { data: { id: CAP_ID, status: "failed" } }, // existing capture
      { error: null }, // reset update
      { error: null }, // delete undecided cards
      { error: null }, // insert cards
      { error: null }, // update ready
    ]);
    const res = await post({ transcript: "Just had coffee with Maria Chen.", capture_id: CAP_ID });
    expect(res.status).toBe(200);
    expect(db.calls.update[0]).toMatchObject({ status: "parsing", parse_error: null, transcript: "Just had coffee with Maria Chen." });
    expect(db.calls.delete).toHaveLength(1);
    expect(db.calls.insert).toHaveLength(1); // cards only; no new captures row
  });

  test("re-parse of a capture the caller cannot see is a 404", async () => {
    db = mockSupabase([{ count: 0 }, { data: null }]);
    const res = await post({ transcript: "Hello there", capture_id: CAP_ID });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/capture/[id]", () => {
  test("returns the capture and its cards through RLS", async () => {
    db = mockSupabase([{ data: { id: CAP_ID, status: "ready" } }, { data: [{ id: "card-1", position: 1 }] }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(new Request("http://localhost/api/admin/capture/x") as any, { params: { id: CAP_ID } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ capture: { id: CAP_ID, status: "ready" }, cards: [{ id: "card-1", position: 1 }] });
    expect(db.calls.from).toEqual(["captures", "capture_cards"]);
  });

  test("404 when RLS hides the capture, and for a non-uuid id", async () => {
    db = mockSupabase([{ data: null }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hidden = await GET(new Request("http://localhost/x") as any, { params: { id: CAP_ID } });
    expect(hidden.status).toBe(404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const junk = await GET(new Request("http://localhost/x") as any, { params: { id: "nope" } });
    expect(junk.status).toBe(404);
  });

  test("402 without the entitlement", async () => {
    entitled = { ok: false, status: 402, error: "upgrade" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(new Request("http://localhost/x") as any, { params: { id: CAP_ID } });
    expect(res.status).toBe(402);
  });
});
