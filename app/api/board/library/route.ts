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
 * File a document into the board library — a corporate record that belongs to
 * the organization rather than to any one meeting.
 *
 * This is the meeting materials route with the link half removed. A library
 * document is precisely one with no document_links row: /board/library reads
 * every active, org-visible document, and the meeting page reads only those
 * linked to it, so omitting the link is what makes this the library.
 *
 * Same two invariants the materials route enforces, for the same reasons:
 *  - visibility is always 'org'. The board carve-out in documents_schema.sql
 *    excludes restricted documents, so a restricted upload would be invisible
 *    to every director with no error anywhere to explain it.
 *  - doc_type must be one of DOC_TYPES, which is what the library groups on.
 *
 * board_admin only (board.write). In this org that is Remi and Shannon; the
 * directors hold board.read alone and cannot reach this route.
 */
export async function POST(req: NextRequest) {
  const ctx = await getBoardContext();
  if (!ctx?.isAdmin) {
    return NextResponse.json({ error: "Only the board admins can file documents." }, { status: 403 });
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
      : "policy";
  const title =
    typeof rawTitle === "string" && rawTitle.trim()
      ? rawTitle.trim().slice(0, 200)
      : file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 200);

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
    console.error("[board library] upload failed:", upErr.message);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  // Written through the session client, so RLS is the authority on whether
  // this caller may add a document to this org.
  const supabase = createServerSupabase();
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
    console.error("[board library] documents insert failed:", docErr.message);
    return NextResponse.json({ error: "Could not save the document record." }, { status: 500 });
  }

  await audit(req, {
    action: "board.library_filed",
    entityType: "document",
    entityId: documentId,
    actorUserId: null,
    after: { title, doc_type: docType, document_id: documentId },
  });

  return NextResponse.json({ ok: true, document: { id: documentId, title, doc_type: docType } });
}
