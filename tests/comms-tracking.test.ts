import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { extractLinks, segmentLinks, newTrackingToken, isTrackingToken } from "@/lib/comms/links";
import { sendsCsv, pct, type SendRow } from "@/lib/comms/results";
import type { OrgCommsSettings } from "@/lib/comms/settings";

// Comms v2.2 G3 (specs/comms-v2-gmail-amendment.md): tracking, results, and
// the multi-tenant unsubscribe page.

const SETTINGS: OrgCommsSettings = {
  org_id: "00000000-0000-4000-8000-000000000000",
  from_name: "River Kids",
  from_email: "",
  reply_to: null,
  mailing_address: "1 Main St, Oakland, CA",
  footer_text: null,
  daily_send_cap: 400,
  transport: "gmail",
};

let buildCampaignEmail: typeof import("@/lib/fundraising/comms-email").buildCampaignEmail;

beforeAll(async () => {
  vi.resetModules();
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  process.env.APP_ORIGIN = "https://app.example.org";
  ({ buildCampaignEmail } = await import("@/lib/fundraising/comms-email"));
});

describe("links", () => {
  it("finds links in order and trims trailing punctuation", () => {
    const body = "Give at https://x.org/give. Or see (https://x.org/report), thanks!";
    expect(extractLinks(body)).toEqual(["https://x.org/give", "https://x.org/report"]);
  });

  it("numbers links across paragraphs from a start index", () => {
    const { segments, next } = segmentLinks("a https://one.org b https://two.org", 3);
    expect(segments.filter((s) => s.kind === "link").map((s) => (s.kind === "link" ? s.index : -1))).toEqual([3, 4]);
    expect(next).toBe(5);
  });

  it("makes URL-safe 32-character tokens", () => {
    const t = newTrackingToken();
    expect(isTrackingToken(t)).toBe(true);
    expect(newTrackingToken()).not.toBe(t);
    expect(isTrackingToken("../etc/passwd")).toBe(false);
  });
});

describe("tracked rendering", () => {
  const body = "Hi Sam,\n\nOur report: https://x.org/report.\n\nGive: https://x.org/give";
  const token = "A".repeat(32);

  it("routes every link through the click tracker, numbered like extractLinks", () => {
    const { html } = buildCampaignEmail({ settings: SETTINGS, to: "a@b.org", subject: "s", bodyText: body, constituentId: null, trackingToken: token });
    const links = extractLinks(body);
    links.forEach((url, i) => {
      expect(html).toContain(`href="https://app.example.org/api/t/c/${token}/${i}"`);
      expect(html).toContain(`>${url}</a>`);
    });
    expect(html).toContain(`src="https://app.example.org/api/t/o/${token}"`);
  });

  it("links straight to the URL and adds no pixel without a token (test sends)", () => {
    const { html, text } = buildCampaignEmail({ settings: SETTINGS, to: "a@b.org", subject: "s", bodyText: body, constituentId: null });
    expect(html).toContain('href="https://x.org/report"');
    expect(html).not.toContain("/api/t/");
    expect(text).toContain("https://x.org/give");
  });

  it("escapes everything that isn't a link", () => {
    const { html } = buildCampaignEmail({ settings: SETTINGS, to: "a@b.org", subject: "s", bodyText: "<script>x</script> https://x.org/?a=1&b=\"2\"", constituentId: null, trackingToken: token });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("results", () => {
  const row = (over: Partial<SendRow>): SendRow => ({
    id: "1", email: "a@b.org", first_name: "Sam", status: "sent", error: null, sent_at: null, open_count: 0, click_count: 0, ...over,
  });

  it("writes CSV with quoting and defuses spreadsheet formulas", () => {
    const csv = sendsCsv([row({ first_name: "=HYPERLINK(\"x\")", error: "a, b" })]);
    const [header, line] = csv.trim().split("\r\n");
    expect(header).toBe("email,first_name,status,sent_at,opens,clicks,error");
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(line).toContain('"a, b"');
  });

  it("computes percentages safely", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 0)).toBeNull();
  });
});

describe("unsubscribe page is per org", () => {
  it("names no tenant in code", () => {
    const src = readFileSync(join(__dirname, "..", "app", "api", "unsubscribe", "route.ts"), "utf8");
    expect(src).not.toMatch(/Ambition Angels|ambitionangels\.org/);
  });
});
