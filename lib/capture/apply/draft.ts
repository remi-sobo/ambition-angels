/**
 * Applier: a message_draft card -> one `reed_drafts` row of kind
 * `capture_message` (C1 added the kind). Drafts stay drafts: nothing here, or
 * anywhere in Capture, sends. Provenance rides in context_ref
 * (capture_id, capture_card_id, entity, channel, subject); the lookup is by
 * context_ref->>capture_card_id.
 *
 * reed_drafts RLS is membership-only, weaker than the has_permission floor
 * (spec, "flag for the security backlog"). The confirm pre-check therefore
 * asks for ops.write, the same permission that lets a user own a capture at
 * all, so the app never files a draft on membership alone.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ApplyError,
  changedField,
  entityName,
  pick,
  snapshotOf,
  str,
  writeError,
  type Applier,
  type ApplyCtx,
  type ApplyResult,
  type CardRow,
  type CaptureRow,
} from "./shared";

const SNAPSHOT_KEYS = ["kind", "title", "body", "status", "updated_at"] as const;
const COLUMNS = "id, kind, title, body, status, context_ref, model_used, updated_at";
const DENIED = "You can't save message drafts in this org.";

async function lookup(supabase: SupabaseClient, orgId: string, cardId: string) {
  const { data } = await supabase
    .from("reed_drafts")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .eq("kind", "capture_message")
    .eq("context_ref->>capture_card_id", cardId)
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** The reed_drafts insert for a card. Pure, exported for the tests and the PR table. */
export function draftInsert(ctx: ApplyCtx, card: CardRow, capture: CaptureRow): Record<string, unknown> {
  const body = str(card.payload.body);
  if (!body) throw new ApplyError(422, "This draft is empty.");
  const name = entityName(card) ?? str(card.payload.recipient_name) ?? card.heard_name ?? "someone";
  return {
    org_id: ctx.orgId,
    kind: "capture_message",
    title: `Message to ${name}`.slice(0, 200),
    body: body.slice(0, 4000),
    status: "drafted",
    created_by: ctx.handle,
    model_used: capture.model_used ?? null,
    context_ref: {
      capture_id: capture.id,
      capture_card_id: card.id,
      entity_type: card.entity_type,
      entity_id: card.entity_id,
      channel: str(card.payload.channel) ?? "email",
      subject: str(card.payload.subject),
    },
  };
}

async function apply(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow, capture: CaptureRow): Promise<ApplyResult> {
  const existing = await lookup(supabase, ctx.orgId, card.id);
  if (existing) return { table: "reed_drafts", id: existing.id as string, snapshot: pick(existing, SNAPSHOT_KEYS) };

  const insert = draftInsert(ctx, card, capture);
  const { data, error } = await supabase.from("reed_drafts").insert(insert).select(COLUMNS).single();
  if (error || !data) throw writeError(error, DENIED, "save the draft");
  const row = data as Record<string, unknown>;
  await ctx.audit({ action: "capture.message_draft.create", entityType: "reed_drafts", entityId: row.id as string, after: insert });
  return { table: "reed_drafts", id: row.id as string, snapshot: pick(row, SNAPSHOT_KEYS) };
}

async function undo(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow) {
  const snapshot = snapshotOf(card);
  if (!card.applied_id || !snapshot) throw new ApplyError(409, "Nothing to undo on this card.");
  const { data: current } = await supabase.from("reed_drafts").select(COLUMNS).eq("id", card.applied_id).maybeSingle();
  if (!current) return { kind: "missing" as const };
  const field = changedField(current as Record<string, unknown>, snapshot, SNAPSHOT_KEYS);
  if (field) return { kind: "changed" as const, field };
  const { data: gone, error } = await supabase
    .from("reed_drafts")
    .delete()
    .eq("id", card.applied_id)
    .eq("context_ref->>capture_card_id", card.id)
    .select("id");
  if (error) throw writeError(error, DENIED, "undo the draft");
  if (!gone || (gone as unknown[]).length === 0) throw new ApplyError(403, DENIED);
  await ctx.audit({ action: "capture.message_draft.undo", entityType: "reed_drafts", entityId: card.applied_id, before: current });
  return { kind: "deleted" as const };
}

export const draftApplier: Applier = {
  table: "reed_drafts",
  permission: "ops.write",
  denied: DENIED,
  apply,
  undo,
};
