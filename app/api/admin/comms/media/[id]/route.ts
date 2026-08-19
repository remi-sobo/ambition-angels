import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";

/** Remove a photo from a story: the row first (RLS is the gate), then the
 *  object, so nothing is orphaned in the bucket. */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const BUCKET = "comms-media";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const { data: deleted, error } = await supabase
    .from("story_media")
    .delete()
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("story_id, storage_path");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (deleted ?? []) as Array<{ story_id: string; storage_path: string }>;
  if (rows.length === 0) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([rows[0].storage_path]);
  if (rmErr) console.error("[comms] media object removal failed:", rmErr.message);

  await audit(req, {
    action: "comms.media.delete",
    entityType: "story",
    entityId: rows[0].story_id,
    before: { media_id: params.id },
  });
  return NextResponse.json({ ok: true });
}
