import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// PATCH (pause / resume) and DELETE a journey. Delete cascades steps +
// enrollments.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.status !== "active" && body?.status !== "paused") {
    return NextResponse.json({ error: "status must be active or paused" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("journeys").update({ status: body.status }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(req, { action: "fundraising.journey.update", entityType: "journeys", entityId: params.id, after: { status: body.status } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 400 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase.from("journeys").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(req, { action: "fundraising.journey.delete", entityType: "journeys", entityId: params.id });
  return NextResponse.json({ ok: true });
}
