import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { isAckChannel, isAckSubjectType } from "@/lib/fundraising/ack-channels";

// Acknowledgments v2 — the template library. Named, channel-specific templates
// with merge tokens ({{first_name}}) and one default per subject_type+channel.
// The compliance receipt block is NOT part of a template; it stays system-
// generated and is appended at send time, never editable here.

// GET /api/admin/fundraising/ack-templates — list, optional ?subject_type & ?channel.
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const supabase = createServerSupabase();
  let q = supabase
    .from("ack_templates")
    .select("id, name, subject_type, channel, subject, body, is_default, applies_when, updated_at")
    .order("subject_type")
    .order("channel")
    .order("name");

  const subjectType = url.searchParams.get("subject_type");
  if (isAckSubjectType(subjectType)) q = q.eq("subject_type", subjectType);
  const channel = url.searchParams.get("channel");
  if (isAckChannel(channel)) q = q.eq("channel", channel);

  const { data, error } = await q;
  if (error) {
    console.error("[ack-templates GET]", error.message);
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
  }
  return NextResponse.json({ templates: data ?? [] });
}

// POST /api/admin/fundraising/ack-templates — create a template.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const subjectType = isAckSubjectType(body.subject_type) ? body.subject_type : "gift";
  const channel = isAckChannel(body.channel) ? body.channel : "email";
  const isDefault = body.is_default === true;

  const insert = {
    org_id: ctx.orgId,
    name,
    subject_type: subjectType,
    channel,
    subject: typeof body.subject === "string" ? body.subject.slice(0, 200) : null,
    body: typeof body.body === "string" ? body.body : "",
    is_default: isDefault,
  };

  const supabase = createServerSupabase();
  // At most one default per (subject_type, channel) — clear the prior default
  // before claiming it, so the unique partial index never rejects the insert.
  if (isDefault) {
    await supabase
      .from("ack_templates")
      .update({ is_default: false })
      .eq("org_id", ctx.orgId)
      .eq("subject_type", subjectType)
      .eq("channel", channel)
      .eq("is_default", true);
  }

  const { data, error } = await supabase.from("ack_templates").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[ack-templates POST]", error?.message);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.ack_template.create",
    entityType: "ack_templates",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
