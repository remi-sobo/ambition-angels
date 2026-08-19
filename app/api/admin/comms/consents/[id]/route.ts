import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";
import { isConsentScope } from "@/lib/comms/consent";

/**
 * Grant, renew, or revoke one consent row (specs/comms-module.md §7.3, §10).
 *
 * Revocation is the one that matters. It is instant and total: the moment
 * `revoked_at` is set, subjectConsentState() returns `revoked` regardless of
 * any other row on that subject — including a broad blanket release — and the
 * story stops being publishable everywhere, in-flight editions included.
 *
 * We cannot unsend a newsletter that already went out. What we can do is make
 * sure it never goes out again and that the ledger says who revoked it and
 * when. That is what the audit line here is for.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};

  if (body.revoke === true) {
    update.revoked_at = new Date().toISOString();
  } else if (body.revoke === false) {
    // Un-revoke exists because revoking the wrong row is a plausible mistake
    // and the alternative is re-collecting a release that was never withdrawn.
    update.revoked_at = null;
  }

  if ("scope" in body) {
    const scope = Array.isArray(body.scope) ? body.scope.filter(isConsentScope) : [];
    if (scope.length === 0) {
      return NextResponse.json({ error: "Pick at least one scope." }, { status: 400 });
    }
    update.scope = scope;
  }

  for (const field of ["granted_at", "expires_at", "requested_at"] as const) {
    if (!(field in body)) continue;
    const v = body[field];
    if (v === null || v === "") update[field] = null;
    else if (isISODate(v)) update[field] = v;
    else return NextResponse.json({ error: `${field} must be YYYY-MM-DD` }, { status: 400 });
  }

  if ("granted_by" in body) {
    const v = body.granted_by;
    if (v === null || v === "") update.granted_by = null;
    else if (typeof v === "string") update.granted_by = v.trim().slice(0, 200);
    else return NextResponse.json({ error: "granted_by must be text" }, { status: 400 });
  }

  if ("notes" in body) {
    const v = body.notes;
    if (v === null || v === "") update.notes = null;
    else if (typeof v === "string") update.notes = v.trim().slice(0, 2000);
    else return NextResponse.json({ error: "notes must be text" }, { status: 400 });
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: before } = await supabase
    .from("story_consents")
    .select("id, story_subject_id, scope, granted_at, expires_at, revoked_at")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Consent not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("story_consents")
    .update(update)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("id, scope, requested_at, granted_by, granted_at, expires_at, revoked_at, evidence_document_id, notes, created_at")
    .maybeSingle();
  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "You don't have permission to change that consent." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Consent not found" }, { status: 404 });

  // Which story this belongs to, for the ledger entry.
  const { data: subject } = await supabase
    .from("story_subjects")
    .select("story_id")
    .eq("id", before.story_subject_id as string)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  const revoking = update.revoked_at != null && before.revoked_at == null;
  await audit(req, {
    action: revoking ? "comms.consent.revoke" : "comms.consent.update",
    entityType: "story",
    entityId: (subject?.story_id as string) ?? null,
    before: {
      consent_id: before.id,
      scope: before.scope,
      granted_at: before.granted_at,
      expires_at: before.expires_at,
      revoked_at: before.revoked_at,
    },
    after: { consent_id: data.id, ...update },
  });
  return NextResponse.json({ ok: true, consent: data });
}

// ── DELETE /api/admin/comms/consents/[id] ───────────────────────────────────
// For a row entered by mistake. Withdrawing real permission is a REVOKE
// (PATCH { revoke: true }), which leaves the record standing — deleting it
// would erase the evidence that permission ever existed, which is exactly what
// you want to keep.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const { data: deleted, error } = await supabase
    .from("story_consents")
    .delete()
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("id, story_subject_id, scope");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (deleted ?? []) as Array<{ id: string; story_subject_id: string; scope: string[] }>;
  if (rows.length === 0) return NextResponse.json({ error: "Consent not found" }, { status: 404 });

  const { data: subject } = await supabase
    .from("story_subjects")
    .select("story_id")
    .eq("id", rows[0].story_subject_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  await audit(req, {
    action: "comms.consent.delete",
    entityType: "story",
    entityId: (subject?.story_id as string) ?? null,
    before: { consent_id: rows[0].id, scope: rows[0].scope },
  });
  return NextResponse.json({ ok: true });
}
