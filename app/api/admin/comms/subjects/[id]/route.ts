import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ctxHasPermission } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";

/**
 * Unlink a subject. Removing a participant would leave the story with nobody
 * to protect, so it would publish on approval alone: only a holder of
 * comms.subjects.read (owner/admin) may do it, mirroring the database policy.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const db = getSupabaseAdmin();
  const { data: subject } = await db
    .from("story_subjects")
    .select("id, story_id, subject_type")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!subject) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (subject.subject_type === "participant" && !(await ctxHasPermission(ctx, "comms.subjects.read"))) {
    return NextResponse.json({ error: "Only an owner or admin can remove a participant from a story." }, { status: 403 });
  }
  const { error } = await db.from("story_subjects").delete().eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) return NextResponse.json({ error: "Could not remove that person" }, { status: 500 });
  await audit(req, { action: "comms.subject.unlink", entityType: "story", entityId: subject.story_id as string, after: { subject_type: subject.subject_type } });
  return NextResponse.json({ ok: true });
}
