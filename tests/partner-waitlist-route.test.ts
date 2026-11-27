import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// POST /api/partner-waitlist. Three forms share this route: the Guide
// waitlist, the MESA student signup, and the /companies inquiry (role
// "Corporate Partner"). What is pinned here is the corporate branch: a
// company lead gets the short company confirmation, never the Guide waitlist
// email, and BloomOS gets the company, the person's role and the interest.
// BloomOS stores the contact and alerts the team; the website only sends the
// person their confirmation.

type Sent = { to: string; subject: string; text?: string; html?: string; replyTo?: string };

const intake: { kind: string; fields: Record<string, unknown> }[] = [];
let outcome: Record<string, unknown> = { outcome: "delivered", body: { ok: true, id: "c1" } };
let sent: Sent[] = [];
let sendThrows = false;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/site/bloomos", () => ({
  sendToBloomOS: async (kind: string, fields: Record<string, unknown>) => {
    intake.push({ kind, fields });
    return outcome;
  },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (m: Sent) => {
        if (sendThrows) throw new Error("resend down");
        sent.push(m);
        return { data: { id: "e1" }, error: null };
      },
    };
  },
}));

import { POST } from "@/app/api/partner-waitlist/route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/partner-waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );

const company = {
  first_name: "Dana",
  last_name: "Okafor",
  email: "dana@example.com",
  role: "Corporate Partner",
  teen_count: "",
  company: "  Example Co  ",
  role_category: "Head of Social Impact",
  interest: "Sponsoring a season",
  problem_to_solve: "Interested in: Sponsoring a season",
};

const TEAM = "remi@ambitionangels.org";
const toSender = () => sent.filter((m) => m.to !== TEAM);
const toTeam = () => sent.filter((m) => m.to === TEAM);

beforeEach(() => {
  intake.length = 0;
  outcome = { outcome: "delivered", body: { ok: true, id: "c1" } };
  sent = [];
  sendThrows = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("company inquiry (role Corporate Partner)", () => {
  test("sends the company, the person's role and the interest to BloomOS", async () => {
    const res = await post(company);
    expect(res.status).toBe(200);
    expect(intake).toHaveLength(1);
    expect(intake[0].kind).toBe("company_contact");
    expect(intake[0].fields).toMatchObject({
      first_name: "Dana",
      last_name: "Okafor",
      email: "dana@example.com",
      role: "Corporate Partner",
      teen_count: null,
      role_category: "Head of Social Impact",
      interest: "Sponsoring a season",
      problem_to_solve: "Interested in: Sponsoring a season",
    });
    expect(String(intake[0].fields.company).trim()).toBe("Example Co");
  });

  test("sends the company confirmation, not the Guide waitlist email", async () => {
    await post(company);
    const mine = toSender();
    expect(mine).toHaveLength(1);
    expect(mine[0].to).toBe("dana@example.com");
    expect(mine[0].subject).toBe("We got your note");
    expect(mine[0].replyTo).toBe(TEAM);
    expect(mine[0].html).toBeUndefined();
    expect(mine[0].text).toContain("Hi Dana,");
    expect(mine[0].text).toContain("Example Co");
    expect(mine[0].text).toContain("We got your note.");
    expect(mine[0].text).toContain("I'll reply personally within a few days.");
    expect(mine[0].text).not.toMatch(/waitlist|Guide/i);
    expect(sent.some((m) => /Guide waitlist/.test(m.subject) && m.to !== TEAM)).toBe(false);
  });

  test("the website sends no team notification: BloomOS does", async () => {
    await post(company);
    expect(toTeam()).toHaveLength(0);
  });

  test("a failed save returns 500 and sends no email", async () => {
    outcome = { outcome: "failed" };
    const res = await post(company);
    expect(res.status).toBe(500);
    expect(sent).toHaveLength(0);
  });

  test("an email failure does not fail a saved inquiry", async () => {
    sendThrows = true;
    const res = await post(company);
    expect(res.status).toBe(200);
  });
});

describe("the other two forms are unchanged", () => {
  test("a Guide signup still gets the Guide waitlist email", async () => {
    await post({ first_name: "Ana", last_name: "Lee", email: "ana@example.com", role: "Teacher", teen_count: "10-25" });
    expect(toSender()).toHaveLength(1);
    expect(toSender()[0].subject).toBe("You're on the Ambition Angels Guide waitlist");
    expect(intake[0].fields).toMatchObject({ role: "Teacher", teen_count: "10-25" });
  });

  test("a MESA student gets no confirmation email", async () => {
    const res = await post({ first_name: "Sam", email: "sam@example.com", role: "MESA Student" });
    expect(res.status).toBe(200);
    expect(toSender()).toHaveLength(0);
    expect(toTeam()).toHaveLength(0);
    expect(intake[0].fields).toMatchObject({ role: "MESA Student" });
  });

  test("missing required fields are rejected before any write", async () => {
    const res = await post({ first_name: "Dana", email: "dana@example.com", role: "Corporate Partner" });
    expect(res.status).toBe(400);
    expect(intake).toHaveLength(0);
  });
});

describe("/companies page copy rules", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  const page = read("app/companies/page.tsx");
  const form = read("app/companies/ContactForm.tsx");

  test("retired lines stay retired", () => {
    for (const src of [page, form]) {
      expect(src).not.toMatch(/0 of 5/i);
      expect(src).not.toMatch(/careers nobody planned/i);
      expect(src).not.toMatch(/how it started/i);
    }
  });

  test("no pricing, no em dashes", () => {
    for (const src of [page, form]) {
      expect(src).not.toMatch(/\$\s?\d/);
      expect(src).not.toContain("—");
    }
  });

  test("Twilio is credited as founding partner", () => {
    expect(page).toContain('eyebrow: "Founding partner", name: "Twilio"');
  });
});
