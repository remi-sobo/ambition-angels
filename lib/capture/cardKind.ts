/**
 * V4 Stage C (spec §8): the four card kinds Talk to log files, on top of the
 * C1 capture_cards table. PURE: no I/O, unit-tested (tests/capture-card-kinds.test.ts).
 *
 *   kind          stored as                     files to, on confirm
 *   ------------  ----------------------------  ---------------------------------
 *   conversation  dest 'interaction'            a touch on the donor (interactions)
 *                                               or partner (partner_interactions)
 *   todo          dest 'task' (or 'thought')    ops_tasks
 *   gift          dest 'thought', held,         NOTHING from Capture. The card opens
 *                 payload.card_kind = 'gift'    the existing gift drawer prefilled;
 *                                               the drawer's own save records the
 *                                               money, then the card is marked
 *                                               filed with the gift's id
 *   story         dest 'thought', held,         "Keep" files it into the Comms story
 *                 payload.card_kind = 'story'   bank (stories + story_subjects, V4
 *                                               Stage D), held until consent is on
 *                                               file; without Comms access the card
 *                                               itself stays the held draft
 *
 * Why 'thought' + held for the two new kinds: capture_cards.dest is
 * check-constrained to the four C1 values, and a migration is out of scope for
 * this stage (the proposed schema is in the Stage C report). A held card is
 * skipped by Confirm all and refused by the C3 confirm path, so a gift or a
 * story can never be filed as a parking-lot task by accident; confirm.ts and
 * edit.ts also refuse them by kind, not only by status.
 */

import { cleanVoiceText } from "@/lib/ai/voice";

export type CardKind = "conversation" | "todo" | "note" | "draft" | "gift" | "story";

/** The model-side destinations V4 adds to the C1 four. */
export const V4_KINDS = ["gift", "story"] as const;
export type V4Kind = (typeof V4_KINDS)[number];

type CardLike = { dest: string; payload: Record<string, unknown> | null | undefined };

export function cardKindOf(card: CardLike): CardKind {
  const k = card.payload?.card_kind;
  if (k === "gift" || k === "story") return k;
  if (card.dest === "interaction") return "conversation";
  if (card.dest === "task") return "todo";
  if (card.dest === "thought") return "note";
  return "draft";
}

/** Gift and story cards are never filed by a Capture applier. */
export function isHeldKind(card: CardLike): boolean {
  const k = cardKindOf(card);
  return k === "gift" || k === "story";
}

export const KIND_LABEL: Record<CardKind, string> = {
  conversation: "Donor conversation",
  todo: "To-do",
  note: "Note for later",
  draft: "Message draft",
  gift: "Gift or pledge",
  story: "Story",
};

// ── Uncertain fields ────────────────────────────────────────────────────────

/** Words that mean the speaker was not sure ("probably December"). */
export const HEDGE_RE = /\b(probably|maybe|about|around|roughly|i think|might|or so|ish)\b/i;

/** The fields each kind may mark uncertain. Anything else the model names is dropped. */
export const UNCERTAIN_FIELDS: Record<CardKind, readonly string[]> = {
  conversation: ["who", "kind", "occurred_at", "notes"],
  todo: ["who", "title", "assignee", "due_date"],
  note: ["text"],
  draft: ["who", "body"],
  gift: ["who", "amount", "gift_type", "date"],
  story: ["about", "text", "identifiable"],
};

export function uncertainFields(kind: CardKind, raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ok = new Set(UNCERTAIN_FIELDS[kind]);
  return Array.from(new Set(raw.filter((f): f is string => typeof f === "string" && ok.has(f))));
}

// ── Gift or pledge ──────────────────────────────────────────────────────────

export const MAX_GIFT_AMOUNT = 10_000_000;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const prose = (s: string, max: number) =>
  cleanVoiceText(s).replace(/!+/g, ".").replace(/\s+/g, " ").trim().slice(0, max);

/** A positive dollar amount (number or "15,000"), else null. Never invented. */
export function parseGiftAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_GIFT_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

