import { beforeAll, describe, expect, test, vi } from "vitest";
import type { OrgCommsSettings } from "@/lib/comms/settings";
import { sendBlocker } from "@/lib/comms/settings";

// Comms v2 Phase 1: the shared renderer (campaign AND journey sends) must
// emit identity from org_comms_settings, a compliant footer, and RFC 8058
// one-click unsubscribe headers — and sends must refuse without settings.

const SETTINGS: OrgCommsSettings = {
  org_id: "00000000-0000-4000-8000-000000000000",
  from_name: "Ambition Angels",
  from_email: "hello@mail.example.org",
  reply_to: "remi@example.org",
  mailing_address: "380 Portage Ave, Palo Alto, CA 94306",
  footer_text: "EIN 87-2513010",
  daily_send_cap: 2000,
};

const CID = "9f3a1c2e-0000-4000-8000-000000000001";
const CAMPAIGN = "1b2c3d4e-0000-4000-8000-0000000000aa";

let buildCampaignEmail: typeof import("@/lib/fundraising/comms-email").buildCampaignEmail;
let personalize: typeof import("@/lib/fundraising/comms-email").personalize;

beforeAll(async () => {
  vi.resetModules();
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  ({ buildCampaignEmail, personalize } = await import("@/lib/fundraising/comms-email"));
});

describe("personalize", () => {
  test("substitutes {{first_name}} with fallback", () => {
    expect(personalize("Hi {{first_name}},", "Ada")).toBe("Hi Ada,");
    expect(personalize("Hi {{ First_Name }},", "")).toBe("Hi friend,");
  });
});

describe("buildCampaignEmail (campaign path)", () => {
  const payload = () =>
    buildCampaignEmail({
      settings: SETTINGS,
      to: "donor@example.com",
      subject: "Hello",
      bodyText: "Thanks for everything.",
      constituentId: CID,
      campaignId: CAMPAIGN,
    });

  test("identity comes from settings, never a constant", () => {
    const p = payload();
    expect(p.from).toBe("Ambition Angels <hello@mail.example.org>");
    expect(p.replyTo).toBe("remi@example.org");
  });

  test("List-Unsubscribe + List-Unsubscribe-Post headers present", () => {
    const h = payload().headers;
    expect(h["List-Unsubscribe"]).toContain("mailto:remi@example.org");
    expect(h["List-Unsubscribe"]).toContain("https://");
    expect(h["List-Unsubscribe"]).toContain(`c_id=${CID}`);
    expect(h["List-Unsubscribe"]).toContain(`&c=${CAMPAIGN}`);
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  test("footer carries mailing address, footer text, and unsubscribe link in both parts", () => {
    const p = payload();
    for (const part of [p.html, p.text]) {
      expect(part).toContain("380 Portage Ave, Palo Alto, CA 94306");
      expect(part).toContain("EIN 87-2513010");
      expect(part).toContain(`c_id=${CID}`);
    }
  });
});

describe("buildCampaignEmail (journey path: no campaign id)", () => {
  test("headers and footer still present without campaign attribution", () => {
    const p = buildCampaignEmail({
      settings: SETTINGS,
      to: "donor@example.com",
      subject: "Welcome",
      bodyText: "Step one.",
      constituentId: CID,
    });
    expect(p.headers["List-Unsubscribe"]).toContain(`c_id=${CID}`);
    expect(p.headers["List-Unsubscribe"]).not.toContain(`&c=`);
    expect(p.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(p.text).toContain("380 Portage Ave");
  });

  test("no constituent (test sends): mailto-only header, no one-click", () => {
    const p = buildCampaignEmail({
      settings: SETTINGS,
      to: "me@example.com",
      subject: "[TEST] Hello",
      bodyText: "Proof.",
      constituentId: null,
      campaignId: CAMPAIGN,
    });
    expect(p.headers["List-Unsubscribe"]).toContain("mailto:");
    expect(p.headers["List-Unsubscribe-Post"]).toBeUndefined();
    expect(p.text).toContain("Reply to unsubscribe");
  });
});

describe("sendBlocker (golden: refuse without settings)", () => {
  test("missing row blocks", () => {
    expect(sendBlocker(null)).toMatch(/settings are missing/i);
  });
  test("blank from_email blocks", () => {
    expect(sendBlocker({ ...SETTINGS, from_email: "  " })).toMatch(/from address/i);
  });
  test("blank mailing_address blocks", () => {
    expect(sendBlocker({ ...SETTINGS, mailing_address: "" })).toMatch(/mailing address/i);
  });
  test("complete settings pass", () => {
    expect(sendBlocker(SETTINGS)).toBeNull();
  });
});
