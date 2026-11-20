import { beforeEach, describe, expect, test, vi } from "vitest";

// Org email identity (pre-SafeSpace): every donor-facing send path sends as
// the org the gift belongs to. Another org never gets Ambition Angels'
// identity, an org that hasn't set up its identity is refused (nothing is
// sent), and Ambition Angels' own output is unchanged.

const sent: Array<Record<string, unknown>> = [];

vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: vi.fn(async (payload: Record<string, unknown>) => {
        sent.push(payload);
        return { data: { id: "msg-1" }, error: null };
      }),
    };
  },
}));
vi.mock("@/lib/comms/gmail-connection", () => ({
  getActiveGmailConnection: vi.fn(async () => null),
  getGmailConnectionStatus: vi.fn(async () => ({ state: "none" })),
  markGmailConnectionBroken: vi.fn(async () => {}),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/fundraising/steward", () => ({ getDefaultSteward: vi.fn(async () => "steward") }));
vi.mock("@/lib/fundraising/ack-tasks", () => ({
  closeAckTaskForGift: vi.fn(async () => null),
  ensureAckTaskForGift: vi.fn(async () => "task-1"),
  ensureEscalationTaskForGift: vi.fn(async () => null),
}));

let ctx = { userId: "u1", email: "a@x.org", orgId: "org-aa", orgName: "Ambition Angels", role: "owner" as const };
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  getAdminUser: vi.fn(async () => "remi"),
}));

// ── A table-keyed Supabase fake ─────────────────────────────────────────────
type Tables = {
  orgs: Record<string, unknown> | null;
  org_comms_settings: Record<string, unknown> | null;
  gift: Record<string, unknown>;
  rules?: unknown[];
};
let tables: Tables;
const writes: Array<{ table: string; op: string; value: unknown }> = [];

function fakeDb() {
  const from = (table: string) => {
    let op = "select";
    let selectAfterWrite = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    const result = (): { data: unknown; error: null; count?: number } => {
      if (table === "orgs") return { data: tables.orgs, error: null };
      if (table === "org_comms_settings") return { data: tables.org_comms_settings, error: null };
      if (table === "gifts") {
        if (op === "update") return { data: selectAfterWrite ? [{ id: tables.gift.id }] : null, error: null };
        if (op === "count") return { data: null, error: null, count: 1 };
        return { data: tables.gift, error: null };
      }
      if (table === "stewardship_rules") return { data: tables.rules ?? [], error: null };
      return { data: null, error: null };
    };
    for (const m of ["eq", "neq", "in", "order", "limit", "is", "gte", "lte"]) b[m] = () => b;
    b.select = (_cols?: string, opts?: { head?: boolean }) => {
      if (op === "update" || op === "insert") selectAfterWrite = true;
      else if (opts?.head) op = "count";
      return b;
    };
    b.update = (v: unknown) => ((op = "update"), writes.push({ table, op, value: v }), b);
    b.insert = (v: unknown) => ((op = "insert"), writes.push({ table, op, value: v }), b);
    b.maybeSingle = () => Promise.resolve(result());
    b.single = () => Promise.resolve(result());
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return b;
  };
  return { from };
}
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => fakeDb() }));

import {
  AA_ACK_FROM,
  AA_TAX_STATEMENT,
  buildOrgEmailIdentity,
  buildReceiptEmail,
  type OrgIdentityRow,
} from "@/lib/email/org-identity";
import type { OrgCommsSettings } from "@/lib/comms/settings";
import type { ReceiptGift } from "@/lib/fundraising/receipt";
import { operatorFromLine } from "@/lib/email/operator";
import { POST } from "@/app/api/admin/acknowledgments/send/route";
import { processGiftStewardship } from "@/lib/fundraising/stewardship";
import { ensureAckTaskForGift } from "@/lib/fundraising/ack-tasks";

// ── Fixtures ────────────────────────────────────────────────────────────────
const AA_ORG: OrgIdentityRow = { id: "org-aa", name: "Ambition Angels", slug: "ambition-angels", settings: {} };
const AA_COMMS: OrgCommsSettings = {
  org_id: "org-aa",
  from_name: "Ambition Angels",
  from_email: "careers@mail.ambitionangels.org",
  reply_to: null,
  mailing_address: "380 Portage Ave, Palo Alto, CA 94306",
  footer_text: "EIN 87-2513010",
  daily_send_cap: 2000,
  transport: "resend",
};
const SAFE_ORG: OrgIdentityRow = {
  id: "org-safe",
  name: "SafeSpace",
  slug: "safespace",
  settings: { legal_name: "SafeSpace Inc.", ein: "12-3456789" },
};
const SAFE_COMMS: OrgCommsSettings = {
  org_id: "org-safe",
  from_name: "SafeSpace",
  from_email: "redacted@example.invalid",
  reply_to: "redacted@example.invalid",
  mailing_address: "1 Main St, Oakland, CA 94601",
  footer_text: null,
  daily_send_cap: 400,
  transport: "resend",
};
const GIFT: ReceiptGift = { amount: 300, gift_date: "2026-06-01", method: "check", fair_market_value: null, deductible_amount: null };

