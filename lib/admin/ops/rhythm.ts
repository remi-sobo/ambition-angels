import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAgenda } from "@/lib/agenda/service";
import { isWorkday, projectOwnEvents, summarizeOwnWeek } from "@/lib/agenda/own-events";
import { getCalendarPrefs } from "@/lib/agenda/prefs";
import { resolveUserHandle, type ResolvedUser } from "./identity";
import { thisMonday, nextMonday, dayStartInstant, weekDays } from "./week";
import type { MondayCounts, FridayCounts } from "./statusLine";

/**
 * Server-side counts for the "My Week" hub status (Operating Rhythm v2,
 * Phase 2). Deterministic reads only — the status sentence is assembled from
 * these numbers by lib/admin/ops/status.ts. Service-role client for the
 * ops_tasks/meeting reads, ALWAYS org-scoped (the house trap); the calendar
 * read goes through the session client (RLS) via getAgenda, exactly like the
 * Monday Plan page.
 */

// The pure mode split lives in rhythmMode.ts (Spec Work W1); imported for
// the snapshot loader below and re-exported so existing importers keep one
// path.
import { rhythmModeForToday, type RhythmMode } from "./rhythmMode";
export { rhythmModeForToday, type RhythmMode };

export type RhythmSnapshot =
  | { mode: "monday_plan"; weekOf: string; who: ResolvedUser; counts: MondayCounts }
  | { mode: "friday_close"; weekOf: string; who: ResolvedUser; counts: FridayCounts };

/** Load the status snapshot for the time-appropriate mode, or null if unauthed. */
export async function loadRhythmSnapshot(
  mode: RhythmMode = rhythmModeForToday()
): Promise<RhythmSnapshot | null> {
  const who = await resolveUserHandle();
  if (!who) return null;

  const mondayISO = thisMonday();
  const sb = getSupabaseAdmin();
  const mineFilter = `assigned_to.eq.${who.handle},assigned_to.is.null`;

  if (mode === "monday_plan") {
    const [openRes, carriedRes] = await Promise.all([
      // All open tasks that are mine — drives "N open across M areas".
      sb
        .from("ops_tasks")
        .select("category")
        .eq("org_id", who.orgId)
        .neq("status", "done")
        .is("archived_at", null)
        .or(mineFilter),
      // Planned for an earlier week and still open — the rollover deck.
      sb
        .from("ops_tasks")
        .select("id", { count: "exact", head: true })
        .eq("org_id", who.orgId)
        .lt("planned_week", mondayISO)
        .neq("status", "done")
        .is("archived_at", null)
        .or(mineFilter),
    ]);

    const openRows = (openRes.data as Array<{ category: string }> | null) ?? [];
    const areas = new Set(openRows.map((r) => r.category)).size;

    const { meetingMin, openMin } = await calendarShape(who, mondayISO);

    const counts: MondayCounts = {
      open: openRows.length,
      areas,
      carriedOver: carriedRes.count ?? 0,
      meetingMin,
      openMin,
    };
    return { mode, weekOf: mondayISO, who, counts };
  }

  // friday_close
  const weekStartInstant = dayStartInstant(mondayISO);
  const [plannedRes, followUpRes] = await Promise.all([
    sb
      .from("ops_tasks")
      .select("status")
      .eq("org_id", who.orgId)
      .eq("planned_week", mondayISO)
      .is("archived_at", null)
      .or(mineFilter),
    // This-week meetings still needing follow-up are mine by owner_user_id.
    sb
      .from("meeting_records")
      .select("id", { count: "exact", head: true })
      .eq("org_id", who.orgId)
      .eq("owner_user_id", who.userId)
      .eq("follow_up_status", "needs_follow_up")
      .gte("occurred_at", weekStartInstant)
      .lt("occurred_at", dayStartInstant(nextMonday())),
  ]);

  const plannedRows = (plannedRes.data as Array<{ status: string }> | null) ?? [];
  const done = plannedRows.filter((r) => r.status === "done").length;

  // Time accounting (Calendar & Time Blocking, Phase 6): the week's drawn
  // blocks and whether their tasks closed. Zero blocks keeps the classic line.
  let blockedHours = 0;
  let blockTasksTotal = 0;
  let blockTasksDone = 0;
  const { data: blockRows } = await sb
    .from("work_blocks")
    .select("id, duration_minute")
    .eq("org_id", who.orgId)
    .eq("owner_user_id", who.userId)
    .gte("day", mondayISO)
    .lt("day", nextMonday());
  const blocks = (blockRows ?? []) as Array<{ id: string; duration_minute: number }>;
  if (blocks.length > 0) {
    blockedHours = Math.round(blocks.reduce((sum, b) => sum + b.duration_minute, 0) / 60);
    const { data: linkRows } = await sb
      .from("work_block_tasks")
      .select("task_id, ops_tasks(status)")
      .in(
        "block_id",
        blocks.map((b) => b.id)
      );
    for (const l of linkRows ?? []) {
      const t = (Array.isArray(l.ops_tasks) ? l.ops_tasks[0] : l.ops_tasks) as {
        status: string;
      } | null;
      if (!t) continue;
      blockTasksTotal += 1;
      if (t.status === "done") blockTasksDone += 1;
    }
  }

  // Against the Monday commit (Weekly Plan v2, PR 4), when there is one.
  const commit = await committedProgress(sb, who, mondayISO);

  const counts: FridayCounts = {
    ...(commit ?? {}),
    planned: plannedRows.length,
    done,
    open: plannedRows.length - done,
    followUpsNeeded: followUpRes.count ?? 0,
    blockedHours,
    blockTasksTotal,
    blockTasksDone,
  };
  return { mode, weekOf: mondayISO, who, counts };
}

