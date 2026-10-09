import { describe, expect, test } from "vitest";
import { parseCaptureCards, validDate } from "@/lib/capture/validate";
import { MATCH_CONFIDENCE_MIN, MAX_CARDS, NEAR_TIE_DELTA } from "@/lib/capture/constants";
import type { Candidate, StaffMember } from "@/lib/capture/types";

// Capture C2 step 6. The model's tool input is untrusted; these pin every
// rule the validator enforces before a card can be staged.

const TODAY = "2026-10-09";

const cand = (p: Partial<Candidate> & Pick<Candidate, "ref" | "kind" | "id" | "name" | "sim" | "spans">): Candidate => ({
  orgName: null,
  meta: null,
  context: false,
  ...p,
});

const kendra1 = cand({ ref: "c1", kind: "constituent", id: "k1", name: "Kendra Sobomehin", sim: 0.95, spans: ["Kendra"], meta: "person · last touch Oct 08, 2026" });
const kendra2 = cand({ ref: "c2", kind: "constituent", id: "k2", name: "Kendra Sobomehin", sim: 0.95 - NEAR_TIE_DELTA + 0.02, spans: ["Kendra"], meta: "person" });
const maria = cand({ ref: "c3", kind: "constituent", id: "m1", name: "Maria Chen", sim: 1, spans: ["Maria Chen"] });
const koshland = cand({ ref: "c4", kind: "partner", id: "p1", name: "Koshland Foundation", sim: 0.9, spans: ["Koshland Foundation"], meta: "nonprofit" });
const peninsula = cand({ ref: "c5", kind: "prospect", id: "pr1", name: "Peninsula Community Foundation", sim: 0.88, spans: ["Peninsula Community Foundation"] });
const candidates = [kendra1, kendra2, maria, koshland, peninsula];

const staff: StaffMember[] = [{ ref: "s1", name: "Shannon Example", handle: "shannon", userId: "u-shannon" }];

const ctx = { candidates, staff, todayIso: TODAY };

const interaction = (over: Record<string, unknown> = {}) => ({
  dest: "interaction",
  source_sentence: "Had coffee with Maria Chen.",
  ref: "c3",
  heard_name: null,
  confidence: 0.95,
  kind: "meeting",
  notes: "Coffee. Wants the impact numbers before their November board meeting.",
  ...over,
});

