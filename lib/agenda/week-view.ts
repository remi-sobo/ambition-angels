import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OrgContext } from "@/lib/admin/auth";
import { getAgenda } from "@/lib/agenda/service";
import { getCalendarPrefs, type CalendarPrefs } from "@/lib/agenda/prefs";
import { getDisplayNames } from "@/lib/admin/profile";
import {
  addDays,
  dayStartInstant,
  laDateOf,
  weekDays,
  weekdayIndex,
} from "@/lib/admin/ops/week";
import { computeOpenBlocks, type Interval } from "@/lib/admin/ops/open-blocks";
import { computeWeekSummary, type WeekSummary } from "@/lib/agenda/week-summary";
import type {
  GridBlock,
  GridBlockTask,
  GridEvent,
  GridOpenGap,
} from "@/lib/agenda/week-grid";

/**
 * Server assembly for the week grid (/admin/calendar).
 *
 * Everything the grid renders is projected here into org-TZ minutes so the
 * client component never does timezone math. Reads go through the SESSION
 * client wherever RLS carries the access decision (events, blocks, checklists
 * — own, delegated, or a direct report's, all three arms live in the
 * policies); the service-role client appears only where RLS is deliberately
 * narrower than the product (the viewed owner's calendar_prefs, the staff
 * org-chart edges) and every such read is preceded by the visible-owner
 * assertion and scoped to ctx.orgId explicitly.
 */

export type CalendarOwner = {
  userId: string;
  name: string;
  relation: "self" | "delegate" | "report";
};

/** An open task as the fill-the-block picker consumes it. */
export type PickerTask = {
  id: string;
  title: string;
  priority: string;
  status: string;
  category: string;
  dueDate: string | null;
  projectId: string | null;
  plannedWeek: string | null;
  pinnedForThisWeek: boolean;
  /** Day (YYYY-MM-DD) of the block this task already sits on, if any. */
  homeDay: string | null;
  homeBlockId: string | null;
};

export type WeekViewData = {
  weekStart: string; // Monday YYYY-MM-DD
  days: string[]; // Mon..Sun
  todayISO: string;
  owner: CalendarOwner;
  owners: CalendarOwner[];
  prefs: CalendarPrefs;
  events: GridEvent[];
  allDayEvents: GridEvent[];
  blocks: GridBlock[];
  blockTasks: GridBlockTask[];
  openGaps: GridOpenGap[];
  summary: WeekSummary;
  syncedAt: string | null;
  /** Fill-the-block candidates + project titles — own view only, else empty. */
  openTasks: PickerTask[];
  projectNames: Record<string, string>;
  defaultBlockMinute: number;
};

/**
 * Who this viewer may open on the grid: themselves, anyone who delegated a
 * calendar to them, and their direct reports (staff.reports_to). Matches the
 * RLS arms on calendar_events / work_blocks, so the switcher never offers a
 * week the policies would return empty.
 */
export async function getCalendarOwners(ctx: OrgContext): Promise<CalendarOwner[]> {
  const session = createServerSupabase();
  const { data: grants } = await session
    .from("agenda_delegations")
    .select("grantor_user_id")
    .eq("org_id", ctx.orgId)
    .eq("grantee_user_id", ctx.userId);

  // Org-chart edges via service role (staff RLS is its own product surface),
  // explicitly org-scoped; only the ids leave this function.
  const admin = getSupabaseAdmin();
  const { data: me } = await admin
    .from("staff")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .maybeSingle();
  let reportIds: string[] = [];
  if (me?.id) {
    const { data: reports } = await admin
      .from("staff")
      .select("user_id")
      .eq("org_id", ctx.orgId)
      .eq("reports_to", me.id as string)
      .eq("status", "active")
      .not("user_id", "is", null);
    reportIds = (reports ?? []).map((r) => r.user_id as string);
  }

  const relations = new Map<string, CalendarOwner["relation"]>();
  relations.set(ctx.userId, "self");
  for (const g of grants ?? []) {
    const id = g.grantor_user_id as string;
    if (!relations.has(id)) relations.set(id, "delegate");
  }
  for (const id of reportIds) {
    if (!relations.has(id)) relations.set(id, "report");
  }

  const ids = Array.from(relations.keys());
  const names = await getDisplayNames(ids);
  return ids.map((userId) => ({
    userId,
    name: userId === ctx.userId ? "You" : names[userId] ?? "Teammate",
    relation: relations.get(userId)!,
  }));
}

