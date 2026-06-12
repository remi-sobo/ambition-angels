import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const MEMBER_STATUSES = ["enrolled", "completed", "dropped"] as const;
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isUuid(body?.student_id)) {
    return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("cohort_members")
    .upsert(
      { cohort_id: params.id, student_id: body!.student_id, status: "enrolled" },
      { onConflict: "cohort_id,student_id" }
    )
    .select("id")
    .single();
  if (error || !data) {
    console.error("Add cohort member failed:", error?.message);
    return NextResponse.json({ error: "Add failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.cohort.enroll",
    entityType: "cohort_member",
    entityId: data.id,
    after: { cohort_id: params.id, student_id: body!.student_id },
  });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isUuid(body?.student_id)) {
    return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  }
  if (!MEMBER_STATUSES.includes(body?.status as (typeof MEMBER_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("cohort_members").select("*")
    .eq("cohort_id", params.id).eq("student_id", body!.student_id as string)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("cohort_members")
    .update({ status: body!.status })
    .eq("id", before.id);
  if (error) {
    console.error("Update cohort member failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.cohort.member_status",
    entityType: "cohort_member",
    entityId: before.id,
    before,
    after: { status: body!.status },
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
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isUuid(body?.student_id)) {
    return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("cohort_members").select("*")
    .eq("cohort_id", params.id).eq("student_id", body!.student_id as string)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("cohort_members").delete().eq("id", before.id);
  if (error) {
    console.error("Remove cohort member failed:", error.message);
    return NextResponse.json({ error: "Remove failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.cohort.unenroll",
    entityType: "cohort_member",
    entityId: before.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
