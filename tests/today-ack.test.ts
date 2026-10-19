import { describe, expect, test } from "vitest";
import {
  ackDonorName,
  ackDueDate,
  ackTitle,
  buildAckFacts,
  giftOrdinals,
  orderAckSlots,
  ordinalLabel,
  type AckGift,
} from "@/lib/admin/todayAck";
import { rankObligations, type ObligationRow } from "@/lib/admin/todayRank";
import type { StewardshipRule } from "@/lib/fundraising/stewardship";
import { calendarDayFilter } from "@/lib/admin/ops/week";

// specs/needs-you-popout-thank-yous.md, PR 1: named acknowledgment rows on
// Today, due dates from the stewardship matrix, overdue-then-amount order.

const TODAY = "2026-10-13";

// Mirrors AA's live matrix (rank-ordered), escalation included.
const RULES: StewardshipRule[] = [
  { id: "r1", name: "first gift", rank: 10, conditions: { first_gift: true, max_age_days: 30 }, action: "create_task_and_draft", channel: "call", template_id: null, sla_hours: 48, assignee: "shannon" },
  { id: "r2", name: "major", rank: 20, conditions: { min_amount: 1000, max_age_days: 30 }, action: "create_task", channel: "call", template_id: null, sla_hours: 24, assignee: "shannon" },
  { id: "r3", name: "in-kind", rank: 30, conditions: { methods: ["in_kind"], max_age_days: 30 }, action: "create_task", channel: "letter", template_id: null, sla_hours: 72, assignee: "shannon" },
  { id: "r4", name: "receipt", rank: 40, conditions: { min_amount: 250, max_age_days: 30 }, action: "create_task", channel: "email", template_id: null, sla_hours: 48, assignee: "shannon" },
  { id: "r9", name: "escalate", rank: 900, conditions: { min_amount: 1000, max_age_days: 30 }, action: "escalate", channel: "call", template_id: null, sla_hours: 24, assignee: "remi" },
];

const person = (first: string, last: string) => ({ type: "person", first_name: first, last_name: last, org_name: null, emails: [] });

const gift = (over: Partial<AckGift>): AckGift => ({
  id: "g1",
  amount: 100,
  gift_date: "2026-07-02",
  method: "other",
  external_source: "hubspot_deal",
  recurring_plan_id: null,
  constituent_id: "c1",
  constituent: person("Lynne", "O'Hara"),
  ...over,
});

describe("ackDonorName: never a blank row", () => {
  test("people by name, organizations by org name", () => {
    expect(ackDonorName(person("Lynne", "O'Hara"))).toBe("Lynne O'Hara");
    expect(ackDonorName({ type: "organization", first_name: null, last_name: null, org_name: "Fast Forward", emails: [] })).toBe("Fast Forward");
  });
  test("no constituent, or no name and no email, reads Unnamed donor", () => {
    expect(ackDonorName(null)).toBe("Unnamed donor");
    expect(ackDonorName({ type: "person", first_name: null, last_name: " ", org_name: null, emails: [] })).toBe("Unnamed donor");
    expect(ackDonorName({ type: "organization", first_name: null, last_name: null, org_name: "", emails: [] })).toBe("Unnamed donor");
  });
});

describe("ackDueDate: gift date plus the matched rule's SLA", () => {
  test("a major gift is due in 1 day (24h), not on the gift date", () => {
    expect(ackDueDate(gift({ amount: 50000, gift_date: "2026-06-26" }), RULES, 6)).toBe("2026-06-27");
  });
  test("a $250+ repeat gift is due in 2 days (48h)", () => {
    expect(ackDueDate(gift({ amount: 500 }), RULES, 2)).toBe("2026-07-04");
  });
  test("in-kind is due in 3 days (72h)", () => {
    expect(ackDueDate(gift({ amount: 100, method: "in_kind" }), RULES, 2)).toBe("2026-07-05");
  });
  test("rules are evaluated as of the gift's own day, so old gifts still match", () => {
    // max_age_days: 30 would reject a July gift evaluated in October.
    expect(ackDueDate(gift({ amount: 1000, gift_date: "2026-07-02" }), RULES, 3)).toBe("2026-07-03");
  });
  test("no matching rule (or no rules at all) falls back to 48h", () => {
    expect(ackDueDate(gift({ amount: 10 }), RULES, 4)).toBe("2026-07-04");
    expect(ackDueDate(gift({ amount: 50000 }), [], 1)).toBe("2026-07-04");
  });
  test("a gift dated today is not overdue today", () => {
    expect(ackDueDate(gift({ amount: 10, gift_date: TODAY }), [], 1) > TODAY).toBe(true);
  });
});

