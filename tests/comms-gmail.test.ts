import { describe, it, expect, beforeEach } from "vitest";
import { buildRawMessage, formatAddress, headerText } from "@/lib/comms/transport/mime";
import { classifyGmailError } from "@/lib/comms/transport/gmail";
import {
  buildGmailConsentUrl,
  gmailRedirectUri,
  grantIncludesGmailSend,
  GMAIL_SEND_SCOPE,
} from "@/lib/comms/gmail-oauth";
import { sendBlocker, type OrgCommsSettings } from "@/lib/comms/settings";

// Comms v2.2 G1 (specs/comms-v2-gmail-amendment.md): each org sends from its
// own connected Gmail account.

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("Gmail MIME builder (ported from Team Esface)", () => {
  const base = {
    from: formatAddress("River Kids", "dana@riverkids.org"),
    to: "donor@example.com",
    subject: "Thank you",
    text: "Hi Sam,\n\nThank you.",
  };

  it("builds a plain-text message with the right headers", () => {
    const msg = decode(buildRawMessage(base, "b1"));
    expect(msg).toContain('From: "River Kids" <dana@riverkids.org>\r\n');
    expect(msg).toContain("To: donor@example.com\r\n");
    expect(msg).toContain("Subject: Thank you\r\n");
    expect(msg).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(msg).not.toContain("multipart");
    expect(msg).toContain(Buffer.from(base.text, "utf8").toString("base64"));
  });

  it("sends html as a multipart/alternative twin", () => {
    const msg = decode(buildRawMessage({ ...base, html: "<p>Hi</p>" }, "b2"));
    expect(msg).toContain('Content-Type: multipart/alternative; boundary="b2"');
    expect(msg).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(msg.trimEnd().endsWith("--b2--")).toBe(true);
  });

  it("carries List-Unsubscribe headers and Reply-To", () => {
    const msg = decode(
      buildRawMessage(
        {
          ...base,
          replyTo: "hello@riverkids.org",
          headers: {
            "List-Unsubscribe": "<mailto:hello@riverkids.org?subject=unsubscribe>, <https://x.org/u?t=1>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        },
        "b3"
      )
    );
    expect(msg).toContain("Reply-To: hello@riverkids.org\r\n");
    expect(msg).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n");
  });

  it("encodes a non-ASCII subject and display name", () => {
    expect(headerText("Gracias, José")).toMatch(/^=\?UTF-8\?B\?/);
    expect(formatAddress("Niños Unidos", "a@b.org")).toMatch(/^=\?UTF-8\?B\?.+\?= <a@b\.org>$/);
  });

  it("escapes quotes in an ASCII display name", () => {
    expect(formatAddress('The "Best" Org', "a@b.org")).toBe('"The \\"Best\\" Org" <a@b.org>');
  });

  it("refuses header injection through merge data", () => {
    expect(() => buildRawMessage({ ...base, to: "a@b.org\r\nBcc: everyone@x.org" })).toThrow();
    expect(() => buildRawMessage({ ...base, headers: { "X-Note": "a\r\nBcc: x@y.org" } })).toThrow();
    expect(() => buildRawMessage({ ...base, headers: { "Bad Header": "x" } })).toThrow();
    // A line break in the subject is folded to a space, never a new header.
    expect(decode(buildRawMessage({ ...base, subject: "Hi\r\nBcc: x@y.org" }))).not.toContain("\r\nBcc:");
  });
});

describe("Gmail connect consent", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    delete process.env.APP_ORIGIN;
  });

  it("asks only to send, forces the account chooser, and returns to comms", () => {
    const url = new URL(buildGmailConsentUrl("https://app.example.org", "s1"));
    expect(url.searchParams.get("scope")).toBe(`${GMAIL_SEND_SCOPE} openid email`);
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.org/api/admin/comms/connect-gmail/callback"
    );
    expect(url.searchParams.get("scope")).not.toMatch(/gmail\.(readonly|modify)|mail\.google\.com/);
  });

  it("builds the redirect from APP_ORIGIN when set", () => {
    process.env.APP_ORIGIN = "https://app.bloomos.org/";
    expect(gmailRedirectUri("http://localhost:3000")).toBe(
      "https://app.bloomos.org/api/admin/comms/connect-gmail/callback"
    );
  });

  it("refuses a grant where the send permission was unticked", () => {
    expect(grantIncludesGmailSend(`openid ${GMAIL_SEND_SCOPE} email`)).toBe(true);
    expect(grantIncludesGmailSend("openid email")).toBe(false);
    expect(grantIncludesGmailSend(undefined)).toBe(false);
  });
});

describe("Gmail error handling", () => {
  it("treats a dead grant as a broken connection", () => {
    const r = classifyGmailError({ response: { status: 400, data: { error: "invalid_grant" } }, message: "invalid_grant" });
    expect(r).toMatchObject({ failure: "auth", breaksConnection: true });
    expect(classifyGmailError({ code: 401, message: "Invalid Credentials" })).toMatchObject({ failure: "auth", breaksConnection: true });
  });

  it("pauses on Google's limits without breaking the connection", () => {
    expect(classifyGmailError({ code: 429, message: "User-rate limit exceeded" })).toMatchObject({ failure: "paused", breaksConnection: false });
    expect(classifyGmailError({ code: 403, message: "Daily user sending quota exceeded" })).toMatchObject({ failure: "paused", breaksConnection: false });
  });

  it("rejects one bad message and calls anything unclear unknown", () => {
    expect(classifyGmailError({ code: 400, message: "Invalid To header" })).toMatchObject({ failure: "rejected" });
    expect(classifyGmailError(new Error("socket hang up"))).toMatchObject({ failure: "unknown" });
    expect(classifyGmailError({ code: 503, message: "Backend Error" })).toMatchObject({ failure: "unknown" });
  });
});

describe("sendBlocker with transports", () => {
  const settings = (over: Partial<OrgCommsSettings>): OrgCommsSettings => ({
    org_id: "o1",
    from_name: "River Kids",
    from_email: "",
    reply_to: null,
    mailing_address: "1 Main St, Oakland, CA",
    footer_text: null,
    daily_send_cap: 400,
    transport: "gmail",
    ...over,
  });

  it("doesn't need a from address on Gmail (the connected account is the sender)", () => {
    expect(sendBlocker(settings({}))).toBeNull();
  });

  it("still needs a from address on Resend", () => {
    expect(sendBlocker(settings({ transport: "resend" }))).toMatch(/from address/);
  });

  it("always needs a mailing address", () => {
    expect(sendBlocker(settings({ mailing_address: " " }))).toMatch(/mailing address/);
  });
});
