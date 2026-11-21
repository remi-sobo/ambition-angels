import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { moveKeptStoryDrafts } from "@/lib/admin/comms/capture-server";

/**
 * Move the story drafts Talk to log kept before the story bank existed into
 * the bank (V4 Stage D). Each lands as a raw story with first name and last
 * initial only, held until consent is on file. Idempotent.
 */
export async function POST(req: NextRequest) {
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const r = await moveKeptStoryDrafts(getSupabaseAdmin(), gate.ctx.orgId, (await getAdminUser()) ?? null);
  await audit(req, { action: "comms.story.import_capture", entityType: "story", entityId: gate.ctx.orgId, after: r });
  if (r.failed > 0 && r.moved === 0) return NextResponse.json({ error: "Those drafts couldn't be moved. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, ...r });
}
