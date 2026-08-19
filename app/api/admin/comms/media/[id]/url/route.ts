import { NextRequest, NextResponse } from "next/server";
import { requireComms } from "@/lib/comms/stories-server";

/**
 * Redirect to a short-lived signed URL for one story photo.
 *
 * The RLS check comes FIRST: the storage_path is read through the session
 * client, so a caller only ever gets a URL for a row they can already see. The
 * signing also runs on the session client — comms-media has its own storage
 * RLS, so a caller without comms.manage cannot mint a URL even with a path in
 * hand. The URL is minted per request and never stored; a leaked link dies with
 * its TTL.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const BUCKET = "comms-media";
export const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const { data: media } = await supabase
    .from("story_media")
    .select("storage_path")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!media) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl((media as { storage_path: string }).storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    console.error("[comms] media sign failed:", error?.message);
    return NextResponse.json({ error: "Could not open that photo." }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
