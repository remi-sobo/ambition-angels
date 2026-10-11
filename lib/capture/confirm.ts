/**
 * Confirm, discard, undo, and confirm-all for capture cards
 * (specs/bloomos-capture.md, C3 steps 3, 5, 6). Session client only.
 *
 * Confirm is claim-then-apply:
 *   a. load the card and its capture through RLS (404 when hidden);
 *   b. already confirmed with a row -> return it (idempotent);
 *   c. confirmed with no row yet -> an apply crashed between claim and write:
 *      re-run the applier, whose provenance lookup finds or creates the row.
 *      A claim younger than CONFIRM_IN_FLIGHT_SECONDS is another request still
 *      working, so that is a 409 instead (two taps never insert twice);
 *   d. held -> 409 unless the request carries the pick; discarded -> 409;
 *   e. pre-check the destination permission, then claim the card with a
 *      conditional update (status = 'proposed'); zero rows means someone else
 *      claimed it, so re-read and go back to (b);
 *   f. apply; on failure revert the claim and return 403 (permission) / 4xx / 500;
 *   g. record applied_table, applied_id, and payload.applied_snapshot;
 *   h. when nothing on the capture is proposed or held any more, it is 'done'.
 *
 * This file writes only capture_cards and captures. Destination SQL lives in
 * lib/capture/apply/*, one table per file (tests/capture-fence.test.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CONFIRM_IN_FLIGHT_SECONDS, UNDO_WINDOW_MINUTES } from "./constants";
import {
  ApplyError,
  CAPTURE_COLUMNS,
  CARD_COLUMNS,
  applierFor,
  applierForTable,
  type AppliedTable,
  type ApplyCtx,
  type CaptureRow,
  type CardRow,
} from "./apply";
import { editCard } from "./edit";

export type ActionDeps = {
  supabase: SupabaseClient;
  ctx: ApplyCtx;
  /** Destination permission check for the caller's active org (ctxHasPermission). */
  hasPermission: (permission: string) => Promise<boolean>;
  now?: () => Date;
};

export type ActionResult =
  | { ok: true; card: CardRow; applied?: { table: AppliedTable; id: string }; undone?: boolean }
  | { ok: false; status: number; error: string; card?: CardRow };

const fail = (status: number, error: string, card?: CardRow): ActionResult => ({ ok: false, status, error, card });

function fromError(e: unknown): ActionResult {
  if (e instanceof ApplyError) return fail(e.status, e.message);
  console.error("[capture/confirm] unexpected:", e instanceof Error ? e.message : e);
  return fail(500, "Something went wrong filing this card.");
}

async function loadCard(supabase: SupabaseClient, cardId: string): Promise<CardRow | null> {
  const { data } = await supabase.from("capture_cards").select(CARD_COLUMNS).eq("id", cardId).maybeSingle();
  return (data as CardRow | null) ?? null;
}

async function loadCapture(supabase: SupabaseClient, captureId: string): Promise<CaptureRow | null> {
  const { data } = await supabase.from("captures").select(CAPTURE_COLUMNS).eq("id", captureId).maybeSingle();
  return (data as CaptureRow | null) ?? null;
}

/** 'done' when no card on the capture is still proposed or held. */
async function settleCapture(supabase: SupabaseClient, captureId: string): Promise<void> {
  const { count } = await supabase
    .from("capture_cards")
    .select("id", { count: "exact", head: true })
    .eq("capture_id", captureId)
    .in("status", ["proposed", "held"]);
  if ((count ?? 0) === 0) {
    await supabase.from("captures").update({ status: "done" }).eq("id", captureId).eq("status", "ready");
  }
}

async function revertClaim(supabase: SupabaseClient, cardId: string): Promise<void> {
  await supabase
    .from("capture_cards")
    .update({ status: "proposed", decided_by: null, decided_at: null })
    .eq("id", cardId)
    .eq("status", "confirmed")
    .is("applied_id", null);
}

async function finishApply(deps: ActionDeps, card: CardRow, capture: CaptureRow): Promise<ActionResult> {
  const { supabase, ctx } = deps;
  let result;
  try {
    result = await applierFor(card).apply(supabase, ctx, card, capture);
  } catch (e) {
    await revertClaim(supabase, card.id);
    return fromError(e);
  }
  const { data: done } = await supabase
    .from("capture_cards")
    .update({
      applied_table: result.table,
      applied_id: result.id,
      payload: { ...card.payload, applied_snapshot: result.snapshot },
    })
    .eq("id", card.id)
    .select(CARD_COLUMNS)
    .maybeSingle();
  await settleCapture(supabase, capture.id);
  return {
    ok: true,
    card: (done as CardRow | null) ?? { ...card, applied_table: result.table, applied_id: result.id },
    applied: { table: result.table, id: result.id },
  };
}

