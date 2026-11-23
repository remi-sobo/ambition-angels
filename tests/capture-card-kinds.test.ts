import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONSENT_STORAGE_EXISTS,
  buildGiftFields,
  buildStoryFields,
  cardKindOf,
  filedElsewhere,
  isHeldKind,
  parseGiftAmount,
  shortName,
  storyHold,
  storyIdentifiable,
  storyUsable,
  uncertainFields,
} from "@/lib/capture/cardKind";
import { redactTranscript } from "@/lib/capture/redact";
import { parseCaptureCards } from "@/lib/capture/validate";
import { confirmCard, confirmAll } from "@/lib/capture/confirm";
import { editCard } from "@/lib/capture/edit";
import type { Candidate } from "@/lib/capture/types";

// V4 Stage C (spec §8): the four card kinds, the consent hold on stories, and
// the redaction boundary in front of the model.

const TODAY = "2026-11-21";
const dana: Candidate = {
  ref: "c1", kind: "constituent", id: "d1", name: "Dana Whitfield", orgName: null, meta: "person", sim: 1, spans: ["Dana"], context: false,
};
const northgate: Candidate = {
  ref: "c2", kind: "partner", id: "p1", name: "Northgate Credit Union", orgName: null, meta: "partner", sim: 0.95, spans: ["Northgate"], context: false,
};
const ctx = { candidates: [dana, northgate], staff: [{ ref: "s1", name: "Remi Example", handle: "remi", userId: "u1" }], todayIso: TODAY };

const parse = (cards: Record<string, unknown>[]) => parseCaptureCards({ cards, youth_skipped: 0 }, ctx).cards;

