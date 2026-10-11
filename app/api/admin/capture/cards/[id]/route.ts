import { NextRequest, NextResponse } from "next/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { confirmCard, discardCard, undoCard } from "@/lib/capture/confirm";
import { actionDeps } from "@/lib/capture/deps";
import { checkPatch, editCard } from "@/lib/capture/edit";

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
 */

const ACTIONS = ["confirm", "discard", "undo", "edit"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ent = await requireEntitlement("ai.capture");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { action?: unknown; patch?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body?.action as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "action must be confirm, discard, undo, or edit" }, { status: 400 });
  }
  const hasPatch = body.patch !== undefined && body.patch !== null;
  if (action === "edit" && !hasPatch) return NextResponse.json({ error: "edit needs a patch" }, { status: 400 });
  if ((action === "discard" || action === "undo") && hasPatch) {
    return NextResponse.json({ error: `${action} takes no patch` }, { status: 400 });
  }
  if (hasPatch) {
    const bad = checkPatch(body.patch);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  }

  const deps = await actionDeps(req, ent.ctx);
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
