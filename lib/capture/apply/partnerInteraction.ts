/**
 * Applier: an interaction card on a partner -> one `partner_interactions` row,
 * then partners.last_touch_at moves forward to the touch's day, exactly as the
 * manual "+ Log touch" route does (app/api/admin/partners/interactions). That
 * route runs on the service role with a hand fence; this one runs on the
 * SESSION client, so program.write is enforced by RLS. Provenance:
 * external_source 'capture', external_id = card id, idempotent through the
 * (org_id, external_source, external_id, partner_id) unique index.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ApplyError,
  FILED_ROW_GONE,
  INTERACTION_KINDS,
  changedField,
  isUniqueViolation,
  noonUtc,
  pick,
  snapshotOf,
  str,
  writeError,
  type Applier,
  type ApplyCtx,
  type ApplyResult,
  type CardRow,
} from "./shared";

const KINDS = INTERACTION_KINDS;
const SNAPSHOT_KEYS = ["partner_id", "kind", "occurred_at", "notes"] as const;
const COLUMNS = "id, partner_id, kind, occurred_at, notes, external_source, external_id";
// Widened to string: a literal column list this long makes the select parser types blow up tsc.
const FIXED_COLUMNS: string = `${COLUMNS}, edited_at, edited_by`;
const DENIED = "You can't file to partner records in this org.";

async function lookup(supabase: SupabaseClient, orgId: string, cardId: string, partnerId: string) {
  const { data } = await supabase
    .from("partner_interactions")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .eq("external_source", "capture")
    .eq("external_id", cardId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** Move the partner's touch date forward only (same rule as the manual route). */
async function bumpTouch(supabase: SupabaseClient, ctx: ApplyCtx, partnerId: string, occurredAt: unknown): Promise<void> {
  const day = String(occurredAt).slice(0, 10);
  await supabase
    .from("partners")
    .update({ last_touch_at: day })
    .eq("org_id", ctx.orgId)
    .eq("id", partnerId)
    .or(`last_touch_at.is.null,last_touch_at.lt.${day}`);
}

async function apply(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow): Promise<ApplyResult> {
  if (card.entity_type !== "partner" || !card.entity_id) {
    throw new ApplyError(409, "Pick which partner this was with first.");
  }
  const existing = await lookup(supabase, ctx.orgId, card.id, card.entity_id);
  if (existing) {
    return { table: "partner_interactions", id: existing.id as string, snapshot: pick(existing, SNAPSHOT_KEYS) };
  }

  const kind = str(card.payload.kind);
  if (!kind || !(KINDS as readonly string[]).includes(kind)) {
    throw new ApplyError(422, "kind must be call/meeting/note/event");
  }
  const insert = {
    org_id: ctx.orgId,
    partner_id: card.entity_id,
    kind,
    occurred_at: noonUtc(card.payload.occurred_at),
    notes: (str(card.payload.notes) ?? "").slice(0, 4000) || null,
    logged_by: ctx.handle,
    external_source: "capture",
    external_id: card.id,
  };
  const { data, error } = await supabase.from("partner_interactions").insert(insert).select(COLUMNS).single();
  if (error || !data) {
    if (isUniqueViolation(error)) {
      const raced = await lookup(supabase, ctx.orgId, card.id, card.entity_id);
      if (raced) return { table: "partner_interactions", id: raced.id as string, snapshot: pick(raced, SNAPSHOT_KEYS) };
    }
    throw writeError(error, DENIED, "file the partner touch");
  }
  const row = data as Record<string, unknown>;

  await bumpTouch(supabase, ctx, card.entity_id, row.occurred_at);

  await ctx.audit({
    action: "capture.partner_interaction.create",
    entityType: "partner_interactions",
    entityId: row.id as string,
    after: insert,
  });
  return { table: "partner_interactions", id: row.id as string, snapshot: pick(row, SNAPSHOT_KEYS) };
}

