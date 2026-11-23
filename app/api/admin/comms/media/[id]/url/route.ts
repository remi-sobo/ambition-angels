import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";

/**
 * Redirect to a short-lived signed URL for one story photo.
 *
 * V4 Stage D: requirePermission("comms.manage") first, then the row is read
 * on the service-role client pinned to the caller's org, so a URL is only ever
 * minted for a photo in that org. The URL is minted per request and never stored; a leaked link dies with
 * its TTL.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const BUCKET = "comms-media";
// Not exported: Next only allows its own reserved fields as route exports.
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const supabase = getSupabaseAdmin();

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