export type GiftFields = {
  card_kind: "gift";
  gift_type: "gift" | "pledge";
  amount: number | null;
  amount_heard: string | null;
  /** A received gift's date: today or earlier (the gift drawer refuses later). */
  gift_date: string | null;
  /** A pledge's expected month or date, as said. */
  expected: string | null;
  notes: string | null;
  uncertain: string[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function buildGiftFields(r: Record<string, unknown>, opts: { todayIso: string; sourceSentence: string | null }): GiftFields {
  const type = r.gift_type === "pledge" ? "pledge" : "gift";
  const amount = parseGiftAmount(r.amount);
  const heard = str(r.amount_heard)?.slice(0, 60) ?? null;
  const dateRaw = str(r.gift_date);
  const giftDate = type === "gift" && dateRaw && ISO.test(dateRaw) && dateRaw <= opts.todayIso ? dateRaw : null;
  const expected = type === "pledge" ? str(r.expected)?.slice(0, 60) ?? null : null;
  const uncertain = new Set(uncertainFields("gift", r.uncertain));
  // An amount is always checked by a person when it is missing, was a hedge,
  // or the words heard do not plainly contain the digits.
  const hedged = HEDGE_RE.test(opts.sourceSentence ?? "") || HEDGE_RE.test(heard ?? "");
  if (amount === null || hedged) uncertain.add("amount");
  if (heard && amount !== null && !heard.replace(/[,$\s]/g, "").includes(String(Math.trunc(amount)))) uncertain.add("amount");
  if (type === "pledge" && expected && HEDGE_RE.test(`${expected} ${opts.sourceSentence ?? ""}`)) uncertain.add("date");
  const notes = str(r.notes) ? prose(str(r.notes)!, 500) : null;
  return {
    card_kind: "gift",
    gift_type: type,
    amount,
    amount_heard: heard,
    gift_date: giftDate,
    expected,
    notes,
    uncertain: Array.from(uncertain),
  };
}

// ── Story, and the consent hold ─────────────────────────────────────────────

/**
 * Is there anywhere to record a participant's consent? Yes since V4 Stage D:
 * the story bank (stories, story_subjects, story_consents) landed on main.
 * A capture card still never carries consent itself; consent is recorded on
 * the story in Comms, and the consent gate (lib/comms/story-gate.ts) decides
 * whether a story may be used. A card's hold stays "consent" for an
 * identifiable story because consentOnFile is never true for a card.
 */
export const CONSENT_STORAGE_EXISTS = true;

/** "Jaylen Moore" -> "Jaylen M." ; "Jaylen" -> "Jaylen". Never a full surname. */
export function shortName(name: string | null | undefined): string | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0].replace(/[^A-Za-z\u00C0-\u024F'-]/g, "");
  if (!first) return null;
  if (parts.length === 1) return first;
  const initial = parts[parts.length - 1].replace(/[^A-Za-z\u00C0-\u024F]/g, "").charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

const CAPITALIZED = /(?:^|[^.!?]\s)([A-Z][a-z]{1,})/g;
const NOT_NAMES = new Set([
  "I", "The", "A", "An", "She", "He", "They", "We", "Our", "Her", "His", "Their", "It", "This", "That",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
]);

/** Name-like words after the first word of a sentence (a cheap, fail-closed check). */
export function nameLikeWords(text: string): string[] {
  return Array.from(text.matchAll(CAPITALIZED))
    .map((m) => m[1])
    .filter((w) => !NOT_NAMES.has(w));
}

/**
 * Fail closed: a story is identifiable unless the model said it is not AND no
 * participant is named AND no name-like word appears in it.
 */
export function storyIdentifiable(input: { modelSays: unknown; about: string | null; text: string }): boolean {
  if (input.modelSays !== false) return true;
  if (input.about) return true;
  return nameLikeWords(input.text).length > 0;
}

export type StoryFields = {
  card_kind: "story";
  title: string | null;
  text: string;
  /** First name and last initial only. */
  about: string | null;
  identifiable: boolean;
  consent: "needed" | "not_needed";
  uncertain: string[];
};

export function buildStoryFields(r: Record<string, unknown>, opts: { sourceSentence: string | null }): StoryFields | null {
  const text = prose(str(r.text) ?? str(r.notes) ?? opts.sourceSentence ?? "", 2000);
  if (!text) return null;
  const about = shortName(str(r.about));
  const identifiable = storyIdentifiable({ modelSays: r.identifiable, about, text });
  const title = str(r.title) ? prose(str(r.title)!, 120) : null;
  return {
    card_kind: "story",
    title,
    text,
    about,
    identifiable,
    consent: identifiable ? "needed" : "not_needed",
    uncertain: uncertainFields("story", r.uncertain),
  };
}

export type StoryHold = "consent" | null;

/**
 * Why a story may not be used yet. An identifiable story is held until consent
 * is on file; with no consent storage that is always.
 */
export function storyHold(story: { identifiable?: unknown; consent?: unknown }, consentOnFile = false): StoryHold {
  const identifiable = story.identifiable !== false;
  if (!identifiable) return null;
  return CONSENT_STORAGE_EXISTS && consentOnFile ? null : "consent";
}

/** Can this story be used in anything that leaves BloomOS? */
export function storyUsable(story: { identifiable?: unknown; consent?: unknown }, consentOnFile = false): boolean {
  return storyHold(story, consentOnFile) === null;
}

/** What "filed" means on a gift or story card (payload.filed). */
export type FiledElsewhere =
  | { table: "gifts"; id: string; amount: number | null }
  | { table: "pledges"; manual: true }
  | { table: "capture_cards"; kept: true }
  | { table: "stories"; id: string };

export function filedElsewhere(payload: Record<string, unknown> | null | undefined): FiledElsewhere | null {
  const f = payload?.filed as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  if (f.table === "gifts" && typeof f.id === "string") return { table: "gifts", id: f.id, amount: typeof f.amount === "number" ? f.amount : null };
  if (f.table === "pledges" && f.manual === true) return { table: "pledges", manual: true };
  if (f.table === "capture_cards" && f.kept === true) return { table: "capture_cards", kept: true };
  if (f.table === "stories" && typeof f.id === "string") return { table: "stories", id: f.id };
  return null;
}
