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

const KINDS = ["call", "meeting", "note", "event"] as const;
const SNAPSHOT_KEYS = ["partner_id", "kind", "occurred_at", "notes"] as const;
const COLUMNS = "id, partner_id, kind, occurred_at, notes, external_source, external_id";
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

  // Move the partner's touch date forward only (same rule as the manual route).
  const day = String(row.occurred_at).slice(0, 10);
  await supabase
    .from("partners")
    .update({ last_touch_at: day })
    .eq("org_id", ctx.orgId)
    .eq("id", card.entity_id)
    .or(`last_touch_at.is.null,last_touch_at.lt.${day}`);

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

export const partnerInteractionApplier: Applier = {
  table: "partner_interactions",
  permission: "program.write",
  denied: DENIED,
  apply: (supabase, ctx, card) => apply(supabase, ctx, card),
  undo,
};
