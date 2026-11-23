import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/admin/requirePermission";
import { ctxHasPermission } from "@/lib/admin/auth";
import { auditDomain, importPerm } from "@/lib/admin/imports/perm";
import { undoImportBatch, undoSentence } from "@/lib/admin/imports/undo";

/**
 * POST /api/admin/imports/[id]/undo — remove what one finished file import
 * created (V4 Stage F). Guarded twice: any import write permission to get in,
 * then the run's own module (program.write for participants,
 * fundraising.write for donors and gifts). The run is loaded pinned to the
 * ACTIVE org, and every delete names the org and the batch id. Rules:
 * lib/admin/imports/undo.ts. Audited.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission(["program.write", "fundraising.write"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: run } = await supabase
    .from("imports")
    .select("id, org_id, entity_type, source, status")
    .eq("org_id", ctx.orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!run || run.org_id !== ctx.orgId) return NextResponse.json({ error: "That import wasn't found." }, { status: 404 });
  if (!(await ctxHasPermission(ctx, importPerm(run.entity_type, "write")))) {
    return NextResponse.json({ error: "You don't have permission to undo that import." }, { status: 403 });
  }
  if (run.source !== "csv") return NextResponse.json({ error: "Only spreadsheet imports can be undone." }, { status: 409 });
  if (run.status === "undone") return NextResponse.json({ error: "This import was already undone." }, { status: 409 });
  if (run.status !== "done") return NextResponse.json({ error: "Only a finished import can be undone." }, { status: 409 });

  let result;
  try {
    result = await undoImportBatch(supabase, { id: run.id, org_id: ctx.orgId, entity_type: run.entity_type }, ctx.userId);
  } catch (e) {
    console.error("Import undo failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The undo didn't finish. Nothing more will be removed until you try again." }, { status: 500 });
  }

  await audit(req, {
    action: `${auditDomain(run.entity_type)}.import.undo`,
    entityType: "import",
    entityId: run.id,
    after: result,
  });
  return NextResponse.json({ ok: true, ...result, message: undoSentence(result) });
}
