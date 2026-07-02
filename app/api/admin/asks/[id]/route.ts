import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { findOrCreateFunder } from "@/lib/fundraising/grants";
import { isAskForm, isAskStatus } from "@/lib/fundraising/asks";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// PATCH /api/admin/asks/:id — partial update. Funder stays required: a uuid
// links an existing constituent, a name find-or-creates one, but it can never
// be cleared.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = createServerSupabase();
  const update: Record<string, unknown> = {};

  if ("form" in body && isAskForm(body.form)) update.form = body.form;
  if ("status" in body && isAskStatus(body.status)) update.status = body.status;

  if ("title" in body) {
    const v = body.title;
    update.title = v === null || v === "" ? null : typeof v === "string" ? v.trim().slice(0, 200) : undefined;
    if (update.title === undefined) delete update.title;
  }
  if ("amount_requested" in body) {
    if (body.amount_requested === null) update.amount_requested = null;
    else if (typeof body.amount_requested === "number" && body.amount_requested >= 0)
      update.amount_requested = Math.round(body.amount_requested * 100) / 100;
  }
  if ("amount_committed" in body) {
    if (body.amount_committed === null) update.amount_committed = null;
    else if (typeof body.amount_committed === "number" && body.amount_committed >= 0)
      update.amount_committed = Math.round(body.amount_committed * 100) / 100;
  }
  if ("ask_date" in body) {
    if (body.ask_date === null || body.ask_date === "") update.ask_date = null;
    else if (isISODate(body.ask_date)) update.ask_date = body.ask_date;
  }
  if ("decided_on" in body) {
    if (body.decided_on === null || body.decided_on === "") update.decided_on = null;
    else if (isISODate(body.decided_on)) update.decided_on = body.decided_on;
  }
  if ("owner" in body) {
    const v = body.owner;
    if (v === null || v === "") update.owner = null;
    else if (typeof v === "string") update.owner = v.trim().slice(0, 200) || null;
  }
  if ("notes" in body) {
    const v = body.notes;
    if (v === null || v === "") update.notes = null;
    else if (typeof v === "string") update.notes = v.slice(0, 4000);
  }
  if ("grant_id" in body) {
    if (body.grant_id === null || body.grant_id === "") update.grant_id = null;
    else if (isUuid(body.grant_id)) update.grant_id = body.grant_id;
  }
  if ("opportunity_id" in body) {
    if (body.opportunity_id === null || body.opportunity_id === "") update.opportunity_id = null;
    else if (isUuid(body.opportunity_id)) update.opportunity_id = body.opportunity_id;
  }

  // Funder can be re-pointed but never cleared.
  if (isUuid(body.funder_id)) {
    update.funder_id = body.funder_id;
  } else if ("funder_name" in body) {
    const funderName = typeof body.funder_name === "string" ? body.funder_name.trim() : "";
    if (funderName) {
      const funder = await findOrCreateFunder(supabase, funderName);
      if ("error" in funder) return NextResponse.json({ error: funder.error }, { status: 500 });
      update.funder_id = funder.id;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("asks")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Ask not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.ask.update",
    entityType: "asks",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true, ask: data });
}

// DELETE /api/admin/asks/:id — remove the ask. ask_documents rows cascade in
// Postgres; the storage objects are best-effort cleaned so the bucket doesn't
// accumulate orphans.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createServerSupabase();

  // Grab the document paths before the cascade removes the rows.
  const { data: docs } = await supabase
    .from("ask_documents")
    .select("storage_path")
    .eq("ask_id", params.id);

  const { data: deleted, error } = await supabase
    .from("asks")
    .delete()
    .eq("id", params.id)
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const paths = ((docs ?? []) as Array<{ storage_path: string }>).map((d) => d.storage_path);
  if (paths.length > 0) {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { error: rmErr } = await getSupabaseAdmin().storage.from("bloomos-asks").remove(paths);
    if (rmErr) console.error("[asks] storage cleanup on delete failed:", rmErr.message);
  }

  if (deleted && deleted.length > 0) {
    await audit(req, {
      action: "fundraising.ask.delete",
      entityType: "asks",
      entityId: params.id,
      before: deleted[0],
    });
  }
  return NextResponse.json({ ok: true });
}
