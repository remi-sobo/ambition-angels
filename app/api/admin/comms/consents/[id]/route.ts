import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ctxHasPermission } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";

/**
 * Revoke one consent. Revocation dominates every other row on the subject
 * (lib/comms/consent.ts), so the story stops being usable everywhere at once,
 * including an edition already compiled into an email: the queue and the
 * worker both re-check (lib/comms/story-gate.ts). Un-revoking is not offered
 * here; a new grant is recorded instead, so the ledger keeps the history.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || body.revoke !== true) return NextResponse.json({ error: "Only revoke is supported." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: row } = await db
    .from("story_consents")
    .select("id, story_subject_id, revoked_at")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: subject } = await db
    .from("story_subjects")
    .select("story_id, subject_type")
    .eq("id", row.story_subject_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!subject) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (subject.subject_type === "participant" && !(await ctxHasPermission(ctx, "comms.subjects.read"))) {
    return NextResponse.json({ error: "Only an owner or admin can change a participant's consent." }, { status: 403 });
  }
  if (row.revoked_at) return NextResponse.json({ ok: true });
  const { error } = await db
    .from("story_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("org_id", ctx.orgId);
  if (error) return NextResponse.json({ error: "Could not revoke that consent" }, { status: 500 });
  await audit(req, { action: "comms.consent.revoke", entityType: "story", entityId: subject.story_id as string, after: { consent_id: params.id } });
  return NextResponse.json({ ok: true });
}