/** Minutes from the day's org-TZ midnight for an instant, clamped to 0..1440. */
function minutesInto(dayISO: string, instantISO: string): number {
  const midnight = Date.parse(dayStartInstant(dayISO));
  return Math.max(0, Math.min(1440, Math.round((Date.parse(instantISO) - midnight) / 60_000)));
}

export async function getWeekView(args: {
  ctx: OrgContext;
  weekStart: string; // Monday YYYY-MM-DD
  ownerUserId: string;
  todayISO: string;
}): Promise<WeekViewData> {
  const { ctx, weekStart, ownerUserId, todayISO } = args;
  const owners = await getCalendarOwners(ctx);
  const owner =
    owners.find((o) => o.userId === ownerUserId) ??
    owners.find((o) => o.relation === "self")!;
  const isSelf = owner.relation === "self";

  const days = weekDays(weekStart);
  const daySet = new Set(days);
  const rangeStart = new Date(dayStartInstant(weekStart));
  const rangeEnd = new Date(dayStartInstant(addDays(weekStart, 7)));

  const prefs = await getCalendarPrefs(owner.userId);

  // Meetings: the delegation-aware agenda read, filtered to the viewed owner.
  // Bookings carry no owner (org-level /meet meetings) — they belong on the
  // viewer's own grid, not superimposed on a report's.
  const agenda = await getAgenda({ start: rangeStart, end: rangeEnd });
  const timed: GridEvent[] = [];
  const allDay: GridEvent[] = [];
  for (const item of agenda.items) {
    const mine = item.ownerUserId === owner.userId || (item.ownerUserId === null && isSelf);
    if (!mine) continue;
    if (item.source === "bloomos") continue; // block mirrors render from work_blocks
    const day = item.allDay ? item.start.slice(0, 10) : laDateOf(item.start);
    if (!daySet.has(day)) continue;
    const ev: GridEvent = {
      id: item.id,
      day,
      startMin: item.allDay ? 0 : minutesInto(day, item.start),
      endMin: item.allDay
        ? 1440
        : item.end
          ? minutesInto(day, item.end)
          : minutesInto(day, item.start) + 30,
      title: item.title,
      location: item.location,
      isExternal: item.isExternal,
      allDay: item.allDay,
      source: item.source,
    };
    if (ev.allDay) allDay.push(ev);
    else if (ev.endMin > ev.startMin) timed.push(ev);
  }

  // Work blocks + checklists via the session client — RLS's three arms decide.
  const session = createServerSupabase();
  const { data: blockRows } = await session
    .from("work_blocks")
    .select("id, day, start_minute, duration_minute, title, google_event_id")
    .eq("org_id", ctx.orgId)
    .eq("owner_user_id", owner.userId)
    .gte("day", days[0])
    .lte("day", days[6])
    .order("day")
    .order("start_minute");
  const blocks: GridBlock[] = (blockRows ?? []).map((b) => ({
    id: b.id as string,
    day: b.day as string,
    startMin: b.start_minute as number,
    endMin: Math.min(1440, (b.start_minute as number) + (b.duration_minute as number)),
    title: b.title as string,
    synced: !!b.google_event_id,
  }));

  let blockTasks: GridBlockTask[] = [];
  if (blocks.length > 0) {
    const { data: linkRows } = await session
      .from("work_block_tasks")
      .select(
        "id, block_id, task_id, position, ops_tasks(title, status, priority, due_date, project_id)"
      )
      .in(
        "block_id",
        blocks.map((b) => b.id)
      )
      .order("position");
    blockTasks = (linkRows ?? []).flatMap((r) => {
      const t = (Array.isArray(r.ops_tasks) ? r.ops_tasks[0] : r.ops_tasks) as {
        title: string;
        status: string;
        priority: string;
        due_date: string | null;
        project_id: string | null;
      } | null;
      if (!t) return [];
      return [
        {
          linkId: r.id as string,
          blockId: r.block_id as string,
          taskId: r.task_id as string,
          position: r.position as number,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.due_date,
          projectId: t.project_id,
        },
      ];
    });
  }

  // Open gaps per day: working hours minus meetings and blocks. Weekends are
  // not working days — blocks can still be drawn there, but nothing there
  // reads as "open time" (matches the planner and the rhythm math).
  const isWorkday = (day: string) => {
    const dow = weekdayIndex(day);
    return dow >= 1 && dow <= 5;
  };
  const openGaps: GridOpenGap[] = [];
  for (const day of days) {
    if (!isWorkday(day)) continue;
    const midnight = Date.parse(dayStartInstant(day));
    const busy: Interval[] = [
      ...timed
        .filter((e) => e.day === day)
        .map((e) => ({
          start: midnight + e.startMin * 60_000,
          end: midnight + e.endMin * 60_000,
        })),
      ...blocks
        .filter((b) => b.day === day)
        .map((b) => ({
          start: midnight + b.startMin * 60_000,
          end: midnight + b.endMin * 60_000,
        })),
    ];
    for (const gap of computeOpenBlocks(midnight, busy, {
      startMinute: prefs.dayStartMinute,
      endMinute: prefs.dayEndMinute,
    })) {
      openGaps.push({ day, startMin: gap.startMinute, endMin: gap.endMinute });
    }
  }

  // Fill-the-block candidates (own view only): the viewer's open tasks —
  // assigned to them or unassigned — with each task's current home block so
  // the picker can say "On Wed · moves here". Session client: ops.read RLS.
  let openTasks: PickerTask[] = [];
  let projectNames: Record<string, string> = {};
  if (isSelf) {
    const { data: handleRow } = await session
      .from("profiles")
      .select("display_name")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const handle = ((handleRow?.display_name as string | null) ?? ctx.email.split("@")[0] ?? "")
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();

    const { data: taskRows } = await session
      .from("ops_tasks")
      .select(
        "id, title, priority, status, category, due_date, project_id, planned_week, pinned_for_this_week"
      )
      .eq("org_id", ctx.orgId)
      .in("status", ["todo", "in_progress", "blocked"])
      .is("archived_at", null)
      .is("parent_id", null)
      .or(`assigned_to.eq.${handle},assigned_to.is.null`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(300);

    const candidateIds = (taskRows ?? []).map((t) => t.id as string);
    const homes = new Map<string, { day: string; blockId: string }>();
    if (candidateIds.length > 0) {
      const { data: homeRows } = await session
        .from("work_block_tasks")
        .select("task_id, block_id, work_blocks(day)")
        .in("task_id", candidateIds);
      for (const h of homeRows ?? []) {
        const wb = (Array.isArray(h.work_blocks) ? h.work_blocks[0] : h.work_blocks) as {
          day: string;
        } | null;
        if (wb) homes.set(h.task_id as string, { day: wb.day, blockId: h.block_id as string });
      }
    }

    openTasks = (taskRows ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      priority: t.priority as string,
      status: t.status as string,
      category: t.category as string,
      dueDate: (t.due_date as string) ?? null,
      projectId: (t.project_id as string) ?? null,
      plannedWeek: (t.planned_week as string) ?? null,
      pinnedForThisWeek: !!t.pinned_for_this_week,
      homeDay: homes.get(t.id as string)?.day ?? null,
      homeBlockId: homes.get(t.id as string)?.blockId ?? null,
    }));

    const projectIds = Array.from(
      new Set(openTasks.map((t) => t.projectId).filter((x): x is string => !!x))
    );
    if (projectIds.length > 0) {
      const { data: projects } = await session
        .from("ops_projects")
        .select("id, title")
        .in("id", projectIds);
      projectNames = Object.fromEntries(
        (projects ?? []).map((p) => [p.id as string, p.title as string])
      );
    }
  }

  const doneCount = blockTasks.filter((t) => t.status === "done").length;
  const summary = computeWeekSummary({
    days: days.map((day) => ({
      meetings: timed
        .filter((e) => e.day === day)
        .map((e) => ({ startMin: e.startMin, endMin: e.endMin })),
      blocks: blocks
        .filter((b) => b.day === day)
        .map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
      workday: isWorkday(day),
    })),
    workStartMin: prefs.dayStartMinute,
    workEndMin: prefs.dayEndMinute,
    blockTasksTotal: blockTasks.length,
    blockTasksDone: doneCount,
  });

  return {
    weekStart,
    days,
    todayISO,
    owner,
    owners,
    prefs,
    events: timed,
    allDayEvents: allDay,
    blocks,
    blockTasks,
    openGaps,
    summary,
    syncedAt: agenda.syncedAt,
    openTasks,
    projectNames,
    defaultBlockMinute: prefs.defaultBlockMinute,
  };
}
