import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emailTimelineItems, type DonorSendRow } from "@/lib/comms/timeline";
import { commsDecisionLine, commsNeedsYou, type CommsHomeCounts } from "@/lib/comms/home";

/** V4 Stage D: results on the donor timeline, and Comms Home's sentence. */

const row = (over: Partial<DonorSendRow>): DonorSendRow => ({
  id: "s1", status: "sent", sent_at: "2026-11-18T17:00:00Z", claimed_at: null, created_at: "2026-11-18T16:59:00Z",
  first_opened_at: null, open_count: 0, first_clicked_at: null, click_count: 0, campaign_id: "c1",
  campaign: { name: "November impact update", subject: "What your gift did this fall" }, ...over,
});

describe("donor timeline entries from email_sends", () => {
  test("a sent email is one entry with the subject, linked to its campaign", () => {
    const [e] = emailTimelineItems([row({})]);
    expect(e.title).toBe("Email sent: What your gift did this fall");
    expect(e.at).toBe("2026-11-18T17:00:00Z");
    expect(e.campaignId).toBe("c1");
    expect(e.chips).toEqual([]);
    expect(e.meta).toMatch(/Not opened yet/);
  });

  test("opens and clicks ride on the send as chips; opens are labelled estimates", () => {
    const [e] = emailTimelineItems([row({ first_opened_at: "2026-11-19T15:00:00Z", open_count: 2, first_clicked_at: "2026-11-19T15:01:00Z", click_count: 1 })]);
    expect(e.chips).toEqual(["Opened Nov 19", "Clicked a link"]);
    expect(e.meta).toMatch(/estimates/);
  });

  test("an unknown send says it may not have gone out; never-delivered rows stay off the record", () => {
    const items = emailTimelineItems([
      row({ id: "u", status: "unknown", sent_at: null, claimed_at: "2026-11-18T17:00:00Z" }),
      row({ id: "p", status: "pending", sent_at: null }),
      row({ id: "f", status: "failed", sent_at: null }),
      row({ id: "k", status: "skipped", sent_at: null }),
      row({ id: "x", status: "suppressed", sent_at: null }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["es-u"]);
    expect(items[0].title).toMatch(/may not have gone out/);
  });

  test("newest first", () => {
    const items = emailTimelineItems([row({ id: "a", sent_at: "2026-10-01T00:00:00Z" }), row({ id: "b", sent_at: "2026-11-01T00:00:00Z" })]);
    expect(items.map((i) => i.id)).toEqual(["es-b", "es-a"]);
  });

  test("the donor record reads email_sends pinned to the active org and renders the entries", () => {
    const src = readFileSync(join(__dirname, "..", "app/admin/fundraising/donors/[id]/DonorProfile.tsx"), "utf8");
    const at = src.indexOf('.from("email_sends")');
    expect(at).toBeGreaterThan(0);
    const stmt = src.slice(at, src.indexOf(";", at));
    expect(stmt).toContain('.eq("org_id", ctx.orgId)');
    expect(stmt).toContain('.eq("constituent_id", id)');
    expect(src).toContain("emailTimelineItems(");
  });
});

const base: CommsHomeCounts = {
  unknownSends: 0, unknownCampaigns: 0, storiesReady: 0, storiesWaitingConsent: 0, storiesToApprove: 0,
  keptDrafts: 0, editionsReadyToSend: 0, scheduled: 0, nextScheduledAt: null, senderBlocked: null,
};

describe("Comms Home decision line and Needs you", () => {
  test("a sender that can't send comes first", () => {
    expect(commsDecisionLine({ ...base, senderBlocked: "connect your Gmail in Comms Settings.", unknownSends: 3 })).toMatch(/^Nothing can send yet/);
  });
  test("unknown sends next, with the never-resend promise", () => {
    const l = commsDecisionLine({ ...base, unknownSends: 3, unknownCampaigns: 1 });
    expect(l).toBe("1 send needs a decision: we could not confirm 3 emails went out. We never resend on our own.");
  });
  test("then ready editions and stories waiting on consent, at most two sentences", () => {
    const l = commsDecisionLine({ ...base, editionsReadyToSend: 1, storiesWaitingConsent: 2, nextScheduledAt: "2026-11-24T17:00:00Z" });
    expect(l).toBe("1 edition is ready to review and send. 2 stories are waiting on consent.");
  });
  test("a quiet day says so", () => {
    expect(commsDecisionLine(base)).toMatch(/Nothing needs you/);
  });
  test("Needs you orders unknown sends first and links consent rows to the waiting view", () => {
    const rows = commsNeedsYou({ ...base, unknownSends: 2, unknownCampaigns: 1, storiesWaitingConsent: 1, keptDrafts: 3 }, { unknownHref: "/admin/comms/emails/c1" });
    expect(rows.map((r) => r.key)).toEqual(["unknown", "kept", "consent"]);
    expect(rows[0].href).toBe("/admin/comms/emails/c1");
    expect(rows[2].href).toBe("/admin/comms/stories?consent=waiting");
  });
});
