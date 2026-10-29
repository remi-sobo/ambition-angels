import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { resolveUserHandle } from "@/lib/admin/ops/identity";
import { thisMonday } from "@/lib/admin/ops/week";
import {
  buildCommitRows,
  candidatePrepEventIds,
  lightWeekReason,
  LIGHT_WEEK_REASON_MIN,
  type CommitTask,
} from "@/lib/admin/ops/commitments";
import { buildCloseStats, deriveOutcome, type Outcome } from "@/lib/admin/ops/close";

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
    .select("id, title, status, planned_day, calendar_event_id, labels, estimated_minutes")
    .eq("org_id", ctx.orgId)
    .eq("planned_week", weekOf)
    .is("archived_at", null)
    .or(mineFilter);
  const rows = (planned ?? []) as Array<CommitTask & { status: string }>;
  const stats: Record<string, unknown> = buildStats(kind as Kind, rows);

  // Light-week guard (Weekly Plan v2, PR 3): committing nothing is allowed,
  // but only on purpose. The reason rides stats, so no column change.
  const openTasks = rows.filter((r) => r.status !== "done");
  if (kind === "monday_plan") {
    const reason = lightWeekReason(openTasks.length, body?.light_week_reason);
    if (reason === undefined) {
      return NextResponse.json(
        {
          error: `Nothing is planned this week. Add a reason (at least ${LIGHT_WEEK_REASON_MIN} characters) to commit an intentionally light week.`,
          code: "light_week_reason_required",
        },
        { status: 400 }
      );
    }
    if (reason) stats.light_week_reason = reason;
  }

  // Friday Close against the Monday commit (Weekly Plan v2, PR 4): settle an
  // outcome on every committed row before the session is written, so a
  // failure leaves the week un-closed rather than closed without outcomes.
  if (kind === "friday_close") {
    const settled = await settleOutcomes(supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      weekOf,
      plannedThisWeekIds: rows.map((r) => r.id),
    });
    if (!settled.ok) {
      console.error("[/api/admin/ops/rhythm POST] outcome settle failed:", settled.error);
      return NextResponse.json({ error: "Failed to record the week's outcomes" }, { status: 500 });
    }
    if (settled.stats) Object.assign(stats, settled.stats);
  }

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

  // Monday Plan: freeze what was committed (Weekly Plan v2, PR 3).
  if (kind === "monday_plan") {
    const snap = await writeCommitments(supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      sessionId: (data as { id: string }).id,
      weekOf,
      tasks: openTasks,
    });
    if (!snap.ok) {
      // Never show a commit that didn't record: put the session back to
      // in_progress so the screen doesn't claim "Committed", and say so.
      await supabase
        .from("rhythm_sessions")
        .update({ status: "in_progress", completed_at: null })
        .eq("id", (data as { id: string }).id);
      console.error("[/api/admin/ops/rhythm POST] commitments write failed:", snap.error);
      return NextResponse.json({ error: "Failed to record the week's commitments" }, { status: 500 });
    }
  }

  return NextResponse.json({ session: data });
}

/**
 * Write the week_commitments snapshot for a monday_plan session. Re-commit
 * replaces the set under the same session: upsert first, then prune rows no
 * longer committed, so a failure halfway leaves stale extras, never an empty
 * snapshot. Session client: RLS (ops.write + own rows) decides.
 */
