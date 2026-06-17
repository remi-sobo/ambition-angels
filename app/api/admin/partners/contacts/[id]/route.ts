import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("partner_contacts").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  for (const f of ["first_name", "last_name", "title", "phone", "notes"] as const) {
    if (f in body) {
      if (body[f] === null || body[f] === "") update[f] = null;
      else if (typeof body[f] === "string")
        update[f] = (body[f] as string).trim().slice(0, f === "notes" ? 2000 : 120);
    }
  }
  if ("email" in body) {
    if (body.email === null || body.email === "") update.email = null;
    else if (typeof body.email === "string" && body.email.includes("@"))
      update.email = body.email.trim().toLowerCase().slice(0, 200);
  }
  if (Array.isArray(body.tags))
    update.tags = (body.tags as unknown[])
      .filter((t): t is string => typeof t === "string" && !!t.trim())
      .map((t) => t.trim().slice(0, 40))
      .slice(0, 12);
  if ("last_touch_at" in body) {
    if (body.last_touch_at === null || body.last_touch_at === "") update.last_touch_at = null;
    else if (isISODate(body.last_touch_at)) update.last_touch_at = body.last_touch_at;
  }
  if (body.touch === true) update.last_touch_at = new Date().toISOString().slice(0, 10);

  // Making a contact primary demotes the others on the same org.
  if (body.is_primary === true) {
    await supabase.from("partner_contacts")
      .update({ is_primary: false })
      .eq("partner_id", before.partner_id);
    update.is_primary = true;
  } else if (body.is_primary === false) {
    update.is_primary = false;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await supabase.from("partner_contacts").update(update).eq("id", params.id);
  if (error) {
    console.error("Update partner contact failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.partner_contact.update",
    entityType: "partner_contact",
    entityId: params.id,
    before,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("partner_contacts").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("partner_contacts").delete().eq("id", params.id);
  if (error) {
    console.error("Delete partner contact failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.partner_contact.delete",
    entityType: "partner_contact",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