describe("card kinds", () => {
  test("each kind maps from what is stored", () => {
    expect(cardKindOf({ dest: "interaction", payload: {} })).toBe("conversation");
    expect(cardKindOf({ dest: "task", payload: {} })).toBe("todo");
    expect(cardKindOf({ dest: "thought", payload: {} })).toBe("note");
    expect(cardKindOf({ dest: "message_draft", payload: {} })).toBe("draft");
    expect(cardKindOf({ dest: "thought", payload: { card_kind: "gift" } })).toBe("gift");
    expect(cardKindOf({ dest: "thought", payload: { card_kind: "story" } })).toBe("story");
    expect(isHeldKind({ dest: "thought", payload: { card_kind: "gift" } })).toBe(true);
    expect(isHeldKind({ dest: "task", payload: {} })).toBe(false);
  });

  test("one note can produce all four kinds, each AI-drafted", () => {
    const cards = parse([
      { dest: "interaction", source_sentence: "Coffee with Dana.", ref: "c1", heard_name: null, confidence: 0.95, kind: "meeting", notes: "Wants to see the spring cohort first." },
      { dest: "task", source_sentence: "Send Dana the dates by Friday.", ref: "c1", heard_name: null, confidence: 0.9, title: "Send Dana the spring site-visit dates", due_date: "2026-11-27" },
      { dest: "gift", source_sentence: "Put her down for fifteen thousand, probably December.", ref: "c1", heard_name: null, confidence: 0.9, gift_type: "pledge", amount: 15000, amount_heard: "fifteen thousand", expected: "December" },
      { dest: "story", source_sentence: "Her tour guide Jaylen Moore started a robotics club.", ref: null, heard_name: null, confidence: 0, text: "The student tour guide went on to start a robotics club.", about: "Jaylen Moore", identifiable: true },
    ]);
    expect(cards.map((c) => cardKindOf(c))).toEqual(["conversation", "todo", "gift", "story"]);
    for (const c of cards) expect(c.payload.ai_drafted).toBe(true);
    // Stored on the C1 destinations only (no migration in this stage).
    expect(cards.map((c) => c.dest)).toEqual(["interaction", "task", "thought", "thought"]);
  });

  test("a gift card is held, keeps the donor, and never invents an amount", () => {
    const [g] = parse([{ dest: "gift", source_sentence: "Dana gave a gift today.", ref: "c1", heard_name: null, confidence: 0.95, gift_type: "gift" }]);
    expect(g.status).toBe("held");
    expect(g.entity_id).toBe("d1");
    expect(g.payload.amount).toBeNull();
    expect(g.payload.uncertain).toContain("amount");
  });

  test("a hedged amount is marked uncertain; a plain one is not", () => {
    const hedged = buildGiftFields({ amount: 15000, amount_heard: "fifteen thousand", gift_type: "pledge", expected: "probably December" }, { todayIso: TODAY, sourceSentence: "probably fifteen thousand" });
    expect(hedged.uncertain).toEqual(expect.arrayContaining(["amount", "date"]));
    const plain = buildGiftFields({ amount: 500, amount_heard: "500", gift_type: "gift", gift_date: TODAY }, { todayIso: TODAY, sourceSentence: "She gave 500 today." });
    expect(plain.uncertain).not.toContain("amount");
    expect(plain.gift_date).toBe(TODAY);
  });

  test("a gift date in the future is dropped (the gift drawer refuses it too)", () => {
    expect(buildGiftFields({ amount: 10, gift_type: "gift", gift_date: "2026-12-01" }, { todayIso: TODAY, sourceSentence: null }).gift_date).toBeNull();
  });

  test("amounts: positive, capped, strings with commas", () => {
    expect(parseGiftAmount("15,000")).toBe(15000);
    expect(parseGiftAmount(0)).toBeNull();
    expect(parseGiftAmount(-5)).toBeNull();
    expect(parseGiftAmount(50_000_000)).toBeNull();
    expect(parseGiftAmount("lots")).toBeNull();
  });

  test("a partner match is not a donor for a gift", () => {
    const [g] = parse([{ dest: "gift", source_sentence: "Northgate gave 1000.", ref: "c2", heard_name: null, confidence: 0.95, gift_type: "gift", amount: 1000 }]);
    expect(g.entity_type).toBeNull();
    expect(g.payload.uncertain).toContain("who");
  });

  test("a story never carries a record match and stores first name and last initial only", () => {
    const [s] = parse([{ dest: "story", source_sentence: "x", ref: "c1", heard_name: "Dana", confidence: 0.9, text: "A student led the tour.", about: "Jaylen Moore", identifiable: true }]);
    expect(s.entity_id).toBeNull();
    expect(s.match_candidates).toEqual([]);
    expect(s.heard_name).toBeNull();
    expect(s.payload.about).toBe("Jaylen M.");
    expect(JSON.stringify(s.payload)).not.toContain("Moore\"");
  });

  test("uncertain fields are limited to the kind's fields", () => {
    expect(uncertainFields("gift", ["amount", "title", 3, "who"])).toEqual(["amount", "who"]);
    expect(uncertainFields("story", "amount")).toEqual([]);
  });

  test("shortName never keeps a surname", () => {
    expect(shortName("Jaylen Moore")).toBe("Jaylen M.");
    expect(shortName("Jaylen")).toBe("Jaylen");
    expect(shortName("  ")).toBeNull();
  });
});

