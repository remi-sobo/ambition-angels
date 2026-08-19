import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";
import {
  hasImageMetadata,
  isAllowedMediaMime,
  MAX_MEDIA_BYTES,
  MEDIA_EXT_BY_MIME,
  mediaStoragePath,
  safeMediaFilename,
  stripImageMetadata,
  UnsupportedImageError,
} from "@/lib/comms/media";

/**
 * Attach a photo to a story (specs/comms-module.md §6.1, Phase 2).
 *
 * The order here is the whole point: validate, then STRIP, then upload the
 * stripped bytes. The original file never reaches storage, so there is no
 * window in which a photo of a minor sits in a bucket with its GPS intact and
 * no cleanup job to run later.
 *
 * Everything runs on the SESSION client, including the storage write — the
 * comms-media bucket ships with its own RLS keyed on comms.manage and the org
 * id in the path's first segment (comms_phase2_storage.sql), so the story bank
 * never needs the service-role client to move a photo.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const BUCKET = "comms-media";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A photo is required." }, { status: 400 });
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json(
      { error: `That photo is too large (max ${Math.round(MAX_MEDIA_BYTES / (1024 * 1024))} MB).` },
      { status: 400 },
    );
  }
  if (!isAllowedMediaMime(file.type)) {
    return NextResponse.json(
      { error: "Upload a JPEG or PNG. Other formats carry metadata we can't safely strip yet." },
      { status: 400 },
    );
  }

  // The story must exist in this org and be visible to the caller.
  const { data: story } = await supabase
    .from("stories")
    .select("id")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

  // ── Strip before anything is written ──────────────────────────────────────
  const original = new Uint8Array(await file.arrayBuffer());
  let cleaned: Uint8Array;
  try {
    cleaned = stripImageMetadata(original, file.type);
  } catch (e) {
    if (e instanceof UnsupportedImageError) {
      // Fail closed. An image we could not parse is an image we cannot promise
      // is clean, so it does not get stored.
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
  // Belt and braces: if a marker we mean to remove is somehow still there, stop.
  if (hasImageMetadata(cleaned, file.type)) {
    console.error("[comms] metadata survived stripping — refusing the upload");
    return NextResponse.json(
      { error: "We couldn't remove the location data from that photo, so it wasn't saved." },
      { status: 400 },
    );
  }

  const ext = MEDIA_EXT_BY_MIME[file.type];
  const base = safeMediaFilename(file.name);
  const filename = base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
  // A per-upload prefix keeps two photos with the same camera filename apart.
  const path = mediaStoragePath(ctx.orgId, params.id, `${randomUUID().slice(0, 8)}-${filename}`);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, cleaned, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[comms] media upload failed:", upErr.message);
    return NextResponse.json({ error: "Could not save that photo." }, { status: 500 });
  }

  const caption = form.get("caption");
  const { data, error } = await supabase
    .from("story_media")
    .insert({
      org_id: ctx.orgId,
      story_id: params.id,
      storage_path: path,
      mime: file.type,
      size_bytes: cleaned.byteLength,
      caption: typeof caption === "string" && caption.trim() ? caption.trim().slice(0, 500) : null,
      kind: "photo",
    })
    .select("id, storage_path, mime, size_bytes, caption, kind, created_at")
    .single();

  if (error || !data) {
    // Roll the object back so a failed row can't leave an orphan in the bucket.
    await supabase.storage.from(BUCKET).remove([path]);
    console.error("[comms] media row insert failed:", error?.message);
    return NextResponse.json({ error: "Could not save that photo." }, { status: 500 });
  }

  await audit(req, {
    action: "comms.media.upload",
    entityType: "story",
    entityId: params.id,
    after: {
      media_id: data.id,
      mime: file.type,
      original_bytes: original.byteLength,
      stored_bytes: cleaned.byteLength,
      metadata_stripped: original.byteLength !== cleaned.byteLength,
    },
  });
  return NextResponse.json({ ok: true, media: data });
}
