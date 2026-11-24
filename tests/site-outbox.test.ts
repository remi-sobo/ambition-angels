import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSupabase } from "./support/supabaseMock";

// Repo split phase 2e: the website's intake outbox retry. A queued form is
// re-sent with its original submission_id (so BloomOS never stores it twice),
// cleared on delivery, dropped as "rejected" only on a 400, and otherwise
// left waiting. Remi hears about anything stuck over 24h once a day.

vi.mock("server-only", () => ({}));
let db = mockSupabase([]);
vi.mock("@/lib/site/supabase", () => ({ getSiteSupabase: () => db.client, isSiteDbConfigured: () => true }));
const sent: { subject: string; text: string }[] = [];
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (m: { subject: string; text: string }) => void sent.push(m) };
  },
}));

import { retryPending } from "@/lib/site/outbox";
import { alertIfStuck, isDailyAlertRun } from "@/lib/site/outboxAlert";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("BLOOMOS_INTAKE_URL", "https://app.test/api/intake/v1");
  vi.stubEnv("BLOOMOS_INTAKE_KEY", "bos_live_" + "k".repeat(40));
  vi.stubEnv("RESEND_API_KEY", "re_test");
  sent.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("retryPending", () => {
  const rows = [
    { id: "o1", submission_id: "s-1", kind: "application", payload: { first_name: "Ada" }, attempts: 1 },
    { id: "o2", submission_id: "s-2", kind: "ygb_registration", payload: { parent_email: "p@x.org" }, attempts: 3 },
    { id: "o3", submission_id: "s-3", kind: "donation", payload: { amount: 5 }, attempts: 1 },
  ];

  test("delivered, still waiting, and rejected, each recorded; the original submission_id is re-sent", async () => {
    db = mockSupabase([{ data: rows }, { data: null }, { data: null }, { data: null }]);
    const bodies: Record<string, unknown>[] = [];
    const responses = [json(200, { ok: true, id: "app-9" }), json(503, { error: "down" }), json(400, { error: "Missing required fields" })];
    const f = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return responses.shift()!;
    }) as unknown as typeof fetch;

    const r = await retryPending(50, f);
    expect(r).toEqual({ tried: 3, delivered: 1, stillPending: 1, dead: 1 });
    expect(bodies.map((b) => b.submission_id)).toEqual(["s-1", "s-2", "s-3"]);
    expect(db.calls.update[0]).toMatchObject({ status: "delivered", payload: null, bloomos_id: "app-9", attempts: 2 });
    expect(db.calls.update[1]).toMatchObject({ attempts: 4 });
    expect(db.calls.update[1]).not.toHaveProperty("status");
    expect(db.calls.update[2]).toMatchObject({ status: "dead", attempts: 2 });
  });

  test("an empty outbox does nothing", async () => {
    db = mockSupabase([{ data: [] }]);
    expect(await retryPending(50, (async () => json(200, {})) as unknown as typeof fetch)).toEqual({
      tried: 0, delivered: 0, stillPending: 0, dead: 0,
    });
  });
});

describe("the stuck-form email", () => {
  test("only in the 8:00 to 8:14 Pacific run", () => {
    expect(isDailyAlertRun(new Date("2026-11-24T16:05:00Z"))).toBe(true); // 8:05 PST
    expect(isDailyAlertRun(new Date("2026-11-24T16:15:00Z"))).toBe(false);
    expect(isDailyAlertRun(new Date("2026-11-24T15:55:00Z"))).toBe(false);
    expect(isDailyAlertRun(new Date("2026-07-01T15:05:00Z"))).toBe(true); // 8:05 PDT
  });

  test("emails once at 8am when something waited over a day, with no personal data", async () => {
    db = mockSupabase([{ data: [{ kind: "coach_signup", created_at: "2026-11-22T10:00:00Z", attempts: 96, last_error: "503: down" }] }]);
    const r = await alertIfStuck(new Date("2026-11-24T16:05:00Z"));
    expect(r).toEqual({ stuck: 1, emailed: true });
    expect(sent[0].subject).toBe("1 website form not reaching BloomOS");
    expect(sent[0].text).toContain("coach_signup");
    expect(sent[0].text).toContain("ambitionangels.org/admin/forms");
  });

  test("no email outside the 8am run, and none when nothing is stuck", async () => {
    db = mockSupabase([{ data: [{ kind: "application", created_at: "2026-11-22T10:00:00Z", attempts: 5, last_error: null }] }]);
    expect(await alertIfStuck(new Date("2026-11-24T20:00:00Z"))).toEqual({ stuck: 1, emailed: false });
    db = mockSupabase([{ data: [] }]);
    expect(await alertIfStuck(new Date("2026-11-24T16:05:00Z"))).toEqual({ stuck: 0, emailed: false });
    expect(sent).toHaveLength(0);
  });
});

describe("the cron route", () => {
  test("refuses without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const { GET } = await import("@/app/api/site/cron/intake-outbox/route");
    const res = await GET(new NextRequest("https://www.ambitionangels.org/api/site/cron/intake-outbox"));
    expect(res.status).toBe(401);
    const wrong = await GET(
      new NextRequest("https://www.ambitionangels.org/api/site/cron/intake-outbox", { headers: { authorization: "Bearer nope" } }),
    );
    expect(wrong.status).toBe(401);
  });
});
