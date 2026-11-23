import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";

/**
 * "Stop using this story": revoke every live consent on this story's
 * participants at once (Remi, 2026-11-21: staff may revoke, never record).
 *
 * Staff hold comms.manage but not comms.subjects.read, so they never see a
 * participant's consent rows or ids. This route works from the story id
 * alone and returns only a count, so it reveals nothing about who is in the
 * story. Revoking only ever makes a story less usable: story-gate.ts treats a
 * revoked grant as blocking everywhere, including copies already queued.
 * Recording or restoring consent stays owner/admin only.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;

  const db = getSupabaseAdmin();
  const { data: story } = await db
    .from("stories")
    .select("id")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!story) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: subjects, error: subjErr } = await db
    .from("story_subjects")
    .select("id")
    .eq("story_id", params.id)
    .eq("org_id", ctx.orgId)
    .eq("subject_type", "participant");
  if (subjErr) return NextResponse.json({ error: "Could not read this story" }, { status: 500 });
  const ids = (subjects ?? []).map((s: { id: string }) => s.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, revoked: 0 });

  const { data: updated, error } = await db
    .from("story_consents")
    .update({ revoked_at: new Date().toISOString() })
    .in("story_subject_id", ids)
    .eq("org_id", ctx.orgId)
    .is("revoked_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: "Could not stop this story" }, { status: 500 });

  const revoked = (updated ?? []).length;
  await audit(req, { action: "comms.consent.revoke_story", entityType: "story", entityId: params.id, after: { revoked } });
  return NextResponse.json({ ok: true, revoked });
}
