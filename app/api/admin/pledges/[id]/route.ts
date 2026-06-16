import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const STATUSES = ["active", "completed", "cancelled"] as const;

// PATCH (status / notes) and DELETE a pledge. Delete cascades to its payments;
// any gifts already linked to fulfilled payments stay on the spine (revenue is
// real), with their gift_id reference nulled by the FK.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) update.status = body.status;
  if (typeof body.notes === "string") update.notes = body.notes.slice(0, 2000) || null;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("pledges").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.pledge.update",
    entityType: "pledges",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase.from("pledges").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.pledge.delete",
    entityType: "pledges",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
