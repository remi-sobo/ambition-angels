import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { entityTableFor } from "@/lib/admin/entities";
import { audit } from "@/lib/audit";
import {
  MAX_DOC_BYTES,
  DOC_EXT_BY_MIME,
  isAllowedDocMime,
  DOC_TYPES,
  DOCUMENTS_BUCKET,
  EXPIRING_WINDOW_DAYS,
  safeFilename,
} from "@/lib/documents/config";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ── GET /api/admin/documents ────────────────────────────────────────────────
// List documents through the SESSION client, so RLS scopes rows to the
// caller's org and permission set (including the board carve-out). Filters:
//   entity_type + entity_id — documents linked to one record (attach control)
//   doc_type, status, q (title/filename), expiring=1 (within the window)
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerSupabase();
  const sp = req.nextUrl.searchParams;

  let ids: string[] | null = null;
  const entityType = sp.get("entity_type");
  const entityId = sp.get("entity_id");
  if (entityType && entityId) {
    if (!isUuid(entityId)) return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
    const { data: links, error } = await supabase
      .from("document_links")
      .select("document_id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ids = (links ?? []).map((l) => l.document_id as string);
    if (ids.length === 0) return NextResponse.json({ documents: [] });
  }

  let q = supabase
    .from("documents")
    .select(
      "id, filename, mime, size_bytes, title, doc_type, status, visibility, version, expires_at, uploaded_by, created_at, document_links(id, entity_type, entity_id)",
    )
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (ids) q = q.in("id", ids);
  const status = sp.get("status");
  q = status ? q.eq("status", status) : q.neq("status", "superseded");
  const docType = sp.get("doc_type");
  if (docType) q = q.eq("doc_type", docType);
  const owner = sp.get("owner");
  if (isUuid(owner)) q = q.eq("uploaded_by", owner);
  const text = sp.get("q");
  if (text && text.trim()) {
    const like = `%${text.trim().replaceAll("%", "").replaceAll(",", " ")}%`;
    q = q.or(`title.ilike.${like},filename.ilike.${like}`);
  }
  if (sp.get("expiring") === "1") {
    const cutoff = new Date(Date.now() + EXPIRING_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    q = q.not("expires_at", "is", null).lte("expires_at", cutoff).eq("status", "active");
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

// ── POST /api/admin/documents ───────────────────────────────────────────────
// Upload. multipart/form-data: file (required); title?, doc_type?,
// expires_at?, visibility?; entity_type? + entity_id? (auto-link context from
// the record page the upload started on).
//
// Mirrors the bloomos-asks pattern: validation happens BEFORE any write, the
// bytes go to the private bucket via the service role, the metadata row goes
// through the session client so RLS is the authority, and a failed row insert
// rolls the object back. Path: {org_id}/{document_id}/{safe_filename}.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Fail fast before touching storage; RLS on the insert re-asserts this.
  if (!(await ctxHasPermission(ctx, "documents.write"))) {
    return NextResponse.json({ error: "You don't have permission to upload documents." }, { status: 403 });
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
  if (file.size > MAX_DOC_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${Math.round(MAX_DOC_BYTES / (1024 * 1024))} MB).` },
      { status: 400 },
    );
  }
  if (!isAllowedDocMime(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type — upload a PDF, Office document, CSV, text, or image." },
      { status: 400 },
    );
  }

  const title = form.get("title");
  const docType = form.get("doc_type");
  const expiresAt = form.get("expires_at");
  const visibility = form.get("visibility");
  const entityType = form.get("entity_type");
  const entityId = form.get("entity_id");
  if (docType && !DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
    return NextResponse.json({ error: "Unknown doc_type" }, { status: 400 });
  }
  if (expiresAt && !isISODate(expiresAt)) {
    return NextResponse.json({ error: "expires_at must be YYYY-MM-DD" }, { status: 400 });
  }
  if (visibility && visibility !== "org" && visibility !== "restricted") {
    return NextResponse.json({ error: "visibility must be org or restricted" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Auto-link context: validate the target BEFORE any write (spec Appendix B).
  // Reading the target through the session client proves both that it exists
  // and that it lives in the caller's org — RLS hides everything else.
  let link: { entity_type: string; entity_id: string } | null = null;
  if (entityType || entityId) {
    if (typeof entityType !== "string" || !isUuid(entityId)) {
      return NextResponse.json({ error: "entity_type and a valid entity_id are required to link" }, { status: 400 });
    }
    const table = entityTableFor(entityType);
    if (!table) return NextResponse.json({ error: `Cannot link documents to "${entityType}"` }, { status: 400 });
    const { data: target } = await supabase
      .from(table)
      .select("id")
      .eq("id", entityId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: "Link target not found" }, { status: 404 });
    link = { entity_type: entityType, entity_id: entityId };
  }

  const documentId = randomUUID();
  const ext = DOC_EXT_BY_MIME[file.type];
  const base = safeFilename(file.name);
  const name = base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
  const path = `${ctx.orgId}/${documentId}/${name}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[documents] upload failed:", upErr.message);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  const { data: doc, error: insErr } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      org_id: ctx.orgId, // from session — the table has no default, on purpose
      storage_path: path,
      filename: file.name.slice(0, 255) || name,
      mime: file.type,
      size_bytes: file.size,
      title: typeof title === "string" && title.trim() ? title.trim().slice(0, 200) : null,
      doc_type: typeof docType === "string" ? docType : null,
      expires_at: isISODate(expiresAt) ? expiresAt : null,
      visibility: visibility === "restricted" ? "restricted" : "org",
      uploaded_by: ctx.userId,
    })
    .select("*")
    .single();
  if (insErr || !doc) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]); // no orphaned object
    return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  if (link) {
    const { error: linkErr } = await supabase.from("document_links").insert({
      org_id: ctx.orgId,
      document_id: documentId,
      entity_type: link.entity_type,
      entity_id: link.entity_id,
      created_by: ctx.userId,
    });
    if (linkErr) {
      // Keep upload atomic: no half-attached document. Service role cleans up
      // both writes (staff lack documents.delete, and that's correct).
      await admin.from("documents").delete().eq("id", documentId);
      await admin.storage.from(DOCUMENTS_BUCKET).remove([path]);
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }
  }

  await audit(req, {
    action: "documents.upload",
    entityType: "document",
    entityId: documentId,
    after: { filename: doc.filename, linked_to: link },
  });
  return NextResponse.json({ ok: true, document: doc });
}
