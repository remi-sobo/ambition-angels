import { beforeEach, describe, expect, test, vi } from "vitest";
import { mockSupabase } from "./support/supabaseMock";

vi.mock("server-only", () => ({}));
// Coach links are built from the app origin; the real module pulls in more than this test needs.
vi.mock("@/lib/coach/server", () => ({ privateUrl: (t: string) => `https://app.test/coach/me/${t}` }));

import { generateApiKey, hashApiKey, parseBearer } from "@/lib/intake/keys";
import { runIntake, type ApiKeyRow, type IntakeDeps } from "@/lib/intake/pipeline";
import { INTAKE_HANDLERS } from "@/lib/intake/handlers";
import { application } from "@/lib/intake/application";
import { partnerInquiry } from "@/lib/intake/partner-inquiry";
import { donation } from "@/lib/intake/donation";
import type { IntakeOrg, IntakeResult, KindHandler } from "@/lib/intake/types";

// Intake API v1 (specs/bloomos-repo-split.md §6a). The pipeline takes its
// collaborators as arguments, so these tests drive every gate with an
// in-memory key table, entitlement table, and submission ledger.

const AA: IntakeOrg = { id: "org-aa", slug: "ambition-angels", name: "Ambition Angels", settings: {} };
const YL: IntakeOrg = { id: "org-yl", slug: "young-life-epa", name: "Young Life EPA", settings: {} };

const aaKey = generateApiKey();
const ylKey = generateApiKey();
const revokedKey = generateApiKey();
const narrowKey = generateApiKey();

const SUB = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const SUB2 = "7a1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";

type Ledger = Map<string, { status: "processing" | "done"; response: IntakeResult | null }>;