/**
 * This week's meeting and open minutes for the viewer, through the same
 * projection and summary as the week grid (lib/agenda/own-events.ts), so the
 * status line and the grid always agree for the same user and week. Working
 * hours come from calendar_prefs (9 to 5 when unset); the viewer's own work
 * blocks count as busy, exactly as on the grid.
 *
 * Calendar read through the session client (RLS) like the Monday page; blocks
 * on the service-role client, org- and owner-scoped. Degrades to a calm shape
 * (no meetings, the full working week open) if the calendar can't be read, so
 * the hub never looks broken.
 */
async function calendarShape(
  who: ResolvedUser,
  mondayISO: string
): Promise<{ meetingMin: number; openMin: number }> {
  const days = weekDays(mondayISO);
  const prefs = await getCalendarPrefs(who.userId);
  try {
    const [agenda, blockRes] = await Promise.all([
      getAgenda({
        start: new Date(dayStartInstant(mondayISO)),
        end: new Date(dayStartInstant(nextMonday())),
      }),
      getSupabaseAdmin()
        .from("work_blocks")
        .select("day, start_minute, duration_minute")
        .eq("org_id", who.orgId)
        .eq("owner_user_id", who.userId)
        .gte("day", days[0])
        .lte("day", days[6]),
    ]);
    const { timed } = projectOwnEvents(agenda.items, {
      ownerUserId: who.userId,
      isSelf: true,
      days,
    });
    const blocks = (
      (blockRes.data ?? []) as Array<{ day: string; start_minute: number; duration_minute: number }>
    ).map((b) => ({
      day: b.day,
      startMin: b.start_minute,
      endMin: Math.min(1440, b.start_minute + b.duration_minute),
    }));
    const summary = summarizeOwnWeek({
      days,
      timed,
      blocks,
      prefs,
      blockTasksTotal: 0,
      blockTasksDone: 0,
    });
    return { meetingMin: summary.meetingMin, openMin: summary.openMin };
  } catch (e) {
    console.error("[rhythm] calendar read failed:", e);
    const workdays = days.filter(isWorkday).length;
    return {
      meetingMin: 0,
      openMin: Math.max(0, prefs.dayEndMinute - prefs.dayStartMinute) * workdays,
    };
  }
}

/**
 * How many of this week's committed tasks are done, or null without a Monday
 * commit. Service-role reads, org- and owner-scoped like the rest of the
 * snapshot. "Done" is the task's live status, the same rule Close uses.
 */
async function committedProgress(
  sb: ReturnType<typeof getSupabaseAdmin>,
  who: ResolvedUser,
  mondayISO: string
): Promise<{ committed: number; committedDone: number } | null> {
  const { data: sess } = await sb
    .from("rhythm_sessions")
    .select("id")
    .eq("org_id", who.orgId)
    .eq("user_id", who.userId)
    .eq("kind", "monday_plan")
    .eq("week_of", mondayISO)
    .eq("status", "completed")
    .maybeSingle();
  if (!sess?.id) return null;
  const { data: rows } = await sb
    .from("week_commitments")
    .select("task_id")
    .eq("org_id", who.orgId)
    .eq("session_id", sess.id as string)
    .eq("decision", "commit");
  const ids = ((rows ?? []) as Array<{ task_id: string | null }>)
    .map((r) => r.task_id)
    .filter((x): x is string => !!x);
  const committed = (rows ?? []).length;
  if (committed === 0) return null;
  let committedDone = 0;
  if (ids.length > 0) {
    const { count } = await sb
      .from("ops_tasks")
      .select("id", { count: "exact", head: true })
      .eq("org_id", who.orgId)
      .in("id", ids)
      .eq("status", "done");
    committedDone = count ?? 0;
  }
  return { committed, committedDone };
}
