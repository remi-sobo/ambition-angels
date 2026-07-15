import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { DOCUMENTS_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/documents/config";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// GET /api/admin/documents/[id]/url — redirect to a short-lived signed URL.
// The RLS check comes FIRST: the storage_path is read through the session
// client, so the caller only ever gets a URL for a row they can see (org
// scoping, restricted visibility, and the board carve-out all apply). The
// signed URL is minted per request and never stored — a leaked link dies
// within its TTL.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: signed, error } = await getSupabaseAdmin()
    .storage.from(DOCUMENTS_BUCKET)
    .createSignedUrl((doc as { storage_path: string }).storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    console.error("[documents] sign failed:", error?.message);
    return NextResponse.json({ error: "Could not open the file." }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