function makeDeps(opts: { handlers?: Record<string, KindHandler<unknown>> } = {}) {
  const keys = new Map<string, ApiKeyRow>([
    [aaKey.hash, { id: "k-aa", org_id: AA.id, scopes: ["intake:forms", "intake:donations"], revoked_at: null }],
    [ylKey.hash, { id: "k-yl", org_id: YL.id, scopes: ["intake:forms"], revoked_at: null }],
    [revokedKey.hash, { id: "k-rev", org_id: AA.id, scopes: ["intake:forms"], revoked_at: "2026-11-01T00:00:00Z" }],
    [narrowKey.hash, { id: "k-narrow", org_id: AA.id, scopes: [], revoked_at: null }],
  ]);
  const orgs = new Map([[AA.id, AA], [YL.id, YL]]);
  const ents = new Map<string, Set<string>>([
    [AA.id, new Set(["aa.coach", "aa.ygb", "aa.demoday", "aa.quiz", "modules.fundraising"])],
    [YL.id, new Set(["modules.fundraising"])],
  ]);
  const ledger: Ledger = new Map();
  const ran: { kind: string; orgId: string; data: unknown }[] = [];
  const released: string[] = [];

  const stub = (kind: string, extra: Partial<KindHandler<unknown>> = {}): KindHandler<unknown> => ({
    scope: INTAKE_HANDLERS[kind].scope,
    entitlement: INTAKE_HANDLERS[kind].entitlement,
    validate: (b) => ({ ok: true, data: b }),
    run: async (ctx, data) => {
      ran.push({ kind, orgId: ctx.org.id, data });
      return { id: `row-${ran.length}` };
    },
    ...extra,
  });
  const handlers =
    opts.handlers ?? Object.fromEntries(Object.keys(INTAKE_HANDLERS).map((k) => [k, stub(k)]));

  const deps: IntakeDeps = {
    handlers,
    findKeyByHash: async (h) => keys.get(h) ?? null,
    touchKey: async () => undefined,
    loadOrg: async (id) => orgs.get(id) ?? null,
    loadEntitlements: async (id) => ents.get(id) ?? new Set(),
    claim: async ({ orgId, submissionId }) => {
      const k = `${orgId}:${submissionId}`;
      const row = ledger.get(k);
      if (row) return { claimed: false, status: row.status, response: row.response };
      ledger.set(k, { status: "processing", response: null });
      return { claimed: true };
    },
    complete: async ({ orgId, submissionId, response }) => {
      ledger.set(`${orgId}:${submissionId}`, { status: "done", response });
    },
    release: async ({ orgId, submissionId }) => {
      released.push(submissionId);
      ledger.delete(`${orgId}:${submissionId}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctxFor: (org) => ({ org, db: {} as any }),
  };
  return { deps, ledger, ran, released, stub };
}

const bearer = (raw: string) => `Bearer ${raw}`;

describe("keys", () => {
  test("generated keys parse and hash deterministically", () => {
    const k = generateApiKey();
    expect(k.raw.startsWith("bos_live_")).toBe(true);
    expect(parseBearer(`Bearer ${k.raw}`)).toBe(k.raw);
    expect(hashApiKey(k.raw)).toBe(k.hash);
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.displayPrefix).toBe(k.raw.slice(0, 17));
  });
  test("anything not shaped like a key is refused before a lookup", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer("Bearer short")).toBeNull();
    expect(parseBearer("Bearer bos_live_" + "x".repeat(39))).toBeNull();
  });
});

describe("intake pipeline gates", () => {
  let t: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    t = makeDeps();
  });

  test("no key → 401", async () => {
    const r = await runIntake(t.deps, { kind: "application", authorization: null, body: { submission_id: SUB } });
    expect(r.status).toBe(401);
  });

  test("unknown key → 401", async () => {
    const r = await runIntake(t.deps, {
      kind: "application",
      authorization: bearer(generateApiKey().raw),
      body: { submission_id: SUB },
    });
    expect(r.status).toBe(401);
  });

  test("revoked key → 401", async () => {
    const r = await runIntake(t.deps, {
      kind: "application",
      authorization: bearer(revokedKey.raw),
      body: { submission_id: SUB },
    });
    expect(r.status).toBe(401);
    expect(t.ran).toHaveLength(0);
  });

  test("unknown kind → 404, including prototype keys", async () => {
    for (const kind of ["nope", "constructor", "__proto__", "toString"]) {
      const r = await runIntake(t.deps, { kind, authorization: bearer(aaKey.raw), body: { submission_id: SUB } });
      expect(r.status).toBe(404);
    }
  });

  test("key without the kind's scope → 403", async () => {
    const r = await runIntake(t.deps, {
      kind: "application",
      authorization: bearer(narrowKey.raw),
      body: { submission_id: SUB },
    });
    expect(r.status).toBe(403);
  });

  test("donations need their own scope: a forms-only key gets 403", async () => {
    const r = await runIntake(t.deps, {
      kind: "donation",
      authorization: bearer(ylKey.raw),
      body: { submission_id: SUB },
    });
    expect(r.status).toBe(403);
  });

  test("a Young Life EPA key gets 403 on every AA-only kind", async () => {
    for (const kind of ["ygb_registration", "coach_signup", "demoday_signup", "quiz_submission"]) {
      const r = await runIntake(t.deps, { kind, authorization: bearer(ylKey.raw), body: { submission_id: SUB } });
      expect(r.status, kind).toBe(403);
    }
    expect(t.ran).toHaveLength(0);
  });

  test("the same Young Life EPA key can send a generic kind", async () => {
    const r = await runIntake(t.deps, {
      kind: "application",
      authorization: bearer(ylKey.raw),
      body: { submission_id: SUB },
    });
    expect(r.status).toBe(200);
    expect(t.ran[0].orgId).toBe(YL.id);
  });

  test("submission_id must be a uuid", async () => {
    for (const body of [{}, { submission_id: "abc" }, null, [], "x"]) {
      const r = await runIntake(t.deps, { kind: "application", authorization: bearer(aaKey.raw), body });
      expect(r.status).toBe(400);
    }
  });

  test("org comes from the key only; a payload org_id is ignored", async () => {
    const r = await runIntake(t.deps, {
      kind: "application",
      authorization: bearer(aaKey.raw),
      body: { submission_id: SUB, org_id: YL.id, org: "young-life-epa" },
    });
    expect(r.status).toBe(200);
    expect(t.ran).toHaveLength(1);
    expect(t.ran[0].orgId).toBe(AA.id);
  });

  test("a repeat submission_id returns the first response and runs once", async () => {
    const req = { kind: "application", authorization: bearer(aaKey.raw), body: { submission_id: SUB } };
    const first = await runIntake(t.deps, req);
    const second = await runIntake(t.deps, req);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, id: first.body.id, duplicate: true });
    expect(t.ran).toHaveLength(1);
  });

  test("the same submission_id from two orgs is two submissions", async () => {
    await runIntake(t.deps, { kind: "application", authorization: bearer(aaKey.raw), body: { submission_id: SUB } });
    await runIntake(t.deps, { kind: "application", authorization: bearer(ylKey.raw), body: { submission_id: SUB } });
    expect(t.ran.map((r) => r.orgId)).toEqual([AA.id, YL.id]);
  });

  test("a submission still processing → 409, nothing runs", async () => {
    t.ledger.set(`${AA.id}:${SUB}`, { status: "processing", response: null });
    const r = await runIntake(t.deps, {
      kind: "application",
      authorization: bearer(aaKey.raw),
      body: { submission_id: SUB },
    });
    expect(r.status).toBe(409);
    expect(t.ran).toHaveLength(0);
  });

  test("a failed write → 500 and the claim is released so a retry can land", async () => {
    let fail = true;
    const flaky = t.stub("application", {
      run: async () => {
        if (fail) throw new Error("db down");
        return { id: "row-ok" };
      },
    });
    const d = makeDeps({ handlers: { application: flaky } });
    const req = { kind: "application", authorization: bearer(aaKey.raw), body: { submission_id: SUB2 } };
    const first = await runIntake(d.deps, req);
    expect(first.status).toBe(500);
    expect(d.released).toEqual([SUB2]);
    fail = false;
    const retry = await runIntake(d.deps, req);
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ ok: true, id: "row-ok" });
  });

  test("validation errors come back as 400 with the handler's message", async () => {
    const d = makeDeps({ handlers: { application } });
    const r = await runIntake(d.deps, {
      kind: "application",
      authorization: bearer(aaKey.raw),
      body: { submission_id: SUB, first_name: "Ada" },
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Missing student last name.");
  });
});

describe("handlers", () => {
  const ctx = (results: Parameters<typeof mockSupabase>[0]) => {
    const db = mockSupabase(results);
    return { db, ctx: { org: { ...AA, settings: {} }, db: db.client } };
  };

  test("application: cohort must belong to the key's org; row stamped with that org", async () => {
    const v = application.validate({
      first_name: "Ada",
      last_name: "L",
      grade: "10",
      guardian_name: "G",
      guardian_email: "G@Example.org",
      cohort_id: "11111111-1111-1111-1111-111111111111",
      org_id: YL.id,
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.data).not.toHaveProperty("org_id");
    const { db, ctx: c } = ctx([{ data: { id: "c1", name: "Spring" } }, { data: { id: "app-1" } }]);
    const out = await application.run(c, v.data);
    expect(out).toEqual({ id: "app-1", cohort_name: "Spring" });
    expect(db.calls.eq).toContainEqual(["org_id", AA.id]);
    expect(db.calls.insert[0]).toMatchObject({ org_id: AA.id, guardian_email: "g@example.org" });
  });

  test("application: a cohort from another org (or closed) files as general interest", async () => {
    const v = application.validate({
      first_name: "Ada",
      last_name: "L",
      grade: "10",
      guardian_name: "G",
      guardian_email: "g@example.org",
      cohort_id: "22222222-2222-2222-2222-222222222222",
    });
    if (!v.ok) throw new Error("expected valid");
    const { db, ctx: c } = ctx([{ data: null }, { data: { id: "app-2" } }]);
    await application.run(c, v.data);
    expect(db.calls.insert[0]).toMatchObject({ org_id: AA.id, cohort_id: null });
  });

  test("partner_inquiry maps both website forms onto the partners spine", () => {
    const schools = partnerInquiry.validate({
      source: "schools_form",
      name: "Pat",
      email: "PAT@school.org",
      role: "Counselor",
      organization: "EPA Academy",
      setting: "High school",
      student_count: "120",
    });
    expect(schools).toMatchObject({
      ok: true,
      data: { kind: "school", champion_email: "pat@school.org", teen_count: "120", program_type: "High school" },
    });
    const signup = partnerInquiry.validate({
      source: "signup_form",
      first_name: "Sam",
      last_name: "Lee",
      org_name: "Youth Club",
      email: "sam@club.org",
      program_type: "After school",
    });
    expect(signup).toMatchObject({ ok: true, data: { kind: "nonprofit", champion_name: "Sam Lee" } });
    expect(partnerInquiry.validate({ source: "other" }).ok).toBe(false);
  });

  test("donation: an existing Stripe payment gets the donor's name, no second row", async () => {
    const v = donation.validate({ amount: 50, stripePaymentId: "pi_1", firstName: "Dee", lastName: "Donor" });
    if (!v.ok) throw new Error("expected valid");
    const { db, ctx: c } = ctx([{ data: { id: "don-1" } }, { data: null }]);
    const out = await donation.run(c, v.data);
    expect(out).toEqual({ id: "don-1" });
    expect(db.calls.insert).toHaveLength(0);
    expect(db.calls.update[0]).toEqual({ first_name: "Dee", last_name: "Donor", email: null });
  });

  test("donation: a new payment inserts one row for the key's org", async () => {
    const v = donation.validate({ amount: "25", stripe_payment_id: "pi_2", name: "Jo Q Public", recurring: true });
    if (!v.ok) throw new Error("expected valid");
    const { db, ctx: c } = ctx([{ data: null }, { data: { id: "don-2" } }]);
    await donation.run(c, v.data);
    expect(db.calls.insert[0]).toMatchObject({
      org_id: AA.id,
      first_name: "Jo",
      last_name: "Q Public",
      amount: 25,
      recurring: true,
      status: "succeeded",
    });
  });

  test("every v1 kind is registered with a scope", () => {
    expect(Object.keys(INTAKE_HANDLERS).sort()).toEqual(
      [
        "application",
        "coach_signup",
        "company_contact",
        "demoday_signup",
        "donation",
        "partner_inquiry",
        "quiz_submission",
        "ygb_registration",
      ].sort(),
    );
    for (const h of Object.values(INTAKE_HANDLERS)) expect(h.scope).toMatch(/^intake:/);
  });
});
