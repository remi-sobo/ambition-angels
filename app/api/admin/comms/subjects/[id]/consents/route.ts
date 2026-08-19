import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";
import { CONSENT_SCOPES, isConsentScope } from "@/lib/comms/consent";

/**
 * Record consent for a subject (specs/comms-module.md §6.1, §7.3).
 *
 * Two shapes land here and both are real:
 *   requested_at only — "I emailed Mom the draft and the photo, waiting to
 *                        hear back." That is PENDING, and pending never
 *                        publishes.
 *   granted_at       — a signed release, a blanket intake form, or a reply
 *                       saying yes.
 *
 * Consent on a participant subject is readable and writable only under
 * comms.subjects.read; RLS enforces it through the parent subject's type, and
 * a policy refusal comes back here as a 403.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const scope = Array.isArray(body.scope) ? body.scope.filter(isConsentScope) : [];
  if (scope.length === 0) {
    return NextResponse.json(
      { error: `Pick at least one scope (${CONSENT_SCOPES.join(", ")}).` },
      { status: 400 },
    );
  }

  for (const field of ["requested_at", "granted_at", "expires_at"] as const) {
    const v = body[field];
    if (v != null && v !== "" && !isISODate(v)) {
      return NextResponse.json({ error: `${field} must be YYYY-MM-DD` }, { status: 400 });
    }
  }
  const requestedAt = isISODate(body.requested_at) ? body.requested_at : null;
  const grantedAt = isISODate(body.granted_at) ? body.granted_at : null;
  if (!requestedAt && !grantedAt) {
    return NextResponse.json(
      { error: "Record either when you asked (requested_at) or when it was granted (granted_at)." },
      { status: 400 },
    );
  }
  if (grantedAt && typeof body.granted_by !== "string") {
    return NextResponse.json(
      { error: "granted_by is required — who gave permission?" },
      { status: 400 },
    );
  }

  // The subject must be visible to this caller. For a participant that means
  // holding comms.subjects.read; RLS makes the row invisible otherwise, and
  // "not found" is the honest thing to say.
  const { data: subject } = await supabase
    .from("story_subjects")
    .select("id, story_id, subject_type")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });

  if (body.evidence_document_id != null && body.evidence_document_id !== "") {
    if (!isUuid(body.evidence_document_id)) {
      return NextResponse.json({ error: "Invalid evidence_document_id" }, { status: 400 });
    }
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", body.evidence_document_id)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!doc) return NextResponse.json({ error: "Evidence document not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("story_consents")
    .insert({
      org_id: ctx.orgId,
      story_subject_id: params.id,
      scope,
      requested_at: requestedAt,
      granted_by: grantedAt ? (body.granted_by as string).trim().slice(0, 200) : null,
      granted_at: grantedAt,
      expires_at: isISODate(body.expires_at) ? body.expires_at : null,
      evidence_document_id: isUuid(body.evidence_document_id) ? body.evidence_document_id : null,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null,
    })
    .select("id, scope, requested_at, granted_by, granted_at, expires_at, revoked_at, evidence_document_id, notes, created_at")
    .single();

  if (error || !data) {
    if (error?.code === "42501") {
      return NextResponse.json(
        { error: "You don't have permission to record consent for that person." },
        { status: 403 },
      );
    }
    console.error("[comms] consent create failed:", error?.message);
    return NextResponse.json({ error: "Could not record that consent" }, { status: 500 });
  }

  await audit(req, {
    action: grantedAt ? "comms.consent.grant" : "comms.consent.request",
    entityType: "story",
    entityId: subject.story_id as string,
    after: {
      consent_id: data.id,
      scope,
      granted_at: grantedAt,
      expires_at: data.expires_at,
      has_evidence: !!data.evidence_document_id,
    },
  });
  return NextResponse.json({ ok: true, consent: data });
}
