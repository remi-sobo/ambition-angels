/**
 * Fix after confirm (specs/bloomos-capture.md, C6). Session client only.
 *
 * The person who recorded a note can revise, move, or remove what it filed to
 * a donor or partner record, any time after the 10-minute undo. Keyed by the
 * card, so the creator-only capture_cards policies are the "who" rule: a card
 * someone else recorded is a 404. The destination's own write permission is
 * pre-checked and RLS enforces it again on the write.
 *
 *   revise  kind, date, notes on the filed row; stamps edited_at / edited_by.
 *   move    to another record of the SAME type (person to person, partner to
 *           partner), re-verified against the caller's org; the card's entity
 *           follows so the applier's provenance lookup still finds the row.
 *   remove  deletes the row; the card becomes discarded with payload.removed.
 *
 * Revise and move refresh payload.applied_snapshot, so undo inside its window
 * still works after a fix. This file writes only capture_cards; the
 * destination SQL lives in lib/capture/apply/* (tests/capture-fence.test.ts).
 */

import {
  ApplyError,
  CARD_COLUMNS,
  applierForTable,
  reviseUpdate,
  type Applier,
  type CardRow,
  type FixOps,
} from "./apply";
import type { ActionDeps } from "./confirm";
import { verifyEntity } from "./edit";

export type FixResult =
  | { ok: true; card: CardRow; removed?: boolean }
  | { ok: false; status: number; error: string; card?: CardRow };

const fail = (status: number, error: string, card?: CardRow): FixResult => ({ ok: false, status, error, card });

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function fromError(e: unknown): FixResult {
  if (e instanceof ApplyError) return fail(e.status, e.message);
  console.error("[capture/fix] unexpected:", e instanceof Error ? e.message : e);
  return fail(500, "Something went wrong fixing this note.");
}

type Fixable = { card: CardRow; applier: Applier; fix: FixOps };

/** Load the caller's own filed card and the fix ops for where it went. */
async function loadFixable(deps: ActionDeps, cardId: string): Promise<Fixable | FixResult> {
  const { data } = await deps.supabase.from("capture_cards").select(CARD_COLUMNS).eq("id", cardId).maybeSingle();
  const card = (data as CardRow | null) ?? null;
  if (!card) return fail(404, "Not found");
  if (card.status !== "confirmed" || !card.applied_id || !card.applied_table) {
    return fail(409, "Only a filed note can be fixed.", card);
  }
  let applier: Applier;
  try {
    applier = applierForTable(card.applied_table);
  } catch (e) {
    return fromError(e);
  }
  if (!applier.fix) return fail(409, "Fix this one where it was filed (Ops or Reed).", card);
  if (!(await deps.hasPermission(applier.permission))) return fail(403, applier.denied, card);
  return { card, applier, fix: applier.fix };
}

const isFixable = (v: Fixable | FixResult): v is Fixable => "fix" in v;

async function saveCard(deps: ActionDeps, card: CardRow, fields: Partial<CardRow>): Promise<CardRow> {
  const { data } = await deps.supabase
    .from("capture_cards")
    .update(fields)
    .eq("id", card.id)
    .eq("status", "confirmed")
    .select(CARD_COLUMNS)
    .maybeSingle();
  return (data as CardRow | null) ?? { ...card, ...fields };
}

const nowIso = (deps: ActionDeps) => (deps.now?.() ?? new Date()).toISOString();

export async function reviseFiled(deps: ActionDeps, cardId: string, patch: unknown): Promise<FixResult> {
  let update: Record<string, unknown>;
  try {
    update = reviseUpdate(patch, deps.now?.() ?? new Date());
  } catch (e) {
    return fromError(e);
  }
  const loaded = await loadFixable(deps, cardId);
  if (!isFixable(loaded)) return loaded;
  const { card, fix } = loaded;

  let snapshot: Record<string, unknown>;
  try {
    snapshot = await fix.revise(deps.supabase, deps.ctx, card, update, nowIso(deps));
  } catch (e) {
    return fromError(e);
  }
  return { ok: true, card: await saveCard(deps, card, { payload: { ...card.payload, applied_snapshot: snapshot } }) };
}

export async function moveFiled(deps: ActionDeps, cardId: string, entity: unknown): Promise<FixResult> {
  const e = entity as { type?: unknown; id?: unknown } | null;
  if (!e || (e.type !== "constituent" && e.type !== "partner") || !isUuid(e.id)) {
    return fail(400, "entity must be { type: 'constituent' | 'partner', id }");
  }
  const loaded = await loadFixable(deps, cardId);
  if (!isFixable(loaded)) return loaded;
  const { card, fix } = loaded;

  if (e.type !== fix.entityType) {
    return fail(
      400,
      fix.entityType === "constituent"
        ? "Move it to another person. To put it on a partner instead, remove it and log it there."
        : "Move it to another partner. To put it on a person instead, remove it and log it there.",
      card,
    );
  }
  if (e.id === card.entity_id) return fail(400, "It's already on that record.", card);
  const name = await verifyEntity(deps.supabase, deps.ctx.orgId, e.type, e.id);
  if (!name) return fail(404, "That record is not one you can file to.", card);

  let snapshot: Record<string, unknown>;
  try {
    snapshot = await fix.move(deps.supabase, deps.ctx, card, e.id, nowIso(deps));
  } catch (err) {
    return fromError(err);
  }
  return {
    ok: true,
    card: await saveCard(deps, card, {
      entity_type: e.type,
      entity_id: e.id,
      payload: { ...card.payload, entity_name: name, applied_snapshot: snapshot },
    }),
  };
}

export async function removeFiled(deps: ActionDeps, cardId: string): Promise<FixResult> {
  const loaded = await loadFixable(deps, cardId);
  if (!isFixable(loaded)) return loaded;
  const { card, fix } = loaded;

  try {
    await fix.remove(deps.supabase, deps.ctx, card);
  } catch (e) {
    return fromError(e);
  }
  const payload: Record<string, unknown> = { ...card.payload, removed: { at: nowIso(deps), by: deps.ctx.handle } };
  delete payload.applied_snapshot;
  return { ok: true, removed: true, card: await saveCard(deps, card, { status: "discarded", payload }) };
}