const AA_STRINGS = [/ambition\s*angels/i, /ambitionangels/i, /87-2513010/, /Portage/];
function expectNoAA(value: unknown) {
  const s = JSON.stringify(value);
  for (const re of AA_STRINGS) expect(s).not.toMatch(re);
}

function ok(org: OrgIdentityRow | null, comms: OrgCommsSettings | null, purpose: "donor" | "receipt" = "receipt") {
  const r = buildOrgEmailIdentity(org, comms, purpose);
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.identity;
}
function refused(org: OrgIdentityRow | null, comms: OrgCommsSettings | null, purpose: "donor" | "receipt" = "receipt") {
  const r = buildOrgEmailIdentity(org, comms, purpose);
  if (r.ok) throw new Error("expected a refusal");
  return r.reason;
}

// ── Pure identity ───────────────────────────────────────────────────────────
describe("Ambition Angels keeps its exact identity", () => {
  test("from line and tax line are byte for byte what was hardcoded", () => {
    const id = ok(AA_ORG, AA_COMMS);
    expect(id.from).toBe("Ambition Angels <careers@mail.ambitionangels.org>");
    expect(id.taxStatement).toBe(
      "Ambition Angels is a 501(c)(3) nonprofit organization. Please retain this letter as your receipt for tax purposes."
    );
    expect(id.replyTo).toBeNull();
    expect(id.letterhead).toBe("380 Portage Ave, Palo Alto, CA 94306 · EIN 87-2513010");
  });

  test("the receipt email AA donors get is unchanged", () => {
    const email = buildReceiptEmail(ok(AA_ORG, AA_COMMS), { to: "d@x.org", subject: "Thanks", personalNote: "Thank you!", gift: GIFT });
    expect(email.from).toBe(AA_ACK_FROM);
    expect(email.replyTo).toBeUndefined();
    expect(email.text).toBe(
      [
        "Thank you!",
        "—".repeat(30),
        [
          "Gift amount: $300.00",
          "Date received: June 1, 2026",
          "Method: check",
          "No goods or services were provided in exchange for this contribution.",
          AA_TAX_STATEMENT,
        ].join("\n"),
      ].join("\n\n")
    );
    expect(email.html).toContain(">Ambition Angels · ambitionangels.org</p>");
  });

  test("AA's default does not depend on its comms row", () => {
    expect(ok(AA_ORG, null).from).toBe(AA_ACK_FROM);
  });
});

describe("another org never gets Ambition Angels' identity", () => {
  test("a configured org sends as itself, with its own tax line", () => {
    const id = ok(SAFE_ORG, SAFE_COMMS);
    expect(id.from).toBe("SafeSpace <redacted@example.invalid>");
    expect(id.replyTo).toBe("redacted@example.invalid");
    expect(id.taxStatement).toBe(
      "SafeSpace Inc. is a 501(c)(3) nonprofit organization, EIN 12-3456789. Please retain this letter as your receipt for tax purposes."
    );
    const email = buildReceiptEmail(id, { to: "d@x.org", subject: "Thanks", personalNote: "Thank you!", gift: GIFT });
    expectNoAA(email);
    expect(email.html).toContain("SafeSpace · 1 Main St, Oakland, CA 94601");
  });

  test("an org named like AA but without AA's slug gets no AA default", () => {
    const impostor = { ...SAFE_ORG, name: "Ambition Angels" };
    expect(refused(impostor, null)).toMatch(/sending identity/);
  });

  test("a Gmail org takes its name from its own settings", () => {
    const id = ok(SAFE_ORG, { ...SAFE_COMMS, transport: "gmail", from_email: "" });
    expect(id.from).toBe("SafeSpace");
    expect(id.sender.kind).toBe("comms");
  });

  test("a non-AA org with a from address on AA's sending domain is refused", () => {
    expect(refused(SAFE_ORG, { ...SAFE_COMMS, from_email: "careers@mail.ambitionangels.org" })).toMatch(
      /Ambition Angels' sending domain/
    );
    expect(refused(SAFE_ORG, { ...SAFE_COMMS, reply_to: "remi@ambitionangels.org" })).toMatch(/reply-to/);
  });
});

describe("an unconfigured org is refused", () => {
  test("no comms settings", () => {
    expect(refused(SAFE_ORG, null, "donor")).toMatch(/Comms settings/);
  });
  test("no mailing address", () => {
    expect(refused(SAFE_ORG, { ...SAFE_COMMS, mailing_address: " " }, "donor")).toMatch(/mailing address/);
  });
  test("no from address on Resend", () => {
    expect(refused(SAFE_ORG, { ...SAFE_COMMS, from_email: "" }, "donor")).toMatch(/from address/);
  });
  test("a receipt without legal name and EIN is refused; a plain donor email is not", () => {
    const noLegal = { ...SAFE_ORG, settings: {} };
    expect(refused(noLegal, SAFE_COMMS, "receipt")).toMatch(/legal name and EIN/);
    expect(refused({ ...SAFE_ORG, settings: { legal_name: "SafeSpace Inc.", ein: "nope" } }, SAFE_COMMS)).toMatch(/EIN/);
    expect(ok(noLegal, SAFE_COMMS, "donor").taxStatement).toBeNull();
  });
  test("unknown org", () => {
    expect(refused(null, SAFE_COMMS)).toMatch(/could not be found/);
  });
});