describe("parseCaptureCards", () => {
  test("a clean interaction lands as proposed on the matched constituent", () => {
    const { cards, dropped } = parseCaptureCards({ cards: [interaction({ org_ref: "c4" })], youth_skipped: 0 }, ctx);
    expect(dropped).toEqual([]);
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.status).toBe("proposed");
    expect(c.entity_type).toBe("constituent");
    expect(c.entity_id).toBe("m1");
    expect(c.payload.kind).toBe("meeting");
    expect(c.payload.occurred_at).toBe(TODAY);
    expect(c.payload.org_match).toEqual({ kind: "partner", id: "p1", name: "Koshland Foundation" });
    expect(c.match_candidates).toHaveLength(1);
    expect(c.position).toBe(1);
  });

  test("an invented ref is treated as unmatched: an interaction is held with the name heard", () => {
    const { cards } = parseCaptureCards(
      { cards: [interaction({ ref: "c99", heard_name: "Reggie Watts" })], youth_skipped: 0 },
      ctx,
    );
    expect(cards[0].status).toBe("held");
    expect(cards[0].entity_id).toBeNull();
    expect(cards[0].entity_type).toBeNull();
    expect(cards[0].heard_name).toBe("Reggie Watts");
  });

  test("a prospect-only interaction becomes a thought prefixed with the prospect name", () => {
    const { cards } = parseCaptureCards(
      { cards: [interaction({ ref: "c5", notes: "They are opening a youth workforce round." })], youth_skipped: 0 },
      ctx,
    );
    expect(cards[0].dest).toBe("thought");
    expect(cards[0].entity_id).toBeNull();
    expect(cards[0].status).toBe("proposed");
    expect(cards[0].payload.text).toBe("Peninsula Community Foundation: They are opening a youth workforce round.");
    expect(cards[0].payload.prospect_name).toBe("Peninsula Community Foundation");
  });

  test("a prospect never becomes entity_id on a task either", () => {
    const { cards } = parseCaptureCards(
      { cards: [{ dest: "task", source_sentence: "x", ref: "c5", heard_name: null, confidence: 0.9, title: "Look into their round" }], youth_skipped: 0 },
      ctx,
    );
    expect(cards[0].dest).toBe("task");
    expect(cards[0].entity_id).toBeNull();
    expect(cards[0].entity_type).toBeNull();
  });

  test("two Kendra Sobomehins within the near-tie delta hold the card with both candidates", () => {
    const { cards } = parseCaptureCards(
      { cards: [interaction({ ref: "c1", heard_name: "Kendra", notes: "Kendra called about the gala." })], youth_skipped: 0 },
      ctx,
    );
    expect(cards[0].status).toBe("held");
    expect(cards[0].entity_id).toBeNull();
    expect(cards[0].match_candidates.map((m) => m.id)).toEqual(["k1", "k2"]);
    expect(cards[0].heard_name).toBe("Kendra");
  });

  test("the context prior wins a tie", () => {
    const withContext = { ...ctx, candidates: [{ ...kendra1, context: true }, kendra2, maria, koshland, peninsula] };
    const { cards } = parseCaptureCards(
      { cards: [interaction({ ref: "c1", heard_name: "Kendra", notes: "Kendra called." })], youth_skipped: 0 },
      withContext,
    );
    expect(cards[0].status).toBe("proposed");
    expect(cards[0].entity_id).toBe("k1");
  });

  test("low model confidence holds the card, except for the context entity", () => {
    const low = MATCH_CONFIDENCE_MIN - 0.1;
    const { cards } = parseCaptureCards({ cards: [interaction({ confidence: low })], youth_skipped: 0 }, ctx);
    expect(cards[0].status).toBe("held");
    expect(cards[0].match_candidates.map((m) => m.id)).toEqual(["m1"]);

    const withContext = { ...ctx, candidates: [kendra1, kendra2, { ...maria, context: true }, koshland, peninsula] };
    const again = parseCaptureCards({ cards: [interaction({ confidence: low })], youth_skipped: 0 }, withContext);
    expect(again.cards[0].status).toBe("proposed");
    expect(again.cards[0].entity_id).toBe("m1");
  });

  test("bad or out-of-window dates are nulled; good ones kept", () => {
    expect(validDate("2027-13-40", TODAY)).toBeNull();
    expect(validDate("2026-02-30", TODAY)).toBeNull();
    expect(validDate("2020-01-01", TODAY)).toBeNull();
    expect(validDate("2028-01-01", TODAY)).toBeNull();
    expect(validDate("Friday", TODAY)).toBeNull();
    expect(validDate("2026-10-16", TODAY)).toBe("2026-10-16");
    expect(validDate("2026-09-20", TODAY)).toBe("2026-09-20");

    const { cards } = parseCaptureCards(
      {
        cards: [
          { dest: "task", source_sentence: "x", ref: "c3", heard_name: null, confidence: 1, title: "Send the one-pager", due_date: "2027-13-40" },
          interaction({ occurred_at: "2019-01-01" }),
        ],
        youth_skipped: 0,
      },
      ctx,
    );
    expect(cards[0].payload.due_date).toBeNull();
    expect(cards[1].payload.occurred_at).toBe(TODAY);
  });

  test("a non-staff assignee is nulled; a staff ref resolves to handle and uuid", () => {
    const { cards } = parseCaptureCards(
      {
        cards: [
          { dest: "task", source_sentence: "x", ref: "c3", heard_name: null, confidence: 1, title: "Send it", assignee_ref: "s9", category: "fundraising" },
          { dest: "task", source_sentence: "x", ref: "c3", heard_name: null, confidence: 1, title: "Send it too", assignee_ref: "s1", category: "nonsense" },
        ],
        youth_skipped: 0,
      },
      ctx,
    );
    expect(cards[0].payload.assignee).toBeNull();
    expect(cards[0].payload.category).toBe("fundraising");
    expect(cards[1].payload.assignee).toEqual({ handle: "shannon", user_id: "u-shannon", name: "Shannon Example" });
    expect(cards[1].payload.category).toBe("other");
    expect(cards[1].entity_type).toBe("constituent");
  });

  test("em dashes and exclamation marks are cleaned from prose but never from a name", () => {
    const { cards } = parseCaptureCards(
      {
        cards: [
          interaction({ ref: null, heard_name: "Jean—Luc Picard", notes: "Great meeting — she loved it!" }),
          { dest: "task", source_sentence: "x", ref: null, heard_name: null, confidence: 0, title: "Send deck — today!" },
          { dest: "thought", source_sentence: "x", ref: null, heard_name: null, confidence: 0, text: "Idea — pitch it!" },
          { dest: "message_draft", source_sentence: "x", ref: "c3", heard_name: null, confidence: 1, channel: "email", subject: "Hi — again!", body: "Thanks — talk soon!" },
        ],
        youth_skipped: 0,
      },
      ctx,
    );
    expect(cards[0].heard_name).toBe("Jean—Luc Picard");
    expect(cards[0].payload.notes).toBe("Great meeting, she loved it.");
    expect(cards[1].payload.title).toBe("Send deck, today.");
    expect(cards[2].payload.text).toBe("Idea, pitch it.");
    expect(cards[3].payload.subject).toBe("Hi, again.");
    expect(cards[3].payload.body).toBe("Thanks, talk soon.");
    expect(cards[3].payload.recipient_name).toBe("Maria Chen");
  });

  test("youth_skipped passes through; negatives and junk become 0", () => {
    expect(parseCaptureCards({ cards: [], youth_skipped: 2 }, ctx).youthSkipped).toBe(2);
    expect(parseCaptureCards({ cards: [], youth_skipped: -3 }, ctx).youthSkipped).toBe(0);
    expect(parseCaptureCards({ cards: [], youth_skipped: "two" }, ctx).youthSkipped).toBe(0);
    expect(parseCaptureCards(null, ctx).youthSkipped).toBe(0);
  });

  test(`the ${MAX_CARDS + 1}th card is dropped with a reason`, () => {
    const many = Array.from({ length: MAX_CARDS + 1 }, (_, i) => ({
      dest: "thought",
      source_sentence: "x",
      ref: null,
      heard_name: null,
      confidence: 0,
      text: `Idea ${i + 1}`,
    }));
    const { cards, dropped } = parseCaptureCards({ cards: many, youth_skipped: 0 }, ctx);
    expect(cards).toHaveLength(MAX_CARDS);
    expect(dropped).toEqual([{ index: MAX_CARDS, reason: "max_cards" }]);
    expect(cards[MAX_CARDS - 1].position).toBe(MAX_CARDS);
  });

  test("unknown dest and empty cards are dropped, not staged", () => {
    const { cards, dropped } = parseCaptureCards(
      {
        cards: [
          { dest: "opportunity_update", source_sentence: "x", ref: "c3", heard_name: null, confidence: 1 },
          { dest: "task", source_sentence: "x", ref: "c3", heard_name: null, confidence: 1, title: "   " },
          { dest: "message_draft", source_sentence: "x", ref: "c3", heard_name: null, confidence: 1, body: "" },
        ],
        youth_skipped: 0,
      },
      ctx,
    );
    expect(cards).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual(["unknown_dest", "empty", "empty"]);
  });

  test("interaction kind is coerced: email becomes note, unknown becomes note", () => {
    const { cards } = parseCaptureCards(
      { cards: [interaction({ kind: "email" }), interaction({ kind: "carrier_pigeon" })], youth_skipped: 0 },
      ctx,
    );
    expect(cards[0].payload.kind).toBe("note");
    expect(cards[1].payload.kind).toBe("note");
  });

  test("entity_type is only ever constituent or partner", () => {
    const { cards } = parseCaptureCards(
      {
        cards: [
          interaction({ ref: "c4", notes: "Spoke with the foundation." }),
          interaction({ ref: "c5", notes: "Prospect chat." }),
        ],
        youth_skipped: 0,
      },
      ctx,
    );
    expect(cards[0].entity_type).toBe("partner");
    for (const c of cards) expect([null, "constituent", "partner"]).toContain(c.entity_type);
  });
});
