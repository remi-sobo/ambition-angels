import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./support/fakeDb";

/**
 * Pre-SafeSpace item 10: the scheduled jobs that EMAIL people send only for
 * orgs holding `notify.operator_emails`. Org A holds it, org B does not; both
 * have something to send. Each job must mail A and never B. A failed opt-in
 * read sends nothing.
 */

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";

let db: FakeDb;
let residentOrg = ORG_A;
const operatorSends: { orgId: string; to?: string }[] = [];
const gmailSends: string[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("@/lib/email/operator", () => ({
  getOperatorEmails: vi.fn(async (orgId: string) => [`ops-${orgId.slice(-1)}@example.org`]),
  sendOperatorEmail: vi.fn(async (orgId: string) => {
    operatorSends.push({ orgId });
    return true;
  }),
  sendOperatorEmailTo: vi.fn(async (to: string, _s: string, _h: string, orgId: string) => {
    operatorSends.push({ orgId, to });
    return true;
  }),
  operatorEmailShell: (_t: string, body: string) => body,
  fmtUsd: (n: number) => `$${n}`,
}));
vi.mock("@/lib/admin/plan/metrics", () => ({ refreshAllPlanMetrics: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/briefing/narrate", () => ({ prewarmNarrative: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/orgs", () => ({ getResidentOrgId: vi.fn(async () => residentOrg) }));
vi.mock("@/lib/briefing", () => ({
  generateBriefing: vi.fn(async () => ({ narrative: null, priorities: [], headline: null })),
}));
vi.mock("@/lib/admin/crmOverdue", () => {
  const empty = { all: [], partners: [], donors: [], total: 0 };
  return {
    gatherCrmOverdue: vi.fn(async () => empty),
    groupOverdue: () => empty,
    assigneeFromEmail: () => null,
    crmTaskHref: () => "",
  };
});
vi.mock("@/lib/google/gmail", () => ({
  sendEmail: vi.fn(async (m: { to: string }) => {
    gmailSends.push(m.to);
  }),
}));
vi.mock("@/lib/meet/host", () => ({ getBookingHost: vi.fn(async () => ({ name: "Host" })) }));
vi.mock("@/lib/email/templates/reminder-24h", () => ({
  buildReminder24hEmail: () => ({ subject: "Tomorrow", html: "<p>x</p>", text: "x" }),
}));
vi.mock("@/lib/email/templates/reminder-1h", () => ({
  buildReminder1hEmail: () => ({ subject: "Soon", html: "<p>x</p>", text: "x" }),
}));

import { GET as dailyReminders } from "@/app/api/cron/daily-reminders/route";
import { GET as weeklyDigest } from "@/app/api/cron/weekly-digest/route";
import { GET as meetReminders } from "@/app/api/cron/meet-reminders/route";

const cronReq = (path: string) =>
  new NextRequest(`http://localhost/api/cron/${path}`, { headers: { authorization: "Bearer s3cret" } });

const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function seed(optIn: string[]) {
  const booking = (org: string, id: string) => ({
    id,
    org_id: org,
    status: "confirmed",
    reminder_sent_24h: false,
    reminder_sent_1h: false,
    start_time: new Date(Date.now() + 24 * 3600_000).toISOString(),
    attendee_email: `booker-${org.slice(-1)}@example.org`,
  });
  db = fakeDb({
    orgs: [{ id: ORG_A }, { id: ORG_B }],
    org_entitlements: [
      ...optIn.map((org_id) => ({ org_id, feature_key: "notify.operator_emails", enabled: true })),
      // A different key, and a disabled opt-in row: neither counts.
      { org_id: ORG_B, feature_key: "modules.comms", enabled: true },
      ...(optIn.includes(ORG_B) ? [] : [{ org_id: ORG_B, feature_key: "notify.operator_emails", enabled: false }]),
    ],
    compliance_items: [
      { id: "ca", org_id: ORG_A, title: "Form 990", jurisdiction: "federal", status: "upcoming", due_date: daysFromNow(-3) },
      { id: "cb", org_id: ORG_B, title: "Form 990", jurisdiction: "federal", status: "upcoming", due_date: daysFromNow(-3) },
    ],
    bookings: [booking(ORG_A, "ba"), booking(ORG_B, "bb")],
  });
}

/** Orgs whose 24h reminder flag flipped, i.e. whose booker was emailed. */
const remindedOrgs = () =>
  (db.tables.bookings ?? []).filter((r) => r.reminder_sent_24h === true).map((r) => r.org_id);

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  operatorSends.length = 0;
  gmailSends.length = 0;
  residentOrg = ORG_A;
  seed([ORG_A]);
});

describe("daily-reminders", () => {
  test("emails the opted-in org and skips the org without notify.operator_emails", async () => {
    const res = await dailyReminders(cronReq("daily-reminders"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(operatorSends.map((s) => s.orgId)).toEqual([ORG_A]);
    const b = body.results.find((r: { orgId: string }) => r.orgId === ORG_B);
    expect(b).toMatchObject({ sent: false, reason: "not opted in (notify.operator_emails)" });
  });

  test("with no opt-in rows at all, nothing is sent", async () => {
    seed([]);
    await dailyReminders(cronReq("daily-reminders"));
    expect(operatorSends).toEqual([]);
  });

  test("a failed opt-in read fails closed with a 500 and sends nothing", async () => {
    const real = db.client.from.bind(db.client);
    db.client.from = (t: string) =>
      t === "org_entitlements"
        ? { select: () => ({ eq: () => ({ eq: async () => ({ data: null, error: { message: "boom" } }) }) }) }
        : real(t);
    const res = await dailyReminders(cronReq("daily-reminders"));
    expect(res.status).toBe(500);
    expect(operatorSends).toEqual([]);
  });
});

describe("weekly-digest", () => {
  test("sends for the resident org when it is opted in", async () => {
    const res = await weeklyDigest(cronReq("weekly-digest"));
    expect((await res.json()).sent).toBe(1);
    expect(operatorSends).toEqual([{ orgId: ORG_A, to: "ops-a@example.org" }]);
  });

  test("skips the resident org without notify.operator_emails", async () => {
    residentOrg = ORG_B;
    const res = await weeklyDigest(cronReq("weekly-digest"));
    expect(await res.json()).toMatchObject({ sent: 0, skipped: "not opted in (notify.operator_emails)" });
    expect(operatorSends).toEqual([]);
  });
});

describe("meet-reminders", () => {
  test("reminds bookers of the opted-in org only, gated by the booking's org", async () => {
    const res = await meetReminders(cronReq("meet-reminders"));
    const body = await res.json();
    expect(gmailSends).toEqual(["booker-a@example.org"]);
    expect(remindedOrgs()).toEqual([ORG_A]);
    expect(body.skipped.orgs).toEqual([ORG_B]);
  });

  test("with both orgs opted in, both bookers are reminded", async () => {
    seed([ORG_A, ORG_B]);
    await meetReminders(cronReq("meet-reminders"));
    expect(gmailSends.sort()).toEqual(["booker-a@example.org", "booker-b@example.org"]);
  });
});