describe("operator email branding", () => {
  test("neutral BloomOS plus the org the email is about", () => {
    expect(operatorFromLine("SafeSpace")).toBe("BloomOS · SafeSpace <careers@mail.ambitionangels.org>");
    expect(operatorFromLine(null)).toBe("BloomOS <careers@mail.ambitionangels.org>");
    expect(operatorFromLine("SafeSpace")).not.toMatch(/Ambition Angels/);
  });
});

describe("unsubscribe links use the app origin, not the marketing site", () => {
  test("APP_ORIGIN wins", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "s");
    vi.stubEnv("APP_ORIGIN", "https://app.bloomos.org");
    vi.stubEnv("MARKETING_ORIGIN", "https://www.ambitionangels.org");
    vi.resetModules();
    const mod = await import("@/lib/fundraising/unsubscribe");
    expect(mod.unsubscribeUrl("c1")).toMatch(/^https:\/\/app\.bloomos\.org\/api\/unsubscribe\?/);
    vi.unstubAllEnvs();
  });
});

// ── Send paths ──────────────────────────────────────────────────────────────
const giftRow = {
  id: "11111111-2222-3333-4444-555555555555",
  amount: 300,
  gift_date: "2026-06-01",
  method: "check",
  fair_market_value: null,
  deductible_amount: null,
  acknowledgment_status: "pending",
  external_source: "manual",
  recurring_plan_id: null,
  constituent_id: "c1",
  constituent: { type: "individual", first_name: "Dana", last_name: "Lee", org_name: null, emails: ["dana@example.org"] },
};

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/admin/acknowledgments/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  );
const sendBody = { gift_id: giftRow.id, personal_note: "Thank you!", subject: "Thanks" };

beforeEach(() => {
  sent.length = 0;
  writes.length = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.mocked(ensureAckTaskForGift).mockClear();
});

describe("manual thank-you send route", () => {
  test("AA sends exactly as before", async () => {
    ctx = { ...ctx, orgId: "org-aa", orgName: "Ambition Angels" };
    tables = { orgs: AA_ORG, org_comms_settings: AA_COMMS, gift: giftRow };
    const res = await post(sendBody);
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe(AA_ACK_FROM);
    expect(String(sent[0].text)).toContain(AA_TAX_STATEMENT);
  });

  test("SafeSpace sends as SafeSpace, with no AA identity anywhere", async () => {
    ctx = { ...ctx, orgId: "org-safe", orgName: "SafeSpace" };
    tables = { orgs: SAFE_ORG, org_comms_settings: SAFE_COMMS, gift: giftRow };
    const res = await post(sendBody);
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe("SafeSpace <redacted@example.invalid>");
    expectNoAA(sent[0]);
  });

  test("an unconfigured org is refused and nothing is sent or claimed", async () => {
    ctx = { ...ctx, orgId: "org-safe", orgName: "SafeSpace" };
    tables = { orgs: { ...SAFE_ORG, settings: {} }, org_comms_settings: SAFE_COMMS, gift: giftRow };
    const res = await post(sendBody);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/legal name and EIN/);
    expect(sent).toHaveLength(0);
    expect(writes.filter((w) => w.table === "gifts")).toHaveLength(0);
  });
});

describe("stewardship auto-receipt", () => {
  const autoRule = [
    { id: "r5", name: "auto", rank: 50, conditions: {}, action: "auto_email", channel: "email", template_id: null, sla_hours: 0, assignee: null },
  ];

  test("AA auto-sends as before", async () => {
    tables = { orgs: AA_ORG, org_comms_settings: AA_COMMS, gift: giftRow, rules: autoRule };
    const d = await processGiftStewardship(fakeDb() as never, { orgId: "org-aa", createdBy: "remi", giftId: giftRow.id });
    expect(d?.action).toBe("auto_email");
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe(AA_ACK_FROM);
  });

  test("SafeSpace auto-sends as SafeSpace", async () => {
    tables = { orgs: SAFE_ORG, org_comms_settings: SAFE_COMMS, gift: giftRow, rules: autoRule };
    await processGiftStewardship(fakeDb() as never, { orgId: "org-safe", createdBy: "x", giftId: giftRow.id });
    expect(sent).toHaveLength(1);
    expectNoAA(sent[0]);
  });

  test("an unconfigured org is skipped with a reason and the gift goes to a human", async () => {
    tables = { orgs: SAFE_ORG, org_comms_settings: null, gift: giftRow, rules: autoRule };
    const d = await processGiftStewardship(fakeDb() as never, { orgId: "org-safe", createdBy: "x", giftId: giftRow.id });
    expect(sent).toHaveLength(0);
    expect(d?.action).toBe("create_task");
    expect(d?.blockedReason).toMatch(/Comms settings/);
    expect(ensureAckTaskForGift).toHaveBeenCalledTimes(1);
  });
});
