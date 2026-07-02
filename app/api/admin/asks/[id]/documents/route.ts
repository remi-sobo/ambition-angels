import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import {
  MAX_ASK_DOC_BYTES,
  ASK_DOC_EXT_BY_MIME,
  isAllowedAskDocMime,
} from "@/lib/fundraising/asks";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const BUCKET = "bloomos-asks";

// POST /api/admin/asks/:id/documents — attach a file (the proposal PDF, cover
// letter, budget) to an ask. multipart/form-data: file (required), label?.
// Bytes go to the private `bloomos-asks` bucket via the service-role client
// (storage RLS otherwise blocks it, same as the Report route); the metadata row
// carries only the path and is org-scoped from the ask it hangs off.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const user = await getAdminUser();

  // Confirm the ask exists and the caller can see it (RLS), and get its org.
  const supabase = createServerSupabase();
  const { data: ask, error: askErr } = await supabase
    .from("asks")
    .select("id, org_id")
    .eq("id", params.id)
    .maybeSingle();
  if (askErr) return NextResponse.json({ error: askErr.message }, { status: 500 });
  if (!ask) return NextResponse.json({ error: "Ask not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  const label = form.get("label");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (file.size > MAX_ASK_DOC_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${Math.round(MAX_ASK_DOC_BYTES / (1024 * 1024))} MB).` },
      { status: 400 }
    );
  }
  if (!isAllowedAskDocMime(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type — upload a PDF, Office document, or image." },
      { status: 400 }
    );
  }

  const ext = ASK_DOC_EXT_BY_MIME[file.type];
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `asks/${ask.id}/${Date.now()}-${rand}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[asks/documents] upload failed:", upErr.message);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  const insert = {
    org_id: ask.org_id,
    ask_id: ask.id,
    storage_path: path,
    filename: file.name.slice(0, 255) || `document.${ext}`,
    mime: file.type,
    size_bytes: file.size,
    label: typeof label === "string" && label.trim() ? label.trim().slice(0, 120) : null,
    uploaded_by: user,
  };
  const { data, error } = await supabase.from("ask_documents").insert(insert).select("*").single();
  if (error) {
    // Roll back the orphaned object so the bucket doesn't drift from the table.
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.ask.document.add",
    entityType: "asks",
    entityId: ask.id,
    after: { document_id: data.id, filename: insert.filename },
  });
  return NextResponse.json({ ok: true, document: data });
}
