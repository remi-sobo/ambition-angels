import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ctxHasPermission } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { CONSENT_SCOPES, isConsentScope } from "@/lib/comms/consent";

/**
 * Record a consent for one subject: either the ask (requested_at, which is
 * PENDING and never publishes) or the grant (granted_at plus who gave it).
 * Ported from the story-bank branch. A participant's consent carries a
 * guardian's name, so writing one needs comms.subjects.read, exactly as the
 * story_consents policy requires. Nothing here sends anything to anyone.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const scope = Array.isArray(body.scope) ? body.scope.filter(isConsentScope) : [];
  if (scope.length === 0) return NextResponse.json({ error: `Pick at least one scope (${CONSENT_SCOPES.join(", ")}).` }, { status: 400 });
  for (const field of ["requested_at", "granted_at", "expires_at"] as const) {
    const v = body[field];
    if (v != null && v !== "" && !isISODate(v)) return NextResponse.json({ error: `${field} must be YYYY-MM-DD` }, { status: 400 });
  }
  const requestedAt = isISODate(body.requested_at) ? body.requested_at : null;
  const grantedAt = isISODate(body.granted_at) ? body.granted_at : null;
  if (!requestedAt && !grantedAt) return NextResponse.json({ error: "Record when you asked or when it was granted." }, { status: 400 });
  const grantedBy = typeof body.granted_by === "string" ? body.granted_by.trim() : "";
  if (grantedAt && !grantedBy) return NextResponse.json({ error: "Who gave permission?" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: subject } = await db
    .from("story_subjects")
    .select("id, story_id, subject_type")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  if (subject.subject_type === "participant" && !(await ctxHasPermission(ctx, "comms.subjects.read"))) {
    return NextResponse.json({ error: "Only an owner or admin can record consent for a participant." }, { status: 403 });
  }

  const { data, error } = await db
    .from("story_consents")
    .insert({
      org_id: ctx.orgId,
      story_subject_id: params.id,
      scope,
      requested_at: requestedAt,
      granted_by: grantedAt ? grantedBy.slice(0, 200) : null,
      granted_at: grantedAt,
      expires_at: isISODate(body.expires_at) ? body.expires_at : null,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[comms] consent create failed:", error?.message);
    return NextResponse.json({ error: "Could not record that consent" }, { status: 500 });
  }
  await audit(req, {
    action: grantedAt ? "comms.consent.grant" : "comms.consent.request",
    entityType: "story",
    entityId: subject.story_id as string,
    after: { consent_id: data.id, scope, granted_at: grantedAt, expires_at: body.expires_at ?? null },
  });
  return NextResponse.json({ ok: true, id: data.id });
}
