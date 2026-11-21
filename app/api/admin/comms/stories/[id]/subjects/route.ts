import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ctxHasPermission } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { subjectTargetExists } from "@/lib/admin/comms/bank-server";
import { isSubjectType, MAX_LABEL, SUBJECT_TABLE } from "@/lib/comms/stories";
import { shortName } from "@/lib/capture/cardKind";

/**
 * Link a person to a story (ported from the story-bank branch). The database
 * policy lets only comms.subjects.read holders write a participant subject;
 * this route enforces the same on the service-role path. A participant label
 * is cut to first name and last initial.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const subjectType = body.subject_type;
  if (!isSubjectType(subjectType)) return NextResponse.json({ error: "Unknown subject_type" }, { status: 400 });
  if (subjectType === "participant" && !(await ctxHasPermission(ctx, "comms.subjects.read"))) {
    return NextResponse.json({ error: "You don't have permission to link a participant to a story." }, { status: 403 });
  }
  const raw = typeof body.display_label === "string" ? body.display_label.trim() : "";
  const label = subjectType === "participant" ? shortName(raw) : raw;
  if (!label) return NextResponse.json({ error: "What may this story call them?" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: story } = await db.from("stories").select("id").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

  let subjectId: string | null = null;
  if (subjectType !== "none" && body.subject_id != null && body.subject_id !== "") {
    if (!isUuid(body.subject_id)) return NextResponse.json({ error: "Invalid subject_id" }, { status: 400 });
    if (!(await subjectTargetExists(db, SUBJECT_TABLE[subjectType], ctx.orgId, body.subject_id))) {
      return NextResponse.json({ error: "That record wasn't found" }, { status: 404 });
    }
    subjectId = body.subject_id;
  }
  const isMinor = typeof body.is_minor === "boolean" ? body.is_minor : subjectType === "participant";

  const { data, error } = await db
    .from("story_subjects")
    .insert({
      org_id: ctx.orgId,
      story_id: params.id,
      subject_type: subjectType,
      subject_id: subjectId,
      display_label: label.slice(0, MAX_LABEL),
      is_minor: isMinor,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[comms] subject link failed:", error?.message);
    return NextResponse.json({ error: "Could not link that person" }, { status: 500 });
  }
  await audit(req, {
    action: "comms.subject.link",
    entityType: "story",
    entityId: params.id,
    after: { subject_type: subjectType, is_minor: isMinor, linked: !!subjectId },
  });
  return NextResponse.json({ ok: true, id: data.id });
}
