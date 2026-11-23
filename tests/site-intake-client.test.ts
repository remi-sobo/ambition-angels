import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Repo split phase 2a: the website's BloomOS intake client
// (lib/site/bloomos.ts). The promise under test: a form is never lost, and
// a retry never double-inserts.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/site/supabase", () => ({ getSiteSupabase: vi.fn(), isSiteDbConfigured: () => false }));

import { fetchOpenCohorts, intakeMode, sendToBloomOS } from "@/lib/site/bloomos";

const SUB = "11111111-2222-4333-8444-555555555555";

function deps(respond: () => Promise<Response> | Response, opts: { outboxFails?: boolean } = {}) {
  const delivered: unknown[] = [];
  const queued: { submission_id: string; kind: string; payload: Record<string, unknown>; last_error: string }[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    delivered,
    queued,
    calls,
    d: {
      newId: () => SUB,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return respond();
      }) as unknown as typeof fetch,
      outbox: {
        delivered: async (r: unknown) => void delivered.push(r),
        queue: async (r: (typeof queued)[number]) => {
          if (opts.outboxFails) throw new Error("site db down");
          queued.push(r);
        },
      },
    },
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("BLOOMOS_INTAKE_URL", "https://app.test/api/intake/v1/");
  vi.stubEnv("BLOOMOS_INTAKE_KEY", "bos_live_" + "k".repeat(40));
});
afterEach(() => vi.unstubAllEnvs());

describe("intakeMode", () => {
  test("defaults to db; only the exact value api switches", () => {
    vi.stubEnv("INTAKE_MODE", "");
    expect(intakeMode()).toBe("db");
    vi.stubEnv("INTAKE_MODE", "API");
    expect(intakeMode()).toBe("db");
    vi.stubEnv("INTAKE_MODE", "api");
    expect(intakeMode()).toBe("api");
  });
});

describe("sendToBloomOS", () => {
  test("delivered: posts to {base}/{kind} with the key and a submission_id, logs it without the payload", async () => {
    const t = deps(() => json(200, { ok: true, id: "row-1" }));
    const r = await sendToBloomOS("application", { first_name: "Ada" }, t.d);
    expect(r).toEqual({ outcome: "delivered", body: { ok: true, id: "row-1" } });
    expect(t.calls[0].url).toBe("https://app.test/api/intake/v1/application");
    expect((t.calls[0].init.headers as Record<string, string>).authorization).toMatch(/^Bearer bos_live_/);
    expect(JSON.parse(String(t.calls[0].init.body))).toEqual({ first_name: "Ada", submission_id: SUB });
    expect(t.delivered).toEqual([{ submission_id: SUB, kind: "application", bloomos_id: "row-1" }]);
    expect(t.queued).toHaveLength(0);
  });

  test("rejected: a 400 goes back to the visitor and is not queued", async () => {
    const t = deps(() => json(400, { error: "Missing grade." }));
    const r = await sendToBloomOS("application", {}, t.d);
    expect(r).toEqual({ outcome: "rejected", status: 400, error: "Missing grade." });
    expect(t.queued).toHaveLength(0);
  });

  test.each([
    ["a 500", () => json(500, { error: "boom" })],
    ["a 409 (still processing)", () => json(409, { error: "processing" })],
    ["a revoked key (401)", () => json(401, { error: "Invalid or missing API key." })],
    ["a missing entitlement (403)", () => json(403, { error: "nope" })],
    ["a network failure", () => Promise.reject(new Error("ECONNRESET"))],
  ])("queued on %s, with the same submission_id for the retry", async (_label, respond) => {
    const t = deps(respond as () => Promise<Response>);
    const r = await sendToBloomOS("ygb_registration", { parent_email: "p@x.org" }, t.d);
    expect(r).toEqual({ outcome: "queued" });
    expect(t.queued).toHaveLength(1);
    expect(t.queued[0]).toMatchObject({
      submission_id: SUB,
      kind: "ygb_registration",
      payload: { parent_email: "p@x.org", submission_id: SUB },
    });
  });

  test("not configured: queued rather than lost", async () => {
    vi.stubEnv("BLOOMOS_INTAKE_KEY", "");
    const t = deps(() => json(200, {}));
    const r = await sendToBloomOS("donation", { amount: 5 }, t.d);
    expect(r).toEqual({ outcome: "queued" });
    expect(t.calls).toHaveLength(0);
  });

  test("failed only when BloomOS and the outbox both fail", async () => {
    const t = deps(() => json(503, {}), { outboxFails: true });
    expect(await sendToBloomOS("application", {}, t.d)).toEqual({ outcome: "failed" });
  });
});

describe("fetchOpenCohorts", () => {
  test("returns the cohorts list, or null when BloomOS can't answer", async () => {
    const ok = (async () => json(200, { cohorts: [{ id: "c1", name: "Spring" }] })) as unknown as typeof fetch;
    expect(await fetchOpenCohorts(ok)).toEqual([{ id: "c1", name: "Spring" }]);
    const down = (async () => json(500, {})) as unknown as typeof fetch;
    expect(await fetchOpenCohorts(down)).toBeNull();
    const boom = (async () => {
      throw new Error("x");
    }) as unknown as typeof fetch;
    expect(await fetchOpenCohorts(boom)).toBeNull();
  });
});
