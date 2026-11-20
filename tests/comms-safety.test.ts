import { describe, it, expect } from "vitest";
import { parseEmailList, isStuck, leadershipCopyBody, STUCK_AFTER_MS, MAX_LEADERSHIP_EMAILS } from "@/lib/comms/safety";
import { EMAIL_TYPES } from "@/lib/notifications/notify";

// Comms v2.2 G4 (specs/comms-v2-gmail-amendment.md): safety nets.

describe("leadership copy list", () => {
  it("accepts commas, semicolons and new lines, lowercases and dedupes", () => {
    expect(parseEmailList("Ed@Org.org, chair@org.org;\ned@org.org")).toEqual({ emails: ["ed@org.org", "chair@org.org"] });
  });
  it("treats an empty box as no one", () => {
    expect(parseEmailList("  ")).toEqual({ emails: [] });
  });
  it("names the first bad entry", () => {
    expect(parseEmailList("ed@org.org, not-an-email")).toEqual({ error: '"not-an-email" isn\'t an email address.' });
  });
  it("caps the list", () => {
    const many = Array.from({ length: MAX_LEADERSHIP_EMAILS + 1 }, (_, i) => `p${i}@org.org`).join(",");
    expect(parseEmailList(many)).toHaveProperty("error");
  });
});

describe("stuck threshold", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  it("is stuck only after a full day of sending", () => {
    expect(isStuck(new Date(now - STUCK_AFTER_MS - 1000).toISOString(), now)).toBe(true);
    expect(isStuck(new Date(now - 60_000).toISOString(), now)).toBe(false);
    expect(isStuck(null, now)).toBe(false);
  });
});

describe("leadership copy body", () => {
  it("leads with a note and fills merge fields generically", () => {
    const body = leadershipCopyBody("Hi {{first_name}},\n\nThank you.", 412, "2026-11-20T18:00:00Z");
    expect(body.split("\n\n")[0]).toBe("This is a copy of a campaign that went to 412 people, finished Nov 20, 2026.");
    expect(body).toContain("Hi friend,");
  });
});

describe("alarms email the admin", () => {
  it("comms.stuck is an emailing notification type", () => {
    expect(EMAIL_TYPES.has("comms.stuck")).toBe(true);
  });
});
