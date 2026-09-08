import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getBoardContext } from "@/lib/board/auth";
import { DOCUMENTS_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/documents/config";

/**
 * The signed minutes — the record of file.
 *
 * Distinct from the generated PDF on purpose (spec §5.9): a director reads the
 * HTML minutes, an auditor wants the copy the Secretary physically signed.
 * Shannon uploads it in /admin after the Secretary signs, which sets
 * minutes.signed_pdf_path.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("minutes")
    .select("signed_pdf_path")
    .eq("meeting_id", params.id)
    .maybeSingle();

  const path = (data as { signed_pdf_path: string | null } | null)?.signed_pdf_path;
  if (!path) return NextResponse.json({ error: "No signed record filed yet" }, { status: 404 });

  const { data: signed, error } = await getSupabaseAdmin()
    .storage.from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not open the signed record." }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
