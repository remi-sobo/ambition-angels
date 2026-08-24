import { describe, test, expect } from "vitest";
import {
  ATTRIBUTION_WINDOW_DAYS,
  attributeGifts,
  leadStyleNote,
  performanceVerdict,
  type AttributableGift,
  type EditionPerformance,
} from "@/lib/comms/loop";
import { bankVerdict, type BankStory } from "@/lib/comms/bank";

// The loop closes deterministically: gifts attribute by "received the send and
// gave inside the window", never by a model's guess, and the verdict line's
// learned sentence comes from the org's own tags.

const gift = (over: Partial<AttributableGift> = {}): AttributableGift => ({
  constituent_id: "c1",
  amount: 100,
  gift_date: "2026-08-25",
  ...over,
});

const SENT = "2026-08-20T17:00:00Z";
const recipients = new Set(["c1", "c2"]);

describe("attributeGifts", () => {
  test("a recipient's gift inside the window attributes", () => {
    const a = attributeGifts([gift()], recipients, SENT);
    expect(a).toEqual({ count: 1, total: 100, windowDays: ATTRIBUTION_WINDOW_DAYS });
  });

  test("a gift from someone who never received the send does not", () => {
    expect(attributeGifts([gift({ constituent_id: "stranger" })], recipients, SENT).count).toBe(0);
  });

  test("an anonymous gift never attributes — we can't know they received anything", () => {
    expect(attributeGifts([gift({ constituent_id: null })], recipients, SENT).count).toBe(0);
  });

  test("the day of the send counts; the day before does not", () => {
    expect(attributeGifts([gift({ gift_date: "2026-08-20" })], recipients, SENT).count).toBe(1);
    expect(attributeGifts([gift({ gift_date: "2026-08-19" })], recipients, SENT).count).toBe(0);
  });

  test("the last day of the window counts; the day after does not", () => {
    expect(attributeGifts([gift({ gift_date: "2026-09-19" })], recipients, SENT).count).toBe(1);
    expect(attributeGifts([gift({ gift_date: "2026-09-20" })], recipients, SENT).count).toBe(0);
  });

  test("the window crosses a month boundary correctly", () => {
    const a = attributeGifts([gift({ gift_date: "2026-09-01" })], recipients, SENT);
    expect(a.count).toBe(1);
  });

  test("totals sum across recipients", () => {
    const a = attributeGifts(
      [gift(), gift({ constituent_id: "c2", amount: 250 })],
      recipients,
      SENT,
    );
    expect(a).toMatchObject({ count: 2, total: 350 });
  });
});

describe("performanceVerdict", () => {
  const base: EditionPerformance = {
    sent: 214,
    failed: 0,
    gifts: { count: 3, total: 1250, windowDays: 30 },
    storyTitles: [],
    windowOpen: false,
  };

  test("reach first, then money — and money is phrased as correlation", () => {
    expect(performanceVerdict(base)).toBe(
      "Reached 214 people. 3 recipients gave $1,250 within 30 days.",
    );
  });

  test("failures are said out loud", () => {
    expect(performanceVerdict({ ...base, failed: 2 })).toContain("2 addresses failed.");
  });

  test("a totally failed send is the whole verdict", () => {
    expect(performanceVerdict({ ...base, sent: 0, failed: 12 })).toBe(
      "This send failed — nobody received it.",
    );
  });

  test("no gifts + open window says the window is open, not that it flopped", () => {
    const v = performanceVerdict({
      ...base,
      gifts: { count: 0, total: 0, windowDays: 30 },
      windowOpen: true,
    });
    expect(v).toContain("window is still open");
  });

  test("no gifts + closed window states the fact without spin", () => {
    const v = performanceVerdict({
      ...base,
      gifts: { count: 0, total: 0, windowDays: 30 },
      windowOpen: false,
    });
    expect(v).toContain("No gifts from recipients within 30 days.");
  });

  test("null gifts (no fundraising access) says nothing about money at all", () => {
    const v = performanceVerdict({ ...base, gifts: null });
    expect(v).toBe("Reached 214 people.");
  });
});

describe("leadStyleNote", () => {
  const bank = (over: Partial<BankStory>): BankStory => ({
    id: "x",
    title: "t",
    status: "approved",
    rank_order: null,
    happened_on: null,
    created_at: "2026-08-01T00:00:00Z",
    consent_state: null,
    publishable: true,
    blocked_reason: null,
    tags: [],
    ...over,
  });

  test("no sent edition yet → nothing to say", () => {
    expect(leadStyleNote(null, [])).toBeNull();
  });

  test("a lead with no tags teaches nothing → nothing to say", () => {
    expect(leadStyleNote({ title: "Untagged", tags: [] }, [])).toBeNull();
  });

  test("counts READY stories sharing the lead's first tag", () => {
    const note = leadStyleNote({ title: "Marcus", tags: ["internships"] }, [
      bank({ id: "a", tags: ["internships"] }),
      bank({ id: "b", tags: ["internships"] }),
      bank({ id: "c", tags: ["partners"] }),
    ]);
    expect(note).toBe("Your last edition led with a “internships” story; 2 more like it are ready.");
  });

  test("a used or unpublishable story is not 'ready'", () => {
    const note = leadStyleNote({ title: "Marcus", tags: ["internships"] }, [
      bank({ id: "a", tags: ["internships"], status: "used" }),
      bank({ id: "b", tags: ["internships"], publishable: false }),
    ]);
    expect(note).toBe(
      "Your last edition led with a “internships” story — nothing like it is ready for the next one.",
    );
  });

  test("singular phrasing for exactly one", () => {
    const note = leadStyleNote({ title: "Marcus", tags: ["internships"] }, [
      bank({ id: "a", tags: ["internships"] }),
    ]);
    expect(note).toContain("1 more like it is ready.");
  });
});

describe("bankVerdict + leadNote", () => {
  const s: BankStory = {
    id: "a",
    title: "t",
    status: "approved",
    rank_order: null,
    happened_on: null,
    created_at: "2026-08-01T00:00:00Z",
    consent_state: "current",
    publishable: true,
    blocked_reason: null,
  };

  test("the learned sentence lands at the end of the verdict", () => {
    const v = bankVerdict([s], "2026-08-24", "Your last edition led with a “demo day” story; 1 more like it is ready.");
    expect(v.endsWith("1 more like it is ready.")).toBe(true);
    expect(v.startsWith("1 story ready to use.")).toBe(true);
  });

  test("null keeps the verdict exactly as before — no trailing space, no change", () => {
    expect(bankVerdict([s], "2026-08-24", null)).toBe(bankVerdict([s], "2026-08-24"));
  });
});
