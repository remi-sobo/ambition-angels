import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getBoardContext } from "@/lib/board/auth";
import { DOCUMENTS_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/documents/config";

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Open a board document.
 *
 * The RLS read comes FIRST and is the whole security model: the storage_path
 * is fetched through the session client, so a director only ever gets a URL
 * for a row her board.read permission can actually see. That is the carve-out
 * in documents_schema.sql — org-visible documents linked to a board meeting,
 * plus the governance library. Restricted documents (HR files, donor notes)
 * are excluded by construction, not by a flag someone might forget.
 *
 * The signed URL is minted per request and never stored, so a link forwarded
 * out of the portal dies within its TTL.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    console.error("[board documents] sign failed:", error?.message);
    return NextResponse.json({ error: "Could not open the file." }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
