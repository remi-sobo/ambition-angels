import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { isAckChannel, isAckSubjectType } from "@/lib/fundraising/ack-channels";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// PATCH /api/admin/fundraising/ack-templates/[id] — edit a template.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (isAckSubjectType(body.subject_type)) update.subject_type = body.subject_type;
  if (isAckChannel(body.channel)) update.channel = body.channel;
  if (typeof body.subject === "string") update.subject = body.subject.slice(0, 200) || null;
  if (typeof body.body === "string") update.body = body.body;
  if (typeof body.is_default === "boolean") update.is_default = body.is_default;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Setting this as default clears the prior default for the same slot. The
  // slot is whatever the row will be after this edit, so read it back first.
  if (update.is_default === true) {
    const { data: cur } = await supabase
      .from("ack_templates")
      .select("subject_type, channel")
      .eq("id", params.id)
      .maybeSingle();
    const subjectType = (update.subject_type as string | undefined) ?? cur?.subject_type;
    const channel = (update.channel as string | undefined) ?? cur?.channel;
    if (subjectType && channel) {
      await supabase
        .from("ack_templates")
        .update({ is_default: false })
        .eq("org_id", ctx.orgId)
        .eq("subject_type", subjectType)
        .eq("channel", channel)
        .eq("is_default", true)
        .neq("id", params.id);
    }
  }

  const { error } = await supabase.from("ack_templates").update(update).eq("id", params.id);
  if (error) {
    console.error("[ack-templates PATCH]", error.message);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.ack_template.update",
    entityType: "ack_templates",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/fundraising/ack-templates/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  // stewardship_rules.template_id is ON DELETE SET NULL, so a rule that used
  // this template falls back to its channel default rather than breaking.
  const supabase = createServerSupabase();
  const { error } = await supabase.from("ack_templates").delete().eq("id", params.id);
  if (error) {
    console.error("[ack-templates DELETE]", error.message);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.ack_template.delete",
    entityType: "ack_templates",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