export async function confirmCard(deps: ActionDeps, cardId: string, patch?: unknown): Promise<ActionResult> {
  const { supabase, ctx } = deps;
  const now = () => deps.now?.() ?? new Date();

  let card = await loadCard(supabase, cardId);
  if (!card) return fail(404, "Not found");
  const capture = await loadCapture(supabase, card.capture_id);
  if (!capture) return fail(404, "Not found");

  // A pick or edit sent with the confirm is applied first (step d).
  if (patch !== undefined && patch !== null && (card.status === "proposed" || card.status === "held")) {
    const edited = await editCard(deps, card.id, patch);
    if (!edited.ok) return fail(edited.status, edited.error);
    card = edited.card;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (card.status === "confirmed") {
      if (card.applied_id && card.applied_table) {
        return { ok: true, card, applied: { table: card.applied_table, id: card.applied_id } };
      }
      const claimedAt = card.decided_at ? Date.parse(card.decided_at) : 0;
      if (now().getTime() - claimedAt < CONFIRM_IN_FLIGHT_SECONDS * 1000) {
        return fail(409, "This card is already being filed.", card);
      }
      return finishApply(deps, card, capture);
    }
    if (card.status === "discarded") return fail(409, "This card was discarded.", card);
    if (card.status === "held") return fail(409, "Pick a match first.", card);

    let permission: string;
    let denied: string;
    try {
      const applier = applierFor(card);
      permission = applier.permission;
      denied = applier.denied;
    } catch (e) {
      return fromError(e);
    }
    if (!(await deps.hasPermission(permission))) return fail(403, denied, card);

    const { data: claimed } = await supabase
      .from("capture_cards")
      .update({ status: "confirmed", decided_by: ctx.userId, decided_at: now().toISOString() })
      .eq("id", card.id)
      .eq("status", "proposed")
      .select(CARD_COLUMNS)
      .maybeSingle();
    if (claimed) return finishApply(deps, claimed as CardRow, capture);

    // Lost the claim: someone else confirmed, discarded, or edited it. Re-read.
    const reread = await loadCard(supabase, cardId);
    if (!reread) return fail(404, "Not found");
    card = reread;
  }
  return fail(409, "This card changed while you were confirming it.", card);
}

export async function discardCard(deps: ActionDeps, cardId: string): Promise<ActionResult> {
  const { supabase, ctx } = deps;
  const card = await loadCard(supabase, cardId);
  if (!card) return fail(404, "Not found");
  if (card.status === "discarded") return { ok: true, card };
  if (card.status === "confirmed") return fail(409, "This card was already filed. Use undo instead.", card);

  const { data: updated } = await supabase
    .from("capture_cards")
    .update({ status: "discarded", decided_by: ctx.userId, decided_at: (deps.now?.() ?? new Date()).toISOString() })
    .eq("id", card.id)
    .in("status", ["proposed", "held"])
    .select(CARD_COLUMNS)
    .maybeSingle();
  if (!updated) return fail(409, "This card changed while you were discarding it.");
  await settleCapture(supabase, card.capture_id);
  return { ok: true, card: updated as CardRow };
}

export async function undoCard(deps: ActionDeps, cardId: string): Promise<ActionResult> {
  const { supabase, ctx } = deps;
  const card = await loadCard(supabase, cardId);
  if (!card) return fail(404, "Not found");
  if (card.status !== "confirmed" || !card.applied_id) return fail(409, "Only a filed card can be undone.", card);

  const decided = card.decided_at ? Date.parse(card.decided_at) : 0;
  const now = (deps.now?.() ?? new Date()).getTime();
  if (now - decided > UNDO_WINDOW_MINUTES * 60_000) {
    return fail(409, `Undo is only available for ${UNDO_WINDOW_MINUTES} minutes after filing.`, card);
  }

  let outcome;
  try {
    outcome = await applierForTable(card.applied_table).undo(supabase, ctx, card);
  } catch (e) {
    return fromError(e);
  }
  if (outcome.kind === "changed") {
    return fail(409, `It was changed after it was filed (${outcome.field}), so it stays.`, card);
  }

  const payload = { ...card.payload };
  delete payload.applied_snapshot;
  const { data: reset } = await supabase
    .from("capture_cards")
    .update({ status: "proposed", applied_table: null, applied_id: null, decided_by: null, decided_at: null, payload })
    .eq("id", card.id)
    .eq("status", "confirmed")
    .select(CARD_COLUMNS)
    .maybeSingle();
  await supabase.from("captures").update({ status: "ready" }).eq("id", card.capture_id).eq("status", "done");
  return { ok: true, card: (reset as CardRow | null) ?? card, undone: true };
}

export type ConfirmAllResult =
  | {
      ok: true;
      results: { id: string; ok: boolean; error?: string; applied?: { table: AppliedTable; id: string } }[];
      held_skipped: number;
      already_confirmed: number;
      capture_status: CaptureRow["status"] | null;
    }
  | { ok: false; status: number; error: string };

/** Confirm every proposed card in position order, one at a time. Held cards are skipped and counted. */
export async function confirmAll(deps: ActionDeps, captureId: string): Promise<ConfirmAllResult> {
  const { supabase } = deps;
  const capture = await loadCapture(supabase, captureId);
  if (!capture) return { ok: false, status: 404, error: "Not found" };

  const { data: rows } = await supabase
    .from("capture_cards")
    .select(CARD_COLUMNS)
    .eq("capture_id", captureId)
    .order("position", { ascending: true });
  const cards = (rows ?? []) as CardRow[];

  const results: Extract<ConfirmAllResult, { ok: true }>["results"] = [];
  let held = 0;
  let already = 0;
  for (const card of cards) {
    if (card.status === "held") {
      held += 1;
      continue;
    }
    if (card.status === "confirmed") {
      already += 1;
      continue;
    }
    if (card.status !== "proposed") continue;
    const r = await confirmCard(deps, card.id);
    results.push(r.ok ? { id: card.id, ok: true, applied: r.applied } : { id: card.id, ok: false, error: r.error });
  }
  const after = await loadCapture(supabase, captureId);
  return { ok: true, results, held_skipped: held, already_confirmed: already, capture_status: after?.status ?? null };
}
