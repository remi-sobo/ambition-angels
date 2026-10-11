/**
 * Applier: a task or thought card -> one `ops_tasks` row (specs/bloomos-capture.md,
 * C3; rulings 8 and the "Thought · parking lot" example). Provenance is a
 * label, `sys:ref:capture_card:<card id>`, plus `origin_path` pointing back at
 * the capture; the lookup is by that label (the house sys:ref: convention,
 * lib/admin/ops/ingest.ts). ops_tasks has no unique index on labels, so the
 * claim in lib/capture/confirm.ts is what keeps a double tap to one row.
 *
 * Thoughts carry the `parking-lot` label, no due date, no assignee, and
 * category `other`. A thought longer than the title column's comfortable
 * length keeps the full text in description.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTaskCategory } from "@/app/admin/ops/_types/ops";
import { sanitizeOriginPath } from "@/lib/admin/originPath";
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

const SNAPSHOT_KEYS = [
  "title",
  "description",
  "category",
  "status",
  "due_date",
  "assigned_to",
  "linked_entity_type",
  "linked_entity_id",
  "updated_at",
] as const;
const COLUMNS =
  "id, title, description, category, status, due_date, assigned_to, assigned_to_id, labels, linked_entity_type, linked_entity_id, linked_label, origin_path, updated_at";
const DENIED = "You can't create tasks in this org.";
const TITLE_MAX = 160;

export const refLabel = (cardId: string) => `sys:ref:capture_card:${cardId}`;

async function lookup(supabase: SupabaseClient, orgId: string, cardId: string) {
  const { data } = await supabase
    .from("ops_tasks")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .contains("labels", [refLabel(cardId)])
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The ops_tasks insert for a card. Pure, exported for the tests and the PR table. */
export function taskInsert(ctx: ApplyCtx, card: CardRow, capture: CaptureRow): Record<string, unknown> {
  const isThought = card.dest === "thought";
  const text = isThought ? str(card.payload.text) ?? "" : str(card.payload.title) ?? "";
  if (!text) throw new ApplyError(422, isThought ? "This thought is empty." : "This task needs a title.");

  const title = text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
  const description = isThought ? (text.length > TITLE_MAX ? text : null) : str(card.payload.notes);
  const category = !isThought && isTaskCategory(card.payload.category) ? card.payload.category : "other";

  const assignee = !isThought ? (card.payload.assignee as { handle?: unknown; user_id?: unknown } | null) : null;
  const handle = assignee && typeof assignee.handle === "string" ? assignee.handle : null;
  const userId = assignee && typeof assignee.user_id === "string" ? assignee.user_id : null;
  const both = handle && userId; // both or neither (ruling 8)

  const linked =
    (card.entity_type === "constituent" || card.entity_type === "partner") && card.entity_id
      ? { linked_entity_type: card.entity_type, linked_entity_id: card.entity_id, linked_label: entityName(card) }
      : { linked_entity_type: null, linked_entity_id: null, linked_label: null };

  return {
    org_id: ctx.orgId,
    title,
    description,
    category,
    created_by: ctx.handle,
    assigned_to: both ? handle : null,
    assigned_to_id: both ? userId : null,
    due_date: !isThought && isDay(card.payload.due_date) ? card.payload.due_date : null,
    ...linked,
    labels: isThought ? ["capture", refLabel(card.id), "parking-lot"] : ["capture", refLabel(card.id)],
    origin_path: sanitizeOriginPath(`/admin/capture/${capture.id}`),
  };
}

async function apply(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow, capture: CaptureRow): Promise<ApplyResult> {
  const existing = await lookup(supabase, ctx.orgId, card.id);
  if (existing) return { table: "ops_tasks", id: existing.id as string, snapshot: pick(existing, SNAPSHOT_KEYS) };

  const insert = taskInsert(ctx, card, capture);
  const { data, error } = await supabase.from("ops_tasks").insert(insert).select(COLUMNS).single();
  if (error || !data) throw writeError(error, DENIED, "create the task");
  const row = data as Record<string, unknown>;
  await ctx.audit({
    action: card.dest === "thought" ? "capture.thought.create" : "capture.task.create",
    entityType: "ops_tasks",
    entityId: row.id as string,
    after: insert,
  });
  return { table: "ops_tasks", id: row.id as string, snapshot: pick(row, SNAPSHOT_KEYS) };
}

async function undo(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow) {
  const snapshot = snapshotOf(card);
  if (!card.applied_id || !snapshot) throw new ApplyError(409, "Nothing to undo on this card.");
  const { data: current } = await supabase.from("ops_tasks").select(COLUMNS).eq("id", card.applied_id).maybeSingle();
  if (!current) return { kind: "missing" as const };
  // updated_at is in the snapshot keys: any edit since filing blocks the undo.
  const field = changedField(current as Record<string, unknown>, snapshot, SNAPSHOT_KEYS);
  if (field) return { kind: "changed" as const, field };
  const { data: gone, error } = await supabase
    .from("ops_tasks")
    .delete()
    .eq("id", card.applied_id)
    .contains("labels", [refLabel(card.id)])
    .select("id");
  if (error) throw writeError(error, DENIED, "undo the task");
  if (!gone || (gone as unknown[]).length === 0) throw new ApplyError(403, DENIED);
  await ctx.audit({
    action: card.dest === "thought" ? "capture.thought.undo" : "capture.task.undo",
    entityType: "ops_tasks",
    entityId: card.applied_id,
    before: current,
  });
  return { kind: "deleted" as const };
}

export const taskApplier: Applier = {
  table: "ops_tasks",
  permission: "ops.write",
  denied: DENIED,
  apply,
  undo,
};
