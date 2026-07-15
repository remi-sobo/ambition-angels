import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { DOC_TYPES, DOCUMENTS_BUCKET } from "@/lib/documents/config";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ── PATCH /api/admin/documents/[id] — metadata edits ────────────────────────
// title, doc_type, expires_at, visibility, status (active|archived). All via
// the session client: documents.write RLS is the authority.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if ("title" in body) {
    const v = body.title;
    if (v === null || v === "") update.title = null;
    else if (typeof v === "string") update.title = v.trim().slice(0, 200);
  }
  if ("doc_type" in body) {
    const v = body.doc_type;
    if (v === null || v === "") update.doc_type = null;
    else if (DOC_TYPES.includes(v as (typeof DOC_TYPES)[number])) update.doc_type = v;
    else return NextResponse.json({ error: "Unknown doc_type" }, { status: 400 });
  }
  if ("expires_at" in body) {
    const v = body.expires_at;
    if (v === null || v === "") update.expires_at = null;
    else if (isISODate(v)) update.expires_at = v;
    else return NextResponse.json({ error: "expires_at must be YYYY-MM-DD" }, { status: 400 });
  }
  if ("visibility" in body) {
    if (body.visibility !== "org" && body.visibility !== "restricted") {
      return NextResponse.json({ error: "visibility must be org or restricted" }, { status: 400 });
    }
    update.visibility = body.visibility;
  }
  if ("status" in body) {
    if (body.status !== "active" && body.status !== "archived") {
      return NextResponse.json({ error: "status must be active or archived" }, { status: 400 });
    }
    update.status = body.status;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("documents")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await audit(req, {
    action: "documents.update",
    entityType: "document",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true, document: data });
}

// ── DELETE /api/admin/documents/[id] ────────────────────────────────────────
// Row first (session client — documents.delete RLS is the gate; links cascade),
// then the storage object, so no orphan remains in the bucket.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: deleted, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", params.id)
    .select("storage_path, filename");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (deleted ?? []) as Array<{ storage_path: string; filename: string }>;
  if (rows.length === 0) {
    // Nothing visible/deletable under RLS — not found as far as the caller knows.
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { error: rmErr } = await getSupabaseAdmin()
    .storage.from(DOCUMENTS_BUCKET)
    .remove([rows[0].storage_path]);
  if (rmErr) console.error("[documents] object removal failed:", rmErr.message);

  await audit(req, {
    action: "documents.delete",
    entityType: "document",
    entityId: params.id,
    before: { filename: rows[0].filename },
  });
  return NextResponse.json({ ok: true });
}
