import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { mondayOf } from "@/lib/admin/ops/week";

/**
 * Create a meeting-prep task (Operating Rhythm v2, Phase 5). On the Monday day
 * walk, accepting prep for an upcoming meeting drops a task onto that meeting's
 * day, placed before it. Deduped by a `prep:<event_id>` label so accepting prep
 * twice for the same meeting can't pile up duplicates (server-guarded). Session
 * client → RLS enforces ops.write; org_id from session, never a default.
 */

function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const createdBy = (await getAdminUser()) ?? "admin";

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.event_id === "string" ? body.event_id : "";
  const day = body?.day;
  const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
  if (!eventId || !isISODate(day)) {
    return NextResponse.json({ error: "event_id and a valid day are required" }, { status: 400 });
  }

  const label = `prep:${eventId}`;
  const sb = createServerSupabase();

  // Guard: one prep task per meeting.
  const { data: existing } = await sb
    .from("ops_tasks")
    .select("id")
    .eq("org_id", ctx.orgId)
    .contains("labels", [label])
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, alreadyExists: true });

  const { data, error } = await sb
    .from("ops_tasks")
    .insert({
      org_id: ctx.orgId,
      title: `Prep: ${rawTitle || "meeting"}`.slice(0, 200),
      category: "other",
      created_by: createdBy,
      due_date: day,
      planned_day: day,
      planned_week: mondayOf(day),
      pinned_for_this_week: true,
      labels: [label, "prep"],
    })
    .select("id")
    .single();
  if (error) {
    console.error("[/api/admin/ops/prep POST] insert failed:", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Failed to create prep task" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, task_id: (data as { id: string }).id });
}
