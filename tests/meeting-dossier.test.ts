import { describe, expect, test } from "vitest";
import {
  shapeInteraction,
  summarizeGiving,
  toAgendaEntities,
} from "@/lib/meetings/dossier";
import type { MatchedEntity } from "@/lib/meetings/types";

// ── summarizeGiving ──────────────────────────────────────────────────────────

describe("summarizeGiving", () => {
  test("no gifts → zeroed summary, null dates", () => {
    expect(summarizeGiving([])).toEqual({
      lifetime_total: 0,
      gift_count: 0,
      first_gift_date: null,
      last_gift_date: null,
      largest_gift: 0,
    });
  });

  test("rolls up total, count, largest, and the date range regardless of input order", () => {
    const s = summarizeGiving([
      { amount: 250, gift_date: "2025-03-01" },
      { amount: 1000, gift_date: "2023-11-15" },
      { amount: 100, gift_date: "2026-01-20" },
    ]);
    expect(s.gift_count).toBe(3);
    expect(s.lifetime_total).toBe(1350);
    expect(s.largest_gift).toBe(1000);
    expect(s.first_gift_date).toBe("2023-11-15");
    expect(s.last_gift_date).toBe("2026-01-20");
  });

  test("coerces string amounts and rounds to cents", () => {
    const s = summarizeGiving([
      { amount: "10.005" as unknown as number, gift_date: "2025-01-01" },
      { amount: "5.004" as unknown as number, gift_date: "2025-01-02" },
    ]);
    expect(s.lifetime_total).toBe(15.01);
  });
});

// ── toAgendaEntities (first-meeting vs follow-up) ────────────────────────────

describe("toAgendaEntities", () => {
  const cons: MatchedEntity = { type: "constituent", id: "c1", name: "Ada", matchedEmail: "ada@x.org" };
  const part: MatchedEntity = { type: "partner", id: "p1", name: "Lincoln HS", matchedEmail: null };

  test("zero prior touchpoints → first meeting", () => {
    const [e] = toAgendaEntities([cons], new Map(), new Map());
    expect(e).toMatchObject({ type: "constituent", id: "c1", prior_touchpoints: 0, is_first_meeting: true });
  });

  test("prior touchpoints → follow-up, count carried through", () => {
    const [e] = toAgendaEntities([cons], new Map([["c1", 4]]), new Map());
    expect(e.prior_touchpoints).toBe(4);
    expect(e.is_first_meeting).toBe(false);
  });

  test("constituent and partner counts are read from their own maps, not crossed", () => {
    // Same id string in both maps must not leak across the type boundary.
    const out = toAgendaEntities(
      [cons, part],
      new Map([["c1", 2]]),
      new Map([["p1", 0]]),
    );
    expect(out.find((e) => e.type === "constituent")).toMatchObject({ prior_touchpoints: 2, is_first_meeting: false });
    expect(out.find((e) => e.type === "partner")).toMatchObject({ prior_touchpoints: 0, is_first_meeting: true });
  });
});

// ── shapeInteraction (private redaction) ─────────────────────────────────────

describe("shapeInteraction", () => {
  test("public interaction keeps subject and preview (body_preview preferred over notes)", () => {
    const s = shapeInteraction({
      kind: "email",
      occurred_at: "2026-02-01T10:00:00Z",
      direction: "outbound",
      subject: "Thanks for lunch",
      body_preview: "Great to catch up about the gala…",
      notes: "fallback",
      is_private: false,
    });
    expect(s.subject).toBe("Thanks for lunch");
    expect(s.preview).toBe("Great to catch up about the gala…");
    expect(s.is_private).toBe(false);
  });

  test("falls back to notes when body_preview is absent", () => {
    const s = shapeInteraction({ kind: "note", occurred_at: "2026-02-01T10:00:00Z", notes: "left a voicemail" });
    expect(s.preview).toBe("left a voicemail");
  });

  test("private interaction is redacted — subject masked, body dropped, fact retained", () => {
    const s = shapeInteraction({
      kind: "note",
      occurred_at: "2026-02-01T10:00:00Z",
      subject: "Sensitive health note",
      body_preview: "should never surface",
      is_private: true,
    });
    expect(s.subject).toBe("(private)");
    expect(s.preview).toBeNull();
    expect(s.is_private).toBe(true);
    expect(s.kind).toBe("note");
  });

  test("caps a long preview at 280 chars", () => {
    const long = "x".repeat(500);
    const s = shapeInteraction({ kind: "email", occurred_at: "2026-02-01T10:00:00Z", body_preview: long });
    expect(s.preview).toHaveLength(280);
  });
});
