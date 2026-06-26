import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { resolveUserHandle } from "@/lib/admin/ops/identity";
import { thisMonday } from "@/lib/admin/ops/week";

/**
 * Commit a weekly rhythm run — writes the rhythm_sessions artifact (Operating
 * Rhythm v2). One row per (org, user, kind, week), upserted, so re-committing
 * the same week updates rather than duplicates. The session client enforces RLS
 * (ops.write on rhythm_sessions); org_id/user_id come from the session context,
 * never a default (the house trap stays dead). Stats are recomputed
 * server-side, not trusted from the client.
 */

type Kind = "monday_plan" | "friday_close";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.kind;
  if (kind !== "monday_plan" && kind !== "friday_close") {
    return NextResponse.json({ error: "kind must be monday_plan or friday_close" }, { status: 400 });
  }

  const me = await resolveUserHandle();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekOf = thisMonday();
  const supabase = createServerSupabase();
  const mineFilter = `assigned_to.eq.${me.handle},assigned_to.is.null`;

  // Authoritative stats: this week's planned tasks (mine), by disposition.
  const { data: planned } = await supabase
    .from("ops_tasks")
    .select("status, planned_day, calendar_event_id")
    .eq("org_id", ctx.orgId)
    .eq("planned_week", weekOf)
    .or(mineFilter);
  const rows = (planned ?? []) as Array<{
    status: string;
    planned_day: string | null;
    calendar_event_id: string | null;
  }>;
  const stats = buildStats(kind as Kind, rows);

  const checklist =
    body?.checklist && typeof body.checklist === "object" && !Array.isArray(body.checklist)
      ? (body.checklist as Record<string, unknown>)
      : {};

  const nowISO = new Date().toISOString();
  const row = {
    org_id: ctx.orgId,
    user_id: ctx.userId,
    kind,
    week_of: weekOf,
    status: "completed",
    stats,
    checklist,
    notes: typeof body?.notes === "string" ? body.notes : null,
    completed_at: nowISO,
    updated_at: nowISO,
  };

  const { data, error } = await supabase
    .from("rhythm_sessions")
    .upsert(row, { onConflict: "org_id,user_id,kind,week_of" })
    .select()
    .single();
  if (error) {
    console.error("[/api/admin/ops/rhythm POST] error:", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Failed to write session" }, { status: 500 });
  }
  return NextResponse.json({ session: data });
}

function buildStats(
  kind: Kind,
  rows: Array<{ status: string; planned_day: string | null; calendar_event_id: string | null }>
) {
  const planned = rows.length;
  const done = rows.filter((r) => r.status === "done").length;
  if (kind === "monday_plan") {
    return {
      planned,
      placed: rows.filter((r) => r.planned_day).length,
      scheduled: rows.filter((r) => r.calendar_event_id).length,
      done,
    };
  }
  return { planned, done, open: planned - done };
}
