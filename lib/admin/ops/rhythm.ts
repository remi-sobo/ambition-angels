import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAgenda } from "@/lib/agenda/service";
import { resolveUserHandle, type ResolvedUser } from "./identity";
import {
  thisMonday,
  nextMonday,
  dayStartInstant,
  laDateOf,
  weekdayIndex,
} from "./week";
import type { MondayCounts, FridayCounts } from "./statusLine";

/**
 * Server-side counts for the "My Week" hub status (Operating Rhythm v2,
 * Phase 2). Deterministic reads only — the status sentence is assembled from
 * these numbers by lib/admin/ops/status.ts. Service-role client for the
 * ops_tasks/meeting reads, ALWAYS org-scoped (the house trap); the calendar
 * read goes through the session client (RLS) via getAgenda, exactly like the
 * Monday Plan page.
 */

export type RhythmMode = "monday_plan" | "friday_close";

/** Mon–Wed lights Plan; Thu–Sun lights Close. dow: 0=Sun … 6=Sat. */
export function rhythmModeForToday(dow: number = weekdayIndex()): RhythmMode {
  return dow >= 1 && dow <= 3 ? "monday_plan" : "friday_close";
}

// Working window used for the (approximate) open-hours figure. Precise
// open-block computation against real busy gaps lands with the day walk (P5);
// here we just need a defensible number for the status, hence the "~".
const WORK_HOURS_PER_DAY = 8; // 9–5
const WORK_DAYS = 5; // Mon–Fri
const WORK_HOURS_PER_WEEK = WORK_HOURS_PER_DAY * WORK_DAYS;

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

    const { meetings, openHours } = await calendarShape(mondayISO);

    const counts: MondayCounts = {
      open: openRows.length,
      areas,
      carriedOver: carriedRes.count ?? 0,
      meetings,
      openHours,
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
  const counts: FridayCounts = {
    planned: plannedRows.length,
    done,
    open: plannedRows.length - done,
    followUpsNeeded: followUpRes.count ?? 0,
  };
  return { mode, weekOf: mondayISO, who, counts };
}

/**
 * Meetings booked this week + an approximate open-hours figure, read through the
 * session client (RLS) like the Monday page. Degrades to a calm shape if the
 * calendar can't be read (no connection / sync lag) so the hub never looks
 * broken — the day walk surfaces the real "connect your calendar" state.
 */
async function calendarShape(mondayISO: string): Promise<{ meetings: number; openHours: number }> {
  try {
    const agenda = await getAgenda({
      start: new Date(dayStartInstant(mondayISO)),
      end: new Date(dayStartInstant(nextMonday())),
    });
    let meetings = 0;
    const busyByDay = new Map<string, number>(); // dayISO → busy hours, capped per day
    for (const it of agenda.items) {
      if (it.allDay) continue;
      meetings += 1;
      if (!it.end) continue;
      const dow = weekdayIndex(laDateOf(it.start));
      if (dow < 1 || dow > 5) continue; // only weekday working hours count toward openness
      const hrs = (new Date(it.end).getTime() - new Date(it.start).getTime()) / 3_600_000;
      if (hrs <= 0) continue;
      const dayISO = laDateOf(it.start);
      busyByDay.set(dayISO, Math.min(WORK_HOURS_PER_DAY, (busyByDay.get(dayISO) ?? 0) + hrs));
    }
    let busy = 0;
    busyByDay.forEach((h) => (busy += h));
    const openHours = Math.max(0, Math.round(WORK_HOURS_PER_WEEK - busy));
    return { meetings, openHours };
  } catch (e) {
    console.error("[rhythm] calendar read failed:", e);
    return { meetings: 0, openHours: WORK_HOURS_PER_WEEK };
  }
}
