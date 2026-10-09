import { NextRequest, NextResponse } from "next/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { confirmAll } from "@/lib/capture/confirm";
import { actionDeps } from "@/lib/capture/deps";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/capture/[id]/confirm-all (specs/bloomos-capture.md, C3 step 7).
 *
 * Confirms every proposed card on the capture, in position order, one at a
 * time through the same claim-then-apply path as a single confirm. Held cards
 * are skipped and counted; one card failing does not stop the rest.
 * -> { results: [{ id, ok, error?, applied? }], held_skipped, already_confirmed, capture_status }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ent = await requireEntitlement("ai.capture");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deps = await actionDeps(req, ent.ctx);
  const result = await confirmAll(deps, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    results: result.results,
    held_skipped: result.held_skipped,
    already_confirmed: result.already_confirmed,
    capture_status: result.capture_status,
  });
}
