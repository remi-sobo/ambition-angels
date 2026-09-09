import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getBoardContext } from "@/lib/board/auth";
import { audit } from "@/lib/audit";
import {
  DOCUMENTS_BUCKET,
  DOC_EXT_BY_MIME,
  DOC_TYPES,
  MAX_DOC_BYTES,
  safeFilename,
} from "@/lib/documents/config";

/**
 * File a document against a meeting — upload and link in one step.
 *
 * This exists because /admin/documents cannot do the second half. Its upload
 * modal sends only a doc_type, and `board_meeting` is not in the documents
 * API's entity link map, so a file uploaded there lands in the library and
 * never reaches the meeting page. The portal reads materials through
 * document_links(entity_type='board_meeting'), so the link IS the feature.
 *
 * Two things that fail silently if they are left to a human, enforced here:
 *  - visibility is always 'org'. The board carve-out in documents_schema.sql
 *    deliberately excludes restricted documents, so a restricted upload is
 *    invisible to every director with no error anywhere to explain it.
 *  - doc_type must be one of DOC_TYPES; the column is validated app-side and
 *    an unknown value is rejected by the documents API elsewhere.
 *
 * board_admin only (board.write). A director can read materials; only the
 * people who author the meeting can file them.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx?.isAdmin) {
    return NextResponse.json({ error: "Only the board admins can file materials." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file first." }, { status: 400 });
  }
  if (file.size > MAX_DOC_BYTES) {
    return NextResponse.json(
      { error: `That file is larger than ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} MB.` },
      { status: 400 },
    );
  }
  const ext = DOC_EXT_BY_MIME[file.type];
  if (!ext) {
    return NextResponse.json({ error: `${file.type || "That file type"} is not accepted.` }, { status: 400 });
  }

  const rawTitle = form?.get("title");
  const rawType = form?.get("doc_type");
  const docType =
    typeof rawType === "string" && DOC_TYPES.includes(rawType as (typeof DOC_TYPES)[number])
      ? rawType
      : "board_packet";
  const title =
    typeof rawTitle === "string" && rawTitle.trim()
      ? rawTitle.trim().slice(0, 200)
      : file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 200);

  const supabase = createServerSupabase();

  // Prove the meeting exists in the caller's org before writing anything.
  // Read through the session client so RLS is the authority, not this filter.
  const { data: meeting } = await supabase
    .from("board_meetings")
    .select("id, title")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

  const documentId = randomUUID();
  const base = safeFilename(file.name);
  const name = base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
  // Same layout the documents API writes, so files filed here are
  // indistinguishable from files filed in /admin.
  const path = `${ctx.orgId}/${documentId}/${name}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await getSupabaseAdmin()
    .storage.from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[board materials] upload failed:", upErr.message);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  const { error: docErr } = await supabase.from("documents").insert({
    id: documentId,
    org_id: ctx.orgId,
    storage_path: path,
    filename: file.name.slice(0, 255) || name,
    mime: file.type,
    size_bytes: file.size,
    title,
    doc_type: docType,
    visibility: "org",
    status: "active",
  });
  if (docErr) {
    console.error("[board materials] documents insert failed:", docErr.message);
    return NextResponse.json({ error: "Could not save the document record." }, { status: 500 });
  }

  const { error: linkErr } = await supabase.from("document_links").insert({
    org_id: ctx.orgId,
    document_id: documentId,
    entity_type: "board_meeting",
    entity_id: meeting.id,
  });
  if (linkErr) {
    console.error("[board materials] link failed:", linkErr.message);
    return NextResponse.json({ error: "Uploaded, but could not attach it to the meeting." }, { status: 500 });
  }

  await audit(req, {
    action: "board.material_filed",
    entityType: "board_meeting",
    entityId: meeting.id,
    actorUserId: null,
    after: { title, doc_type: docType, document_id: documentId },
  });

  return NextResponse.json({ ok: true, document: { id: documentId, title, doc_type: docType } });
}
