import { describe, expect, test } from "vitest";
import { formatDossier, parseNextMove } from "@/lib/agents/next-move/agent";
import type { NextMoveDossier } from "@/lib/agents/next-move/types";

const baseDossier: NextMoveDossier = {
  entityType: "constituent",
  entityId: "00000000-0000-4000-8000-000000000001",
  name: "Alan Schroeder",
  kind: "person",
  email: "alan@example.org",
  doNotContact: false,
  tags: ["board-referral"],
  notes: null,
  lifetimeGiving: 25000,
  giftCount: 1,
  gifts: [{ date: "2025-06-16", amount: 25000, method: "check" }],
  activeRecurring: false,
  retentionFlags: ["LYBUNT"],
  engagementScore: 41,
  lastThankedAt: "2025-06-20",
  interactions: [
    { date: "2025-06-18", kind: "email", direction: "outbound", summary: "Thank you for your gift" },
  ],
  openAsks: [],
  openTasks: [{ title: "Reengage Alan Schroeder (LYBUNT)", dueDate: "2026-07-24" }],
  researchExcerpt: null,
  prospectContext: null,
};

describe("parseNextMove", () => {
  test("passes through a well-formed email suggestion", () => {
    const s = parseNextMove(
      {
        action: "Send Alan a one-year-later impact note",
        rationale: "Gave $25k in June 2025, nothing since; last touch was the thank-you.",
        channel: "email",
        due_in_days: 2,
        email_subject: "One year since your gift",
        email_body: "Hi Alan,\n\n...\n\nRemi",
      },
      false
    );
    expect(s).not.toBeNull();
    expect(s!.channel).toBe("email");
    expect(s!.emailSubject).toBe("One year since your gift");
    expect(s!.emailBody).toContain("Remi");
    expect(s!.dueInDays).toBe(2);
  });

  test("strips outreach channels and drafts when do_not_contact is set", () => {
    const s = parseNextMove(
      {
        action: "Email Alan about the fall cohort",
        rationale: "r",
        channel: "email",
        due_in_days: 1,
        email_subject: "Hello",
        email_body: "Hi",
      },
      true
    );
    expect(s!.channel).toBe("note");
    expect(s!.emailSubject).toBeNull();
    expect(s!.emailBody).toBeNull();
  });

  test("drops the email draft when the channel is not email", () => {
    const s = parseNextMove(
      { action: "Call Alan", rationale: "r", channel: "call", due_in_days: 0, email_subject: "x", email_body: "y" },
      false
    );
    expect(s!.channel).toBe("call");
    expect(s!.emailSubject).toBeNull();
    expect(s!.emailBody).toBeNull();
  });

  test("clamps due days into 0-30 and coerces unknown channels", () => {
    const s = parseNextMove(
      { action: "Do a thing", rationale: "r", channel: "carrier-pigeon", due_in_days: 400 },
      false
    );
    expect(s!.channel).toBe("other");
    expect(s!.dueInDays).toBe(30);
  });

  test("returns null for garbage or an empty action", () => {
    expect(parseNextMove(null, false)).toBeNull();
    expect(parseNextMove("nope", false)).toBeNull();
    expect(parseNextMove({ action: "   ", channel: "email" }, false)).toBeNull();
  });
});

describe("formatDossier", () => {
  test("includes the load-bearing facts and the DNC warning only when set", () => {
    const text = formatDossier(baseDossier, "2026-07-17");
    expect(text).toContain("Alan Schroeder");
    expect(text).toContain("$25,000 lifetime over 1 gift(s)");
    expect(text).toContain("Retention flags: LYBUNT");
    expect(text).toContain("Reengage Alan Schroeder (LYBUNT)");
    expect(text).not.toContain("DO NOT CONTACT");

    const dnc = formatDossier({ ...baseDossier, doNotContact: true }, "2026-07-17");
    expect(dnc).toContain("DO NOT CONTACT");
  });

  test("frames bench prospects as having no giving history", () => {
    const text = formatDossier(
      {
        ...baseDossier,
        entityType: "fr_prospects",
        prospectContext: "Source: manual. Status: active.",
        gifts: [],
        giftCount: 0,
        lifetimeGiving: 0,
      },
      "2026-07-17"
    );
    expect(text).toContain("prospect on the bench");
    expect(text).toContain("Source: manual");
    expect(text).not.toContain("### Giving");
  });
});
