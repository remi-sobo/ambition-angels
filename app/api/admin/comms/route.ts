import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Epic I — create an email campaign draft against a saved segment.
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body : "";
  if (!name || !subject) return NextResponse.json({ error: "name and subject are required" }, { status: 400 });
  if (!text.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const insert: Record<string, unknown> = {
    name, subject, body: text.slice(0, 20000), status: "draft",
    created_by: (await getAdminUser()) ?? null,
  };
  if (isUuid(body.segment_id)) insert.segment_id = body.segment_id;

  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("email_campaigns").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[comms] create failed:", error?.message);
    return NextResponse.json({ error: "Could not create campaign" }, { status: 500 });
  }

  await audit(req, { action: "fundraising.campaign_email.create", entityType: "email_campaigns", entityId: data.id, after: { name, subject } });
  return NextResponse.json({ id: data.id });
}
