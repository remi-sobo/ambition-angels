import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { isTaskCategory } from "@/app/admin/ops/_types/ops";

// POST /api/admin/meetings/[id]/suggestions — accept or dismiss a staged
// follow-up. Accepting inserts a real ops_task (linked to the donor/partner AND
// carrying meeting_record_id for the coverage join) and flips the meeting to
// has_follow_up. Reed never creates a live task silently — this is the human gate.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const suggestionId = typeof body?.suggestion_id === "string" ? body.suggestion_id : "";
  const action = body?.action;
  if (!suggestionId || (action !== "accept" && action !== "dismiss")) {
    return NextResponse.json({ error: "suggestion_id and action ('accept'|'dismiss') required" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: sugg } = await sb
    .from("meeting_suggested_tasks")
    .select("*")
    .eq("id", suggestionId)
    .eq("meeting_record_id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!sugg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const s = sugg as {
    id: string;
    suggested_title: string;
    suggested_category: string | null;
    suggested_entity_type: "partner" | "constituent" | null;
    suggested_entity_id: string | null;
    status: string;
  };

  if (action === "dismiss") {
    await sb
      .from("meeting_suggested_tasks")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("org_id", ctx.orgId)
      .eq("id", s.id);
    return NextResponse.json({ ok: true });
  }

  // accept → create the linked task
  if (s.status === "accepted") {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }
  const createdBy = (await getAdminUser()) ?? "admin";
  const category = isTaskCategory(s.suggested_category) ? s.suggested_category : "other";

  // Resolve a display label for the linked entity, if any.
  let linkedLabel: string | null = null;
  if (s.suggested_entity_type && s.suggested_entity_id) {
    if (s.suggested_entity_type === "partner") {
      const { data } = await sb.from("partners").select("name").eq("org_id", ctx.orgId).eq("id", s.suggested_entity_id).maybeSingle();
      linkedLabel = (data as { name: string | null } | null)?.name ?? null;
    } else {
      const { data } = await sb
        .from("constituents")
        .select("type, first_name, last_name, org_name")
        .eq("org_id", ctx.orgId)
        .eq("id", s.suggested_entity_id)
        .maybeSingle();
      const c = data as { type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
      if (c) linkedLabel = c.type === "organization" ? c.org_name : [c.first_name, c.last_name].filter(Boolean).join(" ");
    }
  }

  const { error: insErr } = await sb.from("ops_tasks").insert({
    org_id: ctx.orgId,
    title: s.suggested_title,
    category,
    created_by: createdBy,
    meeting_record_id: params.id,
    linked_entity_type: s.suggested_entity_type,
    linked_entity_id: s.suggested_entity_id,
    linked_label: linkedLabel,
  });
  if (insErr) {
    console.error("[meetings/:id/suggestions accept] task insert failed:", insErr.message);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }

  await sb
    .from("meeting_suggested_tasks")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("org_id", ctx.orgId)
    .eq("id", s.id);
  await sb
    .from("meeting_records")
    .update({ follow_up_status: "has_follow_up", updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("org_id", ctx.orgId);

  return NextResponse.json({ ok: true });
}
