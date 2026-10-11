/**
 * Applier: an interaction card on a constituent -> one `interactions` row
 * (specs/bloomos-capture.md, C3). Same validation as the manual "+ Log" route
 * (app/api/admin/interactions/route.ts) minus `email`, which a voice note can
 * never be. Provenance: external_source 'capture', external_id = card id,
 * which the (external_source, external_id, constituent_id) unique index makes
 * idempotent. No HubSpot mirror (ruling 9).
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
const SNAPSHOT_KEYS = ["constituent_id", "kind", "occurred_at", "notes"] as const;
const COLUMNS = "id, constituent_id, kind, occurred_at, notes, external_source, external_id";
const DENIED = "You can't file to donor records in this org.";

async function lookup(supabase: SupabaseClient, cardId: string, constituentId: string) {
  const { data } = await supabase
    .from("interactions")
    .select(COLUMNS)
    .eq("external_source", "capture")
    .eq("external_id", cardId)
    .eq("constituent_id", constituentId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function apply(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow): Promise<ApplyResult> {
  if (card.entity_type !== "constituent" || !card.entity_id) {
    throw new ApplyError(409, "Pick who this interaction was with first.");
  }
  const existing = await lookup(supabase, card.id, card.entity_id);
  if (existing) return { table: "interactions", id: existing.id as string, snapshot: pick(existing, SNAPSHOT_KEYS) };

  const kind = str(card.payload.kind);
  if (!kind || !(KINDS as readonly string[]).includes(kind)) {
    throw new ApplyError(422, "kind must be call/meeting/note/event");
  }
  const insert = {
    org_id: ctx.orgId,
    constituent_id: card.entity_id,
    kind,
    occurred_at: noonUtc(card.payload.occurred_at),
    notes: (str(card.payload.notes) ?? "").slice(0, 4000) || null,
    logged_by: ctx.handle,
    external_source: "capture",
    external_id: card.id,
  };
  const { data, error } = await supabase.from("interactions").insert(insert).select(COLUMNS).single();
  if (error || !data) {
    if (isUniqueViolation(error)) {
      const raced = await lookup(supabase, card.id, card.entity_id);
      if (raced) return { table: "interactions", id: raced.id as string, snapshot: pick(raced, SNAPSHOT_KEYS) };
    }
    throw writeError(error, DENIED, "file the interaction");
  }
  const row = data as Record<string, unknown>;
  await ctx.audit({ action: "capture.interaction.create", entityType: "interactions", entityId: row.id as string, after: insert });
  return { table: "interactions", id: row.id as string, snapshot: pick(row, SNAPSHOT_KEYS) };
}

async function undo(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow) {
  const snapshot = snapshotOf(card);
  if (!card.applied_id || !snapshot) throw new ApplyError(409, "Nothing to undo on this card.");
  const { data: current } = await supabase.from("interactions").select(COLUMNS).eq("id", card.applied_id).maybeSingle();
  if (!current) return { kind: "missing" as const };
  const field = changedField(current as Record<string, unknown>, snapshot, SNAPSHOT_KEYS);
  if (field) return { kind: "changed" as const, field };
  const { data: gone, error } = await supabase
    .from("interactions")
    .delete()
    .eq("id", card.applied_id)
    .eq("external_source", "capture")
    .eq("external_id", card.id)
    .select("id");
  if (error) throw writeError(error, DENIED, "undo the interaction");
  if (!gone || (gone as unknown[]).length === 0) throw new ApplyError(403, DENIED);
  await ctx.audit({ action: "capture.interaction.undo", entityType: "interactions", entityId: card.applied_id, before: current });
  return { kind: "deleted" as const };
}

export const interactionApplier: Applier = {
  table: "interactions",
  permission: "fundraising.write",
  denied: DENIED,
  apply: (supabase, ctx, card) => apply(supabase, ctx, card),
  undo,
};
