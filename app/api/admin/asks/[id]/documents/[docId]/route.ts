import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const BUCKET = "bloomos-asks";
const SIGNED_URL_TTL = 60 * 5; // 5 minutes — long enough to open, short enough to not leak.

// GET /api/admin/asks/:id/documents/:docId — redirect to a short-lived signed
// URL for the file. The bucket is private, so we never hand out a public URL;
// each open mints a fresh signed link. RLS on ask_documents gates the lookup.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id) || !isUuid(params.docId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: doc } = await supabase
    .from("ask_documents")
    .select("storage_path")
    .eq("id", params.docId)
    .eq("ask_id", params.id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: signed, error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl((doc as { storage_path: string }).storage_path, SIGNED_URL_TTL);
  if (error || !signed?.signedUrl) {
    console.error("[asks/documents] sign failed:", error?.message);
    return NextResponse.json({ error: "Could not open the file." }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}

// DELETE /api/admin/asks/:id/documents/:docId — remove the row and the object.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id) || !isUuid(params.docId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: deleted, error } = await supabase
    .from("ask_documents")
    .delete()
    .eq("id", params.docId)
    .eq("ask_id", params.id)
    .select("storage_path");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (deleted ?? []) as Array<{ storage_path: string }>;
  if (rows.length > 0) {
    const { error: rmErr } = await getSupabaseAdmin()
      .storage.from(BUCKET)
      .remove([rows[0].storage_path]);
    if (rmErr) console.error("[asks/documents] object removal failed:", rmErr.message);
    await audit(req, {
      action: "fundraising.ask.document.delete",
      entityType: "asks",
      entityId: params.id,
      before: { document_id: params.docId },
    });
  }
  return NextResponse.json({ ok: true });
}