describe("giftOrdinals and labels", () => {
  test("position in the donor's history, same-day ties broken by id", () => {
    const m = giftOrdinals([
      { id: "b", constituent_id: "c1", gift_date: "2026-01-01" },
      { id: "a", constituent_id: "c1", gift_date: "2026-01-01" },
      { id: "c", constituent_id: "c1", gift_date: "2026-06-26" },
      { id: "x", constituent_id: "c2", gift_date: "2025-01-01" },
      { id: "n", constituent_id: null, gift_date: "2025-01-01" },
    ]);
    expect([m.get("a"), m.get("b"), m.get("c"), m.get("x"), m.get("n")]).toEqual([1, 2, 3, 1, undefined]);
  });
  test("ordinal suffixes", () => {
    expect([1, 2, 3, 4, 6, 11, 12, 13, 21, 22, 112].map(ordinalLabel)).toEqual([
      "1st gift", "2nd gift", "3rd gift", "4th gift", "6th gift", "11th gift", "12th gift", "13th gift", "21st gift", "22nd gift", "112th gift",
    ]);
  });
  test("the row title the spec asks for", () => {
    const history = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, constituent_id: "c1", gift_date: `2026-0${i + 1}-26` }));
    const facts = buildAckFacts([gift({ id: "g5", amount: 50000, gift_date: "2026-06-26" })], history, RULES).get("g5")!;
    expect(ackTitle(facts, TODAY)).toBe("Thank Lynne O'Hara · $50,000 · Jun 26 · 6th gift");
    expect(ackTitle({ ...facts, amount: 62.5, giftDate: "2025-12-31", ordinal: 1 }, TODAY)).toBe(
      "Thank Lynne O'Hara · $62.50 · Dec 31, 2025 · 1st gift",
    );
  });
  test("a gift missing from the history read still renders as a 1st gift", () => {
    const facts = buildAckFacts([gift({ id: "solo" })], [], RULES).get("solo")!;
    expect(facts.ordinal).toBe(1);
  });
});

describe("orderAckSlots: overdue first, then amount descending", () => {
  const row = (over: Partial<ObligationRow> & { amount?: number }): ObligationRow & { amount?: number } => ({
    id: `x:${Math.random().toString(36).slice(2)}`,
    type: "ops_task",
    title: "t",
    why_it_matters: null,
    due_date: null,
    state: "open",
    module: "ops",
    ...over,
  });

  test("acks re-order among their own slots; other rows keep their positions", () => {
    const rows = [
      row({ id: "small-old", type: "acknowledgment", due_date: "2026-07-03", amount: 10 }),
      row({ id: "task", due_date: "2026-07-04" }),
      row({ id: "big-new", type: "acknowledgment", due_date: "2026-07-05", amount: 50000 }),
      row({ id: "mid", type: "acknowledgment", due_date: "2026-07-01", amount: 1000 }),
      row({ id: "future-ack", type: "acknowledgment", due_date: "2026-10-15", amount: 99999 }),
      row({ id: "undated", due_date: null }),
    ];
    const ranked = rankObligations(rows, TODAY);
    expect(ranked.map((r) => r.id)).toEqual(["mid", "small-old", "task", "big-new", "future-ack", "undated"]);
    const ordered = orderAckSlots(ranked, TODAY);
    // Slots 0, 1, 3 were overdue acks → by amount; the not-yet-due ack stays
    // after them even though it is the largest; the task stays in slot 2.
    expect(ordered.map((r) => r.id)).toEqual(["big-new", "mid", "task", "small-old", "future-ack", "undated"]);
  });

  test("no acknowledgments: the ranking is untouched", () => {
    const ranked = rankObligations([row({ id: "a", due_date: "2026-10-01" }), row({ id: "b" })], TODAY);
    expect(orderAckSlots(ranked, TODAY)).toEqual(ranked);
  });
});

describe("calendarDayFilter: My day covers the org's day, all-day events included", () => {
  test("timed events by Pacific midnight; all-day events by their UTC-midnight date", () => {
    // PDT (UTC-7)
    expect(calendarDayFilter("2026-10-19")).toBe(
      "and(all_day.not.is.true,start_time.gte.2026-10-19T07:00:00.000Z,start_time.lt.2026-10-20T07:00:00.000Z)," +
        "and(all_day.is.true,start_time.gte.2026-10-19T00:00:00.000Z,start_time.lt.2026-10-20T00:00:00.000Z)",
    );
  });
  test("across the DST change the timed window is 25 hours (PDT start, PST end)", () => {
    expect(calendarDayFilter("2026-11-01")).toContain(
      "start_time.gte.2026-11-01T07:00:00.000Z,start_time.lt.2026-11-02T08:00:00.000Z",
    );
  });
});
