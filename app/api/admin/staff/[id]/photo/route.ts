import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const BUCKET = "staff-photos";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// POST /api/admin/staff/:id/photo — set a staff member's photo.
// multipart/form-data: file (required, image, <=5MB).
//
// Unlike the asks/report upload routes, this runs entirely on the SESSION client
// — the staff-photos bucket ships with storage RLS (see bloomos_staff_phase1.sql)
// so the user's own JWT is allowed to write their folder, and no service-role
// client touches staff data. (The audit() ledger below is the one exception: it
// is the append-only FERPA compliance log, not a staff-data read/write, and every
// mutation route writes to it.)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Load the row (RLS gates visibility to staff.read holders in this org).
  const { data: staff } = await supabase
    .from("staff")
    .select("id, org_id, user_id, photo_path")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!staff) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  // Authorize the write: staff.write admins edit anyone; a person edits their own
  // photo. (Storage RLS + the self-guard trigger enforce this at the DB too; this
  // is the clean-error layer.)
  const canWrite = await hasPermission(supabase, ctx.orgId, "staff.write");
  const isSelf = staff.user_id === ctx.userId;
  if (!canWrite && !isSelf) {
    return NextResponse.json({ error: "You can't edit this photo." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 5 MB)." }, { status: 400 });
  }
  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type — use PNG, JPEG, WebP, or GIF." },
      { status: 400 }
    );
  }

  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${staff.org_id}/${staff.id}/photo-${Date.now()}-${rand}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[staff/photo] upload failed:", upErr.message);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  const prevPath = (staff as { photo_path: string | null }).photo_path;
  const { error: updErr } = await supabase
    .from("staff")
    .update({ photo_path: path })
    .eq("id", staff.id);
  if (updErr) {
    // Roll back the orphaned object so the bucket doesn't drift from the row.
    await supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Best-effort cleanup of the previous photo (ignore failure).
  if (prevPath && prevPath !== path) {
    await supabase.storage.from(BUCKET).remove([prevPath]);
  }

  await audit(req, {
    action: "staff.photo.update",
    entityType: "staff",
    entityId: staff.id,
    after: { photo_path: path },
  });

  return NextResponse.json({ ok: true });
}