describe("the consent hold", () => {
  // V4 Stage D changed this on purpose: the story bank (and story_consents)
  // landed, so consent storage exists. A card itself never has consent on
  // file, so an identifiable story on a card is still always held; only a
  // consent recorded on the story in Comms lifts it (lib/comms/story-gate.ts).
  test("consent storage exists since Stage D; a card is held until consent is on file", () => {
    expect(CONSENT_STORAGE_EXISTS).toBe(true);
    expect(storyHold({ identifiable: true })).toBe("consent");
    expect(storyUsable({ identifiable: true })).toBe(false);
    expect(storyHold({ identifiable: true }, true)).toBeNull();
  });

  test("only an explicit false lifts the hold; anything else holds", () => {
    expect(storyHold({ identifiable: false })).toBeNull();
    expect(storyHold({})).toBe("consent");
    expect(storyHold({ identifiable: null })).toBe("consent");
  });

  test("identifiable fails closed: a named subject or a name-like word holds it", () => {
    expect(storyIdentifiable({ modelSays: false, about: null, text: "the whole group cheered at the showcase." })).toBe(false);
    expect(storyIdentifiable({ modelSays: false, about: "Jaylen M.", text: "they cheered." })).toBe(true);
    expect(storyIdentifiable({ modelSays: false, about: null, text: "At the showcase, Jaylen asked for a job." })).toBe(true);
    expect(storyIdentifiable({ modelSays: undefined, about: null, text: "the group cheered." })).toBe(true);
  });

  test("a parsed identifiable story is held and needs consent", () => {
    const s = buildStoryFields({ text: "Jaylen practiced with two staff.", identifiable: false }, { sourceSentence: null });
    expect(s?.identifiable).toBe(true);
    expect(s?.consent).toBe("needed");
  });

  test("a kept story records where it lives, and nothing else", () => {
    expect(filedElsewhere({ filed: { table: "capture_cards", kept: true } })).toEqual({ table: "capture_cards", kept: true });
    expect(filedElsewhere({ filed: { table: "gifts", id: "g1", amount: 25 } })).toEqual({ table: "gifts", id: "g1", amount: 25 });
    expect(filedElsewhere({ filed: { table: "ops_tasks", id: "x" } })).toBeNull();
  });
});

describe("the redaction boundary", () => {
  test("emails, phones, SSNs and long numbers are masked; amounts and dates stay", () => {
    const r = redactTranscript(
      "Call Dana at (415) 555-0134 or dana@example.org. Her account 123456789 and SSN 123-45-6789. She pledged $15,000 on 2026-12-01, about 25000 total.",
    );
    expect(r.text).not.toMatch(/555-0134|example\.org|123456789|123-45-6789/);
    expect(r.text).toContain("$15,000");
    expect(r.text).toContain("2026-12-01");
    expect(r.text).toContain("25000");
    expect(r.counts).toEqual({ email: 1, phone: 1, ssn: 1, number: 1 });
  });
});

// ── nothing files a gift or story through an applier ────────────────────────

type Row = Record<string, unknown>;
function fakeSupabase(tables: Record<string, Row[]>) {
  const writes: { table: string; op: string }[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let op = "select";
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      in: () => q,
      is: () => q,
      order: () => q,
      update: () => ((op = "update"), writes.push({ table, op }), q),
      insert: () => ((op = "insert"), writes.push({ table, op }), q),
      delete: () => ((op = "delete"), writes.push({ table, op }), q),
      maybeSingle: async () => ({ data: op === "select" ? (tables[table] ?? []).find((r) => filters.every(([k, v]) => r[k] === v)) ?? null : null }),
      then: (res: (v: { data: Row[]; count: number }) => void) => res({ data: (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)), count: 0 }),
    };
    return q;
  };
  return { client: { from } as never, writes };
}

const giftCard = { id: "card-g", capture_id: "cap", dest: "thought", status: "held", payload: { card_kind: "gift", amount: 15000 }, position: 1, entity_type: "constituent", entity_id: "d1", match_candidates: [] };
const storyCard = { id: "card-s", capture_id: "cap", dest: "thought", status: "proposed", payload: { card_kind: "story", identifiable: true }, position: 2, entity_type: null, entity_id: null, match_candidates: [] };
const capture = { id: "cap", status: "ready" };

function deps(tables: Record<string, Row[]>) {
  const fake = fakeSupabase(tables);
  return {
    fake,
    d: {
      supabase: fake.client,
      ctx: { orgId: "o1", userId: "u1", handle: "remi", audit: async () => {} },
      hasPermission: async () => true,
    },
  };
}

