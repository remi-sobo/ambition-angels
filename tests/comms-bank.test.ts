import { describe, expect, test } from "vitest";

import {
  bankVerdict,
  consentStatus,
  humanAge,
  sortBank,
  splitBank,
  type BankStory,
} from "../lib/comms/bank";

const TODAY = "2026-08-19";

const story = (over: Partial<BankStory> & { id: string }): BankStory => ({
  title: "A win",
  status: "approved",
  rank_order: null,
  happened_on: null,
  created_at: "2026-08-01T00:00:00Z",
  consent_state: null,
  publishable: true,
  blocked_reason: null,
  suggestion_score: 0,
  ...over,
});

describe("sortBank — a human drag always beats the machine", () => {
  test("ranked stories come first, in the order someone dragged them", () => {
    const out = sortBank([
      story({ id: "c", suggestion_score: 99 }),
      story({ id: "a", rank_order: 2 }),
      story({ id: "b", rank_order: 1 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  test("a top-scoring unranked story still sits below the lowest ranked one", () => {
    const out = sortBank([
      story({ id: "machine", suggestion_score: 100 }),
      story({ id: "human", rank_order: 9999 }),
    ]);
    expect(out[0].id).toBe("human");
  });

  test("unranked stories fall back to the computed score, highest first", () => {
    const out = sortBank([
      story({ id: "low", suggestion_score: 10 }),
      story({ id: "high", suggestion_score: 80 }),
      story({ id: "mid", suggestion_score: 45 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["high", "mid", "low"]);
  });

  test("ties break on recency then id, so the order never flickers between renders", () => {
    const a = story({ id: "aaa", suggestion_score: 5, created_at: "2026-08-02T00:00:00Z" });
    const b = story({ id: "bbb", suggestion_score: 5, created_at: "2026-08-02T00:00:00Z" });
    const c = story({ id: "ccc", suggestion_score: 5, created_at: "2026-08-03T00:00:00Z" });
    expect(sortBank([a, b, c]).map((s) => s.id)).toEqual(["ccc", "aaa", "bbb"]);
    expect(sortBank([c, b, a]).map((s) => s.id)).toEqual(["ccc", "aaa", "bbb"]);
  });

  test("does not mutate its input", () => {
    const input = [story({ id: "b", rank_order: 2 }), story({ id: "a", rank_order: 1 })];
    const copy = input.map((s) => s.id);
    sortBank(input);
    expect(input.map((s) => s.id)).toEqual(copy);
  });

  test("splitBank draws the hairline between ranked and suggested", () => {
    const { ranked, suggested } = splitBank([
      story({ id: "x", suggestion_score: 50 }),
      story({ id: "y", rank_order: 1 }),
    ]);
    expect(ranked.map((s) => s.id)).toEqual(["y"]);
    expect(suggested.map((s) => s.id)).toEqual(["x"]);
  });
});

describe("consentStatus — colour means the same thing as everywhere else", () => {
  test("a story with nobody to protect is neutral, not healthy", () => {
    expect(consentStatus(null)).toBe("neutral");
  });

  test("blocking states are critical; nagging states are watch", () => {
    expect(consentStatus("current")).toBe("healthy");
    expect(consentStatus("expiring")).toBe("watch");
    expect(consentStatus("pending")).toBe("watch");
    expect(consentStatus("expired")).toBe("critical");
    expect(consentStatus("revoked")).toBe("critical");
    expect(consentStatus("none")).toBe("critical");
  });
});

describe("humanAge", () => {
  test("reads the way a person would say it", () => {
    expect(humanAge("2026-08-19", TODAY)).toBe("today");
    expect(humanAge("2026-08-18", TODAY)).toBe("1 day");
    expect(humanAge("2026-08-13", TODAY)).toBe("6 days");
    expect(humanAge("2026-07-08", TODAY)).toBe("6 weeks");
    expect(humanAge("2026-02-19", TODAY)).toBe("6 months");
  });

  test("a future date reads as today rather than negative", () => {
    expect(humanAge("2026-09-01", TODAY)).toBe("today");
  });
});

describe("bankVerdict — one sentence, worst true thing first", () => {
  test("day one says what to do, not what is wrong", () => {
    expect(bankVerdict([], TODAY)).toMatch(/Capture one now/);
  });

  test("counts what is ready", () => {
    const v = bankVerdict([story({ id: "a" }), story({ id: "b" })], TODAY);
    expect(v).toMatch(/^2 stories ready to use\./);
  });

  test("singular reads as English, not '1 stories'", () => {
    expect(bankVerdict([story({ id: "a" })], TODAY)).toMatch(/^1 story ready to use\./);
  });

  test("consent blocks are named, and outrank an approval backlog", () => {
    const v = bankVerdict(
      [
        story({ id: "ok" }),
        story({ id: "blocked", publishable: false, consent_state: "none" }),
        story({ id: "raw", status: "raw", publishable: false }),
      ],
      TODAY,
    );
    expect(v).toContain("1 needs consent before you can use it.");
    expect(v).not.toContain("approval");
  });

  test("expiring consent surfaces when nothing is outright blocked", () => {
    const v = bankVerdict(
      [story({ id: "a" }), story({ id: "b", consent_state: "expiring" })],
      TODAY,
    );
    expect(v).toContain("1 consent expires within the month.");
  });

  test("with nothing blocked or expiring, the approval backlog gets the slot", () => {
    const v = bankVerdict(
      [story({ id: "a" }), story({ id: "raw", status: "raw", publishable: false })],
      TODAY,
    );
    expect(v).toContain("1 is still waiting on your approval.");
  });

  test("a healthy bank says only the good news", () => {
    const v = bankVerdict([story({ id: "a" }), story({ id: "b" })], TODAY);
    expect(v).toBe("2 stories ready to use.");
  });

  test("nudges about the best unused story once it is genuinely stale", () => {
    const v = bankVerdict(
      [story({ id: "old", happened_on: "2026-07-08", suggestion_score: 70 })],
      TODAY,
    );
    expect(v).toContain("Your best unused story is 6 weeks old.");
  });

  test("does not nag about a story from this week", () => {
    const v = bankVerdict(
      [story({ id: "fresh", happened_on: "2026-08-17", suggestion_score: 70 })],
      TODAY,
    );
    expect(v).not.toContain("unused");
  });

  test("an already-used story is not the 'best unused' one", () => {
    const v = bankVerdict(
      [story({ id: "used", status: "used", happened_on: "2026-05-01", suggestion_score: 90 })],
      TODAY,
    );
    expect(v).not.toContain("unused");
  });

  test("blocked stories never count as ready", () => {
    const v = bankVerdict(
      [story({ id: "blocked", publishable: false, consent_state: "revoked" })],
      TODAY,
    );
    expect(v).toMatch(/^0 stories ready to use\./);
  });
});
