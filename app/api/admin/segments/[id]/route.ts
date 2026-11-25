import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getOrgContext } from "@/lib/admin/auth";
import { storableDefinition } from "@/lib/fundraising/segments";
import { audit } from "@/lib/audit";

// Rename a list or change who is on it (Comms lists). Pinned to the active
// org: RLS alone would let a member of two orgs edit the other org's list.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    update.name = name;
  }
  if (body.definition !== undefined) {
    const cleaned = storableDefinition(body.definition);
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    update.definition = cleaned.definition;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: before } = await supabase.from("segments").select("id, name, definition").eq("org_id", ctx.orgId).eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: saved, error } = await supabase.from("segments").update(update).eq("org_id", ctx.orgId).eq("id", params.id).select("id");
  if (error) {
    console.error("Update segment failed:", error.message);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
  // RLS turns a write the role may not make into zero rows, not an error.
  if (!saved || saved.length === 0) {
    return NextResponse.json({ error: "Your role can't change lists." }, { status: 403 });
  }
  await audit(req, { action: "fundraising.segment.update", entityType: "segment", entityId: params.id, before, after: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createServerSupabase();
  const { data: before } = await supabase
    .from("segments")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("segments").delete().eq("id", params.id);
  if (error) {
    console.error("Delete segment failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "fundraising.segment.delete",
    entityType: "segment",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
