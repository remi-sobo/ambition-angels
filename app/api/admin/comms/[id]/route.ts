import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// PATCH a draft (edit) / DELETE a campaign. Sent campaigns are immutable.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: c } = await supabase.from("email_campaigns").select("status").eq("id", params.id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (c.status !== "draft") return NextResponse.json({ error: "Only drafts can be edited" }, { status: 409 });

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.subject === "string" && body.subject.trim()) update.subject = body.subject.trim();
  if (typeof body.body === "string") update.body = body.body.slice(0, 20000);
  if (isUuid(String(body.segment_id))) update.segment_id = body.segment_id;
  if (body.segment_id === null) update.segment_id = null;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const { error } = await supabase.from("email_campaigns").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(req, { action: "fundraising.campaign_email.update", entityType: "email_campaigns", entityId: params.id, after: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase.from("email_campaigns").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(req, { action: "fundraising.campaign_email.delete", entityType: "email_campaigns", entityId: params.id });
  return NextResponse.json({ ok: true });
}
