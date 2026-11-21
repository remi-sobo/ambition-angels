/**
 * V4 Stage C (spec §8): the actions on the two card kinds Capture never files
 * through an applier, gift and story (lib/capture/cardKind.ts).
 *
 *   recordGiftFiled  after the gift drawer saved a gift: verify the gift id in
 *                    the caller's org, then mark the card filed with it. The
 *                    money itself was written by /api/admin/gifts, never here.
 *   markPledgeAdded  the person added the pledge on the donor's record; the
 *                    card is marked done (Capture does not write pledges).
 *   keepStory        keep the story as a held draft: the card row IS the draft
 *                    until a story bank exists. Its consent hold stays on it.
 *   editStory        change the story's words, subject or identifiable flag.
 *                    The identifiable check fails closed (storyIdentifiable).
 *
 * Writes only capture_cards and captures, through the session client.
 */

import { buildStoryFields, cardKindOf, filedElsewhere } from "./cardKind";
import { findGift } from "./apply/giftLink";
import { CARD_COLUMNS, type CardRow } from "./apply/shared";
import { settleCapture, type ActionDeps, type ActionResult } from "./confirm";

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const fail = (status: number, error: string, card?: CardRow): ActionResult => ({ ok: false, status, error, card });

async function load(deps: ActionDeps, cardId: string): Promise<CardRow | null> {
  const { data } = await deps.supabase.from("capture_cards").select(CARD_COLUMNS).eq("id", cardId).maybeSingle();
  return (data as CardRow | null) ?? null;
}

async function markFiled(deps: ActionDeps, card: CardRow, filed: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<ActionResult> {
  const now = (deps.now?.() ?? new Date()).toISOString();
  const { data } = await deps.supabase
    .from("capture_cards")
    .update({
      status: "confirmed",
      decided_by: deps.ctx.userId,
      decided_at: now,
      payload: { ...card.payload, ...extra, filed },
    })
    .eq("id", card.id)
    .eq("status", "held")
    .select(CARD_COLUMNS)
    .maybeSingle();
  if (!data) return fail(409, "This card changed while you were saving it.");
  await settleCapture(deps.supabase, card.capture_id);
  return { ok: true, card: data as CardRow };
}

export async function recordGiftFiled(deps: ActionDeps, cardId: string, giftId: unknown): Promise<ActionResult> {
  if (!isUuid(giftId)) return fail(400, "gift_id is required");
  const card = await load(deps, cardId);
  if (!card) return fail(404, "Not found");
  if (cardKindOf(card) !== "gift") return fail(409, "Only a gift card can be marked recorded.", card);
  const already = filedElsewhere(card.payload);
  if (card.status === "confirmed" && already?.table === "gifts" && already.id === giftId) return { ok: true, card };
  if (card.status !== "held") return fail(409, "This card was already handled.", card);
  if (!(await deps.hasPermission("fundraising.write"))) return fail(403, "You don't have permission to record gifts.", card);
  const gift = await findGift(deps.supabase, deps.ctx.orgId, giftId);
  if (!gift) return fail(404, "That gift was not found in this organization.", card);
  return markFiled(deps, card, { table: "gifts", id: gift.id, amount: gift.amount });
}

export async function markPledgeAdded(deps: ActionDeps, cardId: string): Promise<ActionResult> {
  const card = await load(deps, cardId);
  if (!card) return fail(404, "Not found");
  if (cardKindOf(card) !== "gift" || card.payload.gift_type !== "pledge") return fail(409, "Only a pledge card can be marked added.", card);
  if (card.status === "confirmed" && filedElsewhere(card.payload)?.table === "pledges") return { ok: true, card };
  if (card.status !== "held") return fail(409, "This card was already handled.", card);
  return markFiled(deps, card, { table: "pledges", manual: true });
}

export async function keepStory(deps: ActionDeps, cardId: string): Promise<ActionResult> {
  const card = await load(deps, cardId);
  if (!card) return fail(404, "Not found");
  if (cardKindOf(card) !== "story") return fail(409, "Only a story card can be kept.", card);
  if (card.status === "confirmed" && filedElsewhere(card.payload)?.table === "capture_cards") return { ok: true, card };
  if (card.status !== "held") return fail(409, "This card was already handled.", card);
  // The hold travels with the draft: consent stays "needed" for an
  // identifiable story, and nothing can mark it otherwise from here.
  return markFiled(deps, card, { table: "capture_cards", kept: true });
}

const STORY_KEYS = new Set(["text", "title", "about", "identifiable"]);

export async function editStory(deps: ActionDeps, card: CardRow, patch: Record<string, unknown>): Promise<ActionResult> {
  for (const k of Object.keys(patch)) if (!STORY_KEYS.has(k)) return fail(400, `A story card can't change ${k}.`);
  if (card.status !== "held") return fail(409, "Only a story that has not been kept can be edited.", card);
  const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);
  const fields = buildStoryFields(
    {
      text: has("text") ? patch.text : card.payload.text,
      title: has("title") ? patch.title : card.payload.title,
      about: has("about") ? patch.about : card.payload.about,
      identifiable: has("identifiable") ? patch.identifiable : card.payload.identifiable,
    },
    { sourceSentence: typeof card.payload.source_sentence === "string" ? card.payload.source_sentence : null },
  );
  if (!fields) return fail(400, "A story needs some words.");
  const { data } = await deps.supabase
    .from("capture_cards")
    .update({ payload: { ...card.payload, ...fields, edited: true } })
    .eq("id", card.id)
    .eq("status", "held")
    .select(CARD_COLUMNS)
    .maybeSingle();
  if (!data) return fail(409, "This card changed while you were editing it.");
  return { ok: true, card: data as CardRow };
}