async function undo(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow) {
  const snapshot = snapshotOf(card);
  if (!card.applied_id || !snapshot) throw new ApplyError(409, "Nothing to undo on this card.");
  const { data: current } = await supabase
    .from("partner_interactions")
    .select(COLUMNS)
    .eq("id", card.applied_id)
    .maybeSingle();
  if (!current) return { kind: "missing" as const };
  const field = changedField(current as Record<string, unknown>, snapshot, SNAPSHOT_KEYS);
  if (field) return { kind: "changed" as const, field };
  const { data: gone, error } = await supabase
    .from("partner_interactions")
    .delete()
    .eq("id", card.applied_id)
    .eq("external_source", "capture")
    .eq("external_id", card.id)
    .select("id");
  if (error) throw writeError(error, DENIED, "undo the partner touch");
  if (!gone || (gone as unknown[]).length === 0) throw new ApplyError(403, DENIED);
  // partners.last_touch_at is NOT rolled back: the previous value is not
  // recorded anywhere, and a later real touch may already have moved it. A
  // touch date one capture too recent is the lesser harm than guessing.
  await ctx.audit({
    action: "capture.partner_interaction.undo",
    entityType: "partner_interactions",
    entityId: card.applied_id,
    before: current,
  });
  return { kind: "deleted" as const };
}

// ── Fix after confirm (C6) ──────────────────────────────────────────────────
// Fenced to the card's own row by id AND capture provenance, like undo.
// last_touch_at is never rolled back (same reasoning as undo); a move bumps
// the new partner's touch date forward.

async function filedRow(supabase: SupabaseClient, card: CardRow): Promise<Record<string, unknown>> {
  if (!card.applied_id) throw new ApplyError(409, "This card was not filed anywhere.");
  const { data } = await supabase
    .from("partner_interactions")
    .select(FIXED_COLUMNS)
    .eq("id", card.applied_id)
    .eq("external_source", "capture")
    .eq("external_id", card.id)
    .maybeSingle();
  if (!data) throw new ApplyError(404, FILED_ROW_GONE);
  return data as unknown as Record<string, unknown>;
}

async function stampedUpdate(
  supabase: SupabaseClient,
  ctx: ApplyCtx,
  card: CardRow,
  fields: Record<string, unknown>,
  action: "revise" | "move",
): Promise<Record<string, unknown>> {
  const before = await filedRow(supabase, card);
  const { data, error } = await supabase
    .from("partner_interactions")
    .update(fields)
    .eq("id", card.applied_id as string)
    .eq("external_source", "capture")
    .eq("external_id", card.id)
    .select(FIXED_COLUMNS);
  if (error) throw writeError(error, DENIED, "fix the partner touch");
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) throw new ApplyError(403, DENIED);
  await ctx.audit({
    action: `capture.partner_interaction.${action}`,
    entityType: "partner_interactions",
    entityId: card.applied_id,
    before,
    after: fields,
  });
  return pick(rows[0], SNAPSHOT_KEYS);
}

async function move(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow, partnerId: string, at: string) {
  const snapshot = await stampedUpdate(supabase, ctx, card, { partner_id: partnerId, edited_at: at, edited_by: ctx.handle }, "move");
  await bumpTouch(supabase, ctx, partnerId, snapshot.occurred_at);
  return snapshot;
}

async function remove(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow): Promise<void> {
  const before = await filedRow(supabase, card);
  const { data: gone, error } = await supabase
    .from("partner_interactions")
    .delete()
    .eq("id", card.applied_id as string)
    .eq("external_source", "capture")
    .eq("external_id", card.id)
    .select("id");
  if (error) throw writeError(error, DENIED, "remove the partner touch");
  if (!gone || (gone as unknown[]).length === 0) throw new ApplyError(403, DENIED);
  await ctx.audit({
    action: "capture.partner_interaction.remove",
    entityType: "partner_interactions",
    entityId: card.applied_id,
    before,
  });
}

export const partnerInteractionApplier: Applier = {
  table: "partner_interactions",
  permission: "program.write",
  denied: DENIED,
  apply: (supabase, ctx, card) => apply(supabase, ctx, card),
  undo,
  fix: {
    entityType: "partner",
    revise: (supabase, ctx, card, update, at) =>
      stampedUpdate(supabase, ctx, card, { ...update, edited_at: at, edited_by: ctx.handle }, "revise"),
    move,
    remove,
  },
};
