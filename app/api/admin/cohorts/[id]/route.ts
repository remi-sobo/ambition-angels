import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STATUSES = ["planning", "active", "completed", "archived"] as const;
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) update.status = body.status;
  for (const f of ["name", "program", "term", "location", "notes"] as const) {
    if (f in body) {
      if (body[f] === null || body[f] === "") {
        if (f !== "name") update[f] = null;
      } else if (typeof body[f] === "string") {
        update[f] = (body[f] as string).trim().slice(0, f === "notes" ? 2000 : 160);
      }
    }
  }
  for (const f of ["start_date", "end_date"] as const) {
    if (f in body) {
      if (body[f] === null || body[f] === "") update[f] = null;
      else if (isISODate(body[f])) update[f] = body[f];
    }
  }
  if (typeof body.accepting_applications === "boolean")
    update.accepting_applications = body.accepting_applications;
  if ("capacity" in body) {
    if (body.capacity === null || body.capacity === "") update.capacity = null;
    else {
      const n = Number(body.capacity);
      if (Number.isInteger(n) && n > 0 && n <= 10_000) update.capacity = n;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("cohorts").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("cohorts").update(update).eq("id", params.id);
  if (error) {
    console.error("Update cohort failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.cohort.update",
    entityType: "cohort",
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
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("cohorts").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("cohorts").delete().eq("id", params.id);
  if (error) {
    console.error("Delete cohort failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.cohort.delete",
    entityType: "cohort",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
