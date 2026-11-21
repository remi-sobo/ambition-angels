import { NextRequest, NextResponse } from "next/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { confirmCard, discardCard, undoCard } from "@/lib/capture/confirm";
import { actionDeps } from "@/lib/capture/deps";
import { checkPatch, editCard } from "@/lib/capture/edit";
import { moveFiled, removeFiled, reviseFiled } from "@/lib/capture/fix";
import { cardKindOf } from "@/lib/capture/cardKind";
import { CARD_COLUMNS, type CardRow } from "@/lib/capture/apply";
import { editStory, keepStory, markPledgeAdded, recordGiftFiled } from "@/lib/capture/v4Cards";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/capture/cards/[id] (specs/bloomos-capture.md, C3 step 7).
 *
 * { action: 'confirm' | 'discard' | 'undo' | 'edit', patch? } -> { card, applied? }.
 * confirm files the card to its destination through the session client (RLS
 * decides; a denial is a 403 naming the destination); discard and undo move it
 * back out; edit changes a proposed or held card in place. A card the caller
 * cannot see is a 404 (capture_cards policies are personal). No rate limit:
 * nothing here calls a model.
 *
 * V4 §8, gift and story cards (never filed by an applier):
 *   { action: 'record_gift', gift_id }  after the gift drawer saved the gift
 *   { action: 'pledge_added' }          the pledge was added on the donor record
 *   { action: 'keep' }                  keep a story as a held draft
 *   { action: 'edit', patch }           on a story: text, title, about, identifiable
 *
 * Fix after confirm (C6), on a filed interaction or partner touch:
 *   { action: 'revise', patch: { kind?, occurred_at?, notes? } }
 *   { action: 'move', entity: { type, id } }
 *   { action: 'remove' } -> { card, removed: true }
 */

const ACTIONS = ["confirm", "discard", "undo", "edit", "revise", "move", "remove", "record_gift", "pledge_added", "keep"] as const;
const FIX_ACTIONS: readonly Action[] = ["revise", "move", "remove"];
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ent = await requireEntitlement("ai.capture");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { action?: unknown; patch?: unknown; entity?: unknown; gift_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body?.action as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "action must be confirm, discard, undo, edit, revise, move, remove, record_gift, pledge_added, or keep" },
      { status: 400 },
    );
  }
  const hasPatch = body.patch !== undefined && body.patch !== null;

  if (action === "record_gift" || action === "pledge_added" || action === "keep") {
    if (hasPatch) return NextResponse.json({ error: `${action} takes no patch` }, { status: 400 });
    const deps = await actionDeps(req, ent.ctx);
    const r =
      action === "record_gift"
        ? await recordGiftFiled(deps, params.id, body.gift_id)
        : action === "pledge_added"
          ? await markPledgeAdded(deps, params.id)
          : await keepStory(deps, params.id);
    if (!r.ok) return NextResponse.json({ error: r.error, ...(r.card ? { card: r.card } : {}) }, { status: r.status });
    return NextResponse.json({ card: r.card });
  }

  if (FIX_ACTIONS.includes(action)) {
    const hasEntity = body.entity !== undefined && body.entity !== null;
    if (action === "revise" && (!hasPatch || hasEntity)) return NextResponse.json({ error: "revise takes a patch only" }, { status: 400 });
    if (action === "move" && (!hasEntity || hasPatch)) return NextResponse.json({ error: "move takes an entity only" }, { status: 400 });
    if (action === "remove" && (hasEntity || hasPatch)) return NextResponse.json({ error: "remove takes no patch" }, { status: 400 });
    const deps = await actionDeps(req, ent.ctx);
    const fixed =
      action === "revise"
        ? await reviseFiled(deps, params.id, body.patch)
        : action === "move"
          ? await moveFiled(deps, params.id, body.entity)
          : await removeFiled(deps, params.id);
    if (!fixed.ok) {
      return NextResponse.json({ error: fixed.error, ...(fixed.card ? { card: fixed.card } : {}) }, { status: fixed.status });
    }
    return NextResponse.json({ card: fixed.card, ...(fixed.removed ? { removed: true } : {}) });
  }

  if (action === "edit" && !hasPatch) return NextResponse.json({ error: "edit needs a patch" }, { status: 400 });
  if ((action === "discard" || action === "undo") && hasPatch) {
    return NextResponse.json({ error: `${action} takes no patch` }, { status: 400 });
  }
  if (hasPatch) {
    const bad = checkPatch(body.patch);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  }

  const deps = await actionDeps(req, ent.ctx);

  // A story card's edit has its own fields and its fail-closed consent check.
  if (action === "edit") {
    const { data: loaded } = await deps.supabase.from("capture_cards").select(CARD_COLUMNS).eq("id", params.id).maybeSingle();
    if (loaded && cardKindOf(loaded as CardRow) === "story") {
      const r = await editStory(deps, loaded as CardRow, body.patch as Record<string, unknown>);
      if (!r.ok) return NextResponse.json({ error: r.error, ...(r.card ? { card: r.card } : {}) }, { status: r.status });
      return NextResponse.json({ card: r.card });
    }
  }

  const result =
    action === "confirm"
      ? await confirmCard(deps, params.id, hasPatch ? body.patch : undefined)
      : action === "discard"
        ? await discardCard(deps, params.id)
        : action === "undo"
          ? await undoCard(deps, params.id)
          : await editCard(deps, params.id, body.patch);

  if (!result.ok) {
    const card = "card" in result ? result.card : undefined;
    return NextResponse.json({ error: result.error, ...(card ? { card } : {}) }, { status: result.status });
  }
  const applied = "applied" in result ? result.applied : undefined;
  return NextResponse.json({ card: result.card, ...(applied ? { applied } : {}) });
}