async function writeCommitments(
  supabase: ReturnType<typeof createServerSupabase>,
  args: { orgId: string; userId: string; sessionId: string; weekOf: string; tasks: CommitTask[] }
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { orgId, userId, sessionId, weekOf, tasks } = args;
  const taskIds = tasks.map((t) => t.id);

  const workBlockByTask = new Map<string, string>();
  if (taskIds.length > 0) {
    const { data: links, error } = await supabase
      .from("work_block_tasks")
      .select("task_id, block_id")
      .eq("org_id", orgId)
      .in("task_id", taskIds);
    if (error) return { ok: false, error: error.message };
    for (const l of (links ?? []) as Array<{ task_id: string; block_id: string }>) {
      workBlockByTask.set(l.task_id, l.block_id);
    }
  }

  const knownEventIds = new Set<string>();
  const prepIds = candidatePrepEventIds(tasks);
  if (prepIds.length > 0) {
    const { data: evs, error } = await supabase
      .from("calendar_events")
      .select("id")
      .eq("org_id", orgId)
      .in("id", prepIds);
    if (error) return { ok: false, error: error.message };
    for (const e of (evs ?? []) as Array<{ id: string }>) knownEventIds.add(e.id);
  }

  const commitRows = buildCommitRows(tasks, {
    orgId,
    userId,
    sessionId,
    weekOf,
    workBlockByTask,
    knownEventIds,
  });

  if (commitRows.length > 0) {
    const { error } = await supabase
      .from("week_commitments")
      .upsert(commitRows, { onConflict: "session_id,task_id" });
    if (error) return { ok: false, error: error.message };
  }

  // Prune: rows from an earlier commit of this session that aren't in this one
  // (and rows whose task has since been deleted).
  let prune = supabase.from("week_commitments").delete().eq("session_id", sessionId);
  if (taskIds.length > 0) {
    prune = prune.or(`task_id.is.null,task_id.not.in.(${taskIds.join(",")})`);
  }
  const { error: pruneErr } = await prune;
  if (pruneErr) return { ok: false, error: pruneErr.message };

  return { ok: true, count: commitRows.length };
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

/**
 * Give every committed row of this week's Monday Plan its outcome, derived
 * from its task (lib/admin/ops/close.ts), and return the close stats. Rows
 * whose stored outcome already matches are left alone, so re-closing only
 * touches what changed. No Monday commit → nothing to settle, no stats.
 */
async function settleOutcomes(
  supabase: ReturnType<typeof createServerSupabase>,
  args: { orgId: string; userId: string; weekOf: string; plannedThisWeekIds: string[] }
): Promise<{ ok: true; stats: ReturnType<typeof buildCloseStats> | null } | { ok: false; error: string }> {
  const { orgId, userId, weekOf, plannedThisWeekIds } = args;
  const { data: sess, error: sessErr } = await supabase
    .from("rhythm_sessions")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("kind", "monday_plan")
    .eq("week_of", weekOf)
    .eq("status", "completed")
    .maybeSingle();
  if (sessErr) return { ok: false, error: sessErr.message };
  if (!sess) return { ok: true, stats: null };

  const { data: rowsData, error: rowsErr } = await supabase
    .from("week_commitments")
    .select("id, task_id, outcome")
    .eq("org_id", orgId)
    .eq("session_id", sess.id as string)
    .eq("decision", "commit");
  if (rowsErr) return { ok: false, error: rowsErr.message };
  const rows = (rowsData ?? []) as Array<{ id: string; task_id: string | null; outcome: Outcome | null }>;
  if (rows.length === 0) return { ok: true, stats: null };

  const taskIds = rows.map((r) => r.task_id).filter((x): x is string => !!x);
  const tasks = new Map<string, { status: string; archived_at: string | null; planned_week: string | null }>();
  if (taskIds.length > 0) {
    const { data: tData, error: tErr } = await supabase
      .from("ops_tasks")
      .select("id, status, archived_at, planned_week")
      .eq("org_id", orgId)
      .in("id", taskIds);
    if (tErr) return { ok: false, error: tErr.message };
    for (const t of (tData ?? []) as Array<{
      id: string;
      status: string;
      archived_at: string | null;
      planned_week: string | null;
    }>) {
      tasks.set(t.id, t);
    }
  }

  const derived = rows.map((r) => ({
    id: r.id,
    stored: r.outcome,
    outcome: deriveOutcome(r.task_id ? tasks.get(r.task_id) ?? null : null, weekOf, r.outcome),
  }));

  // One update per outcome value, only for rows that change.
  const nowISO = new Date().toISOString();
  const byOutcome = new Map<Outcome, string[]>();
  for (const d of derived) {
    if (d.stored === d.outcome) continue;
    const list = byOutcome.get(d.outcome) ?? [];
    list.push(d.id);
    byOutcome.set(d.outcome, list);
  }
  for (const [outcome, ids] of Array.from(byOutcome.entries())) {
    const { error } = await supabase
      .from("week_commitments")
      .update({ outcome, outcome_at: nowISO })
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .in("id", ids);
    if (error) return { ok: false, error: error.message };
  }

  const committed = new Set(taskIds);
  const addedMidweek = plannedThisWeekIds.filter((id) => !committed.has(id)).length;
  return {
    ok: true,
    stats: buildCloseStats(
      derived.map((d) => d.outcome),
      addedMidweek
    ),
  };
}
