/**
 * Shared contract for the Capture appliers (specs/bloomos-capture.md, C3).
 *
 * An applier turns one confirmed capture card into exactly one row in its
 * destination table, through the caller's SESSION client so RLS enforces the
 * destination's own permission (fundraising / program / ops / membership).
 * Every applier:
 *   1. looks up an existing row by provenance first (crash recovery and
 *      double-tap safety), and returns it when found;
 *   2. inserts, mapping an RLS denial to a 403 that names the destination;
 *   3. returns a snapshot of the inserted row's editable fields, which undo
 *      compares against before it deletes anything.
 *
 * No table names here: each destination's SQL lives in its own file, and the
 * fence test pins which tables each file may touch.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AppliedTable = "interactions" | "partner_interactions" | "ops_tasks" | "reed_drafts";

/** What the audit writer takes (lib/audit.ts AuditEntry, minus the actor override). */
export type AuditFn = (entry: {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) => Promise<void>;

export type ApplyCtx = {
  orgId: string;
  userId: string;
  /** ops_tasks.created_by / interactions.logged_by handle. */
  handle: string;
  audit: AuditFn;
};

export type CardRow = {
  id: string;
  org_id: string;
  capture_id: string;
  created_by: string;
  position: number;
  dest: "interaction" | "task" | "thought" | "message_draft";
  status: "proposed" | "held" | "confirmed" | "discarded";
  entity_type: "constituent" | "partner" | null;
  entity_id: string | null;
  heard_name: string | null;
  match_confidence: number | null;
  match_candidates: { kind: string; id: string; name: string; org_name?: string | null; meta?: string | null; sim?: number }[];
  payload: Record<string, unknown>;
  decided_by: string | null;
  decided_at: string | null;
  applied_table: AppliedTable | null;
  applied_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export const CARD_COLUMNS =
  "id, org_id, capture_id, created_by, position, dest, status, entity_type, entity_id, heard_name, match_confidence, match_candidates, payload, decided_by, decided_at, applied_table, applied_id, created_at, updated_at";

export type CaptureRow = {
  id: string;
  org_id: string;
  created_by: string;
  status: "parsing" | "ready" | "done" | "failed";
  model_used: string | null;
};

export const CAPTURE_COLUMNS = "id, org_id, created_by, status, model_used";

export type ApplyResult = { table: AppliedTable; id: string; snapshot: Record<string, unknown> };

export type UndoOutcome =
  | { kind: "deleted" }
  /** The destination row is already gone; nothing to delete. */
  | { kind: "missing" }
  /** Someone touched the row since it was filed; leave it alone. */
  | { kind: "changed"; field: string };

export type Applier = {
  table: AppliedTable;
  /** The permission the pre-check asks for before a card is claimed. */
  permission: string;
  /** Plain words for a 403 ("You can't file to donor records in this org."). */
  denied: string;
  apply(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow, capture: CaptureRow): Promise<ApplyResult>;
  undo(supabase: SupabaseClient, ctx: ApplyCtx, card: CardRow): Promise<UndoOutcome>;
};

/** A failure with an HTTP status the route returns verbatim. */
export class ApplyError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 422 | 500,
    message: string,
  ) {
    super(message);
    this.name = "ApplyError";
  }
}

type PgError = { code?: string; message?: string } | null | undefined;

/** True for Postgres insufficient_privilege / an RLS WITH CHECK denial. */
export function isPermissionError(e: PgError): boolean {
  if (!e) return false;
  return e.code === "42501" || /row-level security|permission denied/i.test(e.message ?? "");
}

/** True for a unique_violation (a concurrent apply won the provenance key). */
export function isUniqueViolation(e: PgError): boolean {
  return !!e && e.code === "23505";
}

/** Map a write error: RLS -> 403 naming the destination, else 500. */
export function writeError(e: PgError, denied: string, what: string): ApplyError {
  if (isPermissionError(e)) return new ApplyError(403, denied);
  console.error(`[capture/apply] ${what} failed:`, e?.message);
  return new ApplyError(500, `Could not ${what}`);
}

/** Keep only the listed keys of a row. */
export function pick(row: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = row[k] ?? null;
  return out;
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b) || (a && typeof a === "object") || (b && typeof b === "object")) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  return (a ?? null) === (b ?? null);
}

/** The first snapshot field whose current value differs, or null when unchanged. */
export function changedField(
  current: Record<string, unknown>,
  snapshot: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const k of keys) if (!same(current[k], snapshot[k])) return k;
  return null;
}

/** The snapshot stored at confirm time (payload.applied_snapshot). */
export function snapshotOf(card: CardRow): Record<string, unknown> | null {
  const s = card.payload?.applied_snapshot;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
}

/** The display name of the matched record, for labels and draft titles. */
export function entityName(card: CardRow): string | null {
  const fromPayload = typeof card.payload?.entity_name === "string" ? (card.payload.entity_name as string) : null;
  if (fromPayload) return fromPayload;
  const hit = card.entity_id ? card.match_candidates?.find((m) => m.id === card.entity_id) : null;
  return hit?.name ?? null;
}

/** A YYYY-MM-DD day anchored at noon UTC, so the calendar day survives any timezone. */
export function noonUtc(day: unknown): string {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00Z` : new Date().toISOString();
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