describe("confirm refuses gift and story cards (no applier, no money)", () => {
  test("confirming a gift card is a 409 and writes nothing", async () => {
    const { d, fake } = deps({ capture_cards: [giftCard], captures: [capture] });
    const r = await confirmCard(d, "card-g");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/gift form/);
    expect(fake.writes).toEqual([]);
  });

  test("even a story card that somehow reads 'proposed' is refused", async () => {
    const { d, fake } = deps({ capture_cards: [storyCard], captures: [capture] });
    const r = await confirmCard(d, "card-s");
    expect(r.ok).toBe(false);
    expect(fake.writes).toEqual([]);
  });

  test("Confirm all skips them", async () => {
    const { d, fake } = deps({ capture_cards: [giftCard, { ...storyCard, status: "held" }], captures: [capture] });
    const r = await confirmAll(d, "cap");
    expect(r.ok && r.results).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  test("edit cannot turn a gift card into a fileable task", async () => {
    const { d, fake } = deps({ capture_cards: [giftCard] });
    const r = await editCard(d, "card-g", { dest: "task", title: "x" });
    expect(r.ok).toBe(false);
    expect(fake.writes).toEqual([]);
  });
});

describe("source guards", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  test("the parse route redacts before matching and before the model", () => {
    const src = read("app/api/admin/capture/route.ts");
    const redact = src.indexOf("redactTranscript(transcript)");
    expect(redact).toBeGreaterThan(0);
    expect(src.indexOf("extractNameSpans(")).toBeGreaterThan(redact);
    expect(src.indexOf("generateStructured(")).toBeGreaterThan(redact);
    expect(src).toMatch(/buildCapturePrompt\(\{ transcript: redacted\.text/);
    expect(src).not.toMatch(/buildCapturePrompt\(\{ transcript,/);
  });

  test("the parse route still respects the per-user and per-org limits", () => {
    const src = read("app/api/admin/capture/route.ts");
    expect(src).toMatch(/CAPTURE_RATE_LIMIT_PER_HOUR/);
    expect(src).toMatch(/orgOverAICap\(/);
    expect(src.indexOf("orgOverAICap(")).toBeLessThan(src.indexOf("generateStructured("));
  });

  test("capture writes stay behind ai.capture", () => {
    for (const p of ["app/api/admin/capture/route.ts", "app/api/admin/capture/cards/[id]/route.ts", "app/api/admin/capture/[id]/confirm-all/route.ts"]) {
      const src = read(p);
      const gate = src.indexOf('requireEntitlement("ai.capture")');
      expect(gate, p).toBeGreaterThan(0);
      expect(gate, p).toBeLessThan(src.indexOf("createServerSupabase()") === -1 ? Infinity : src.indexOf("createServerSupabase()"));
    }
  });

  test("recording a gift needs fundraising.write and only reads gifts", () => {
    const v4 = read("lib/capture/v4Cards.ts");
    expect(v4).toMatch(/hasPermission\("fundraising\.write"\)/);
    expect(v4).not.toMatch(/from\(\s*["']gifts["']\s*\)/);
    const link = read("lib/capture/apply/giftLink.ts");
    expect(link).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  test("the gift card opens the gift drawer and never posts money itself", () => {
    const stack = read("app/admin/capture/_components/ConfirmStack.tsx");
    const giftCard = read("app/admin/capture/_components/GiftCard.tsx");
    expect(stack + giftCard).toMatch(/<GiftDrawer/);
    expect(stack + giftCard).not.toMatch(/\/api\/admin\/gifts/);
    expect(stack + giftCard).not.toMatch(/optimistic/);
  });

  test("the gift drawer never saves optimistically", () => {
    const src = read("app/admin/fundraising/_components/gift/GiftDrawer.tsx");
    expect(src).not.toMatch(/optimistic:\s*\(/);
  });
});
