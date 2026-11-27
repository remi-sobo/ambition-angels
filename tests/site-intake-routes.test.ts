import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

// Every public form route sends to BloomOS through the intake API and never
// opens a database client of its own (specs/bloomos-repo-split.md §6a).

const sent: { kind: string; fields: Record<string, unknown> }[] = [];
let outcome: Record<string, unknown> = { outcome: "delivered", body: { ok: true, id: "row-1" } };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/site/bloomos", () => ({
  sendToBloomOS: vi.fn(async (kind: string, fields: Record<string, unknown>) => {
    sent.push({ kind, fields });
    return outcome;
  }),
}));
const dbTouched = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    dbTouched();
    throw new Error("form routes must not open a database client");
  },
}));
const emails: { to: string; subject: string }[] = [];
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (m: { to: string; subject: string }) => void emails.push(m) };
  },
}));

const post = (body: unknown) =>
  new NextRequest("https://www.ambitionangels.org/api/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
  });

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  sent.length = 0;
  emails.length = 0;
  dbTouched.mockClear();
  outcome = { outcome: "delivered", body: { ok: true, id: "row-1" } };
});
afterEach(() => vi.unstubAllEnvs());

describe("public forms", () => {
  test("schools inquiry → partner_inquiry, submitter still gets the website's confirmation", async () => {
    const { POST } = await import("@/app/api/schools-inquiry/route");
    const res = await POST(
      post({ name: "Pat", email: "pat@school.org", role: "Counselor", organization: "EPA", setting: "High school" }),
    );
    expect(res.status).toBe(200);
    expect(sent[0]).toMatchObject({ kind: "partner_inquiry", fields: { source: "schools_form", organization: "EPA" } });
    expect(emails.map((e) => e.to)).toEqual(["pat@school.org"]);
    expect(dbTouched).not.toHaveBeenCalled();
  });

  test("company contact → company_contact, no operator email from the website", async () => {
    const { POST } = await import("@/app/api/partner-waitlist/route");
    const res = await POST(
      post({ first_name: "Cam", last_name: "Co", email: "cam@co.com", role: "Corporate Partner", company: "Co" }),
    );
    expect(res.status).toBe(200);
    expect(sent[0].kind).toBe("company_contact");
    expect(emails.map((e) => e.to)).toEqual(["cam@co.com"]);
    expect(dbTouched).not.toHaveBeenCalled();
  });

  test("demo day → demoday_signup", async () => {
    const { POST } = await import("@/app/api/demoday/signup/route");
    const res = await POST(post({ first_name: "Dee", last_name: "Day", email: "dee@x.org", engagement: ["As a mentor"] }));
    expect(res.status).toBe(200);
    expect(sent[0]).toMatchObject({ kind: "demoday_signup", fields: { engagement: ["As a mentor"] } });
    expect(sent[0].fields).not.toHaveProperty("source");
    expect(dbTouched).not.toHaveBeenCalled();
  });

  test("a queued form still shows the visitor success", async () => {
    outcome = { outcome: "queued" };
    const { POST } = await import("@/app/api/program-partner-signup/route");
    const res = await POST(
      post({ first_name: "Sam", last_name: "Lee", org_name: "Club", email: "sam@club.org", program_type: "After school" }),
    );
    expect(res.status).toBe(200);
    expect(dbTouched).not.toHaveBeenCalled();
  });

  test("a 400 from BloomOS is shown to the visitor", async () => {
    outcome = { outcome: "rejected", status: 400, error: "Missing required fields" };
    const { POST } = await import("@/app/api/demoday/signup/route");
    const res = await POST(post({ first_name: "Dee", last_name: "Day", email: "dee@x.org" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required fields" });
  });

  test("only a double failure asks the visitor to retry", async () => {
    outcome = { outcome: "failed" };
    const { POST } = await import("@/app/api/schools-inquiry/route");
    const res = await POST(
      post({ name: "Pat", email: "pat@school.org", role: "Counselor", organization: "EPA", setting: "High school" }),
    );
    expect(res.status).toBe(500);
  });

  test("site-side validation still runs first: nothing is sent for an incomplete form", async () => {
    const { POST } = await import("@/app/api/schools-inquiry/route");
    const res = await POST(post({ name: "Pat" }));
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });
});
