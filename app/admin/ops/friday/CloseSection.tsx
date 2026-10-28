import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveUserHandle } from "@/lib/admin/ops/identity";
import TaskRowWithActions, {
  type TaskRowAction,
} from "../_components/TaskRowWithActions";
import {
  TASK_CATEGORIES,
  categoryBadgeClass,
  categoryLabel,
  type TaskCategory,
  type OpsTask,
} from "../_types/ops";
import {
  thisMonday,
  nextMonday,
  formatWeekHeader,
  formatDayLabel,
  weekDays,
  todayInTZ,
  dayStartInstant,
} from "@/lib/admin/ops/week";
import RhythmWizard from "../_components/RhythmWizard";
import FridayOrient from "../_components/FridayOrient";
import FridayClose from "../_components/FridayClose";
import MeetingRecap, {
  type RecapMeeting,
  type RecapSuggestion,
} from "../_components/MeetingRecap";
import FridayNudges from "../_components/FridayNudges";
import CommitmentOutcome from "../_components/CommitmentOutcome";
import { deriveOutcome, type Outcome } from "@/lib/admin/ops/close";
import { TYPE } from "@/lib/admin/typeScale";

// The Friday close ritual — status, truth, recap, nudges, close — over
// rhythm_sessions + ops_tasks + meeting_suggested_tasks.
//
// Extracted at Spec Work W1: the V1 route (/admin/ops/friday) renders it
// standalone — output byte-identical to the pre-W1 page — and Work →
// Plan & Close renders the same ritual behind its ?ritual switch. One flow,
// one write path. At the W4 cutover the standalone route 308s to
// /admin/work/plan-close.

// Order within a day: day_order asc (nulls last), then due date, then created.
function byDayOrder(a: OpsTask, b: OpsTask): number {
  const ao = a.day_order;
  const bo = b.day_order;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  const ad = a.due_date ?? "9999-12-31";
  const bd = b.due_date ?? "9999-12-31";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.created_at < b.created_at ? -1 : 1;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function CloseSection() {
  const me = await resolveUserHandle();
  const supabase = getSupabaseAdmin();

  // Org fence: the service-role client bypasses RLS, so every read below MUST
  // filter by the active org. No org (no session) → nothing to close out.
  if (!me?.orgId) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <h1 className={TYPE.pageTitle}>Friday close</h1>
        <p className="text-ink-2 mt-1">Sign in to close out your week.</p>
      </div>
    );
  }
  const currentUser = me.handle;
  const orgId = me.orgId;

  // This-week anchor (YYYY-MM-DD, LA) for planned_week; plus the matching
  // UTC instant for the timestamptz completed_at comparison.
  const mondayISO = thisMonday();
  const weekStartInstant = dayStartInstant(mondayISO);
  const mineFilter = `assigned_to.eq.${currentUser},assigned_to.is.null`;

  const [shippedRes, weekTasksRes] = await Promise.all([
    // Completed since this Monday (LA), mine — the headline count + work that
    // shipped without being placed on a day this week.
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("org_id", orgId)
      .gte("completed_at", weekStartInstant)
      .or(mineFilter)
      .order("completed_at", { ascending: false }),
    // Everything planned for this week (any status), mine — drives the
    // day-by-day walk and the still-open roll-forward.
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("org_id", orgId)
      .eq("planned_week", mondayISO)
      .is("archived_at", null)
      .or(mineFilter),
  ]);

  const shipped = (shippedRes.data as OpsTask[] | null) ?? [];
  const weekTasks = (weekTasksRes.data as OpsTask[] | null) ?? [];

  // ── The Monday commit (Weekly Plan v2, PR 4) ─────────────────────────────
  // When this week's Monday Plan was committed, Truth walks the committed
  // list instead of whatever is planned now: each item ends with an outcome
  // derived from its task, and anything planned since is "added midweek".
  // No commit → the classic planned_week walk, with a note saying so.
  type Commitment = {
    id: string;
    task_id: string | null;
    task_title: string;
    placement: string | null;
    planned_day: string | null;
    outcome: Outcome | null;
  };
  let commitments: Commitment[] = [];
  const committedTaskById = new Map<string, OpsTask>();
  {
    const { data: mondaySess } = await supabase
      .from("rhythm_sessions")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", me.userId)
      .eq("kind", "monday_plan")
      .eq("week_of", mondayISO)
      .eq("status", "completed")
      .maybeSingle();
    if (mondaySess?.id) {
      const { data: rows } = await supabase
        .from("week_commitments")
        .select("id, task_id, task_title, placement, planned_day, outcome")
        .eq("org_id", orgId)
        .eq("session_id", mondaySess.id as string)
        .eq("decision", "commit")
        .order("created_at", { ascending: true });
      commitments = (rows as Commitment[] | null) ?? [];
      const ids = commitments.map((c) => c.task_id).filter((x): x is string => !!x);
      if (ids.length > 0) {
        // By id, not by week: a committed task may since be rolled or dropped.
        const { data: tRows } = await supabase
          .from("ops_tasks")
          .select("*")
          .eq("org_id", orgId)
          .in("id", ids);
        for (const t of (tRows as OpsTask[] | null) ?? []) committedTaskById.set(t.id, t);
      }
    }
  }
  const hasCommit = commitments.length > 0;
  const committedIds = new Set(
    commitments.map((c) => c.task_id).filter((x): x is string => !!x)
  );
  const outcomeOf = (c: Commitment): Outcome =>
    deriveOutcome(c.task_id ? committedTaskById.get(c.task_id) ?? null : null, mondayISO, c.outcome);

  const stillPinned = weekTasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31"));

  // Project name lookup for displayed rows.
  const referencedProjectIds = new Set<string>();
  for (const t of [...shipped, ...weekTasks, ...Array.from(committedTaskById.values())]) {
    if (t.project_id) referencedProjectIds.add(t.project_id);
  }
  const projectNames = new Map<string, string>();
  if (referencedProjectIds.size > 0) {
    const { data: projRows } = await supabase
      .from("ops_projects")
      .select("id, title")
      .eq("org_id", orgId)
      .in("id", Array.from(referencedProjectIds));
    for (const r of (projRows as { id: string; title: string }[] | null) ?? []) {
      projectNames.set(r.id, r.title);
    }
  }

  // Walk the week day by day: what was planned on each day, done or not.
  const weekDayList = weekDays(mondayISO);
  const todayISO = todayInTZ();
  const plannedByDay = new Map<string, OpsTask[]>();
  const noDay: OpsTask[] = [];
  // With a commit, the walk is the committed list, by the day saved at commit
  // time; without one, it is what is planned now.
  const walkTasks: Array<{ task: OpsTask; day: string | null }> = hasCommit
    ? commitments.flatMap((c) => {
        const t = c.task_id ? committedTaskById.get(c.task_id) : undefined;
        return t ? [{ task: t, day: c.planned_day }] : [];
      })
    : weekTasks.map((t) => ({ task: t, day: t.planned_day }));
  for (const { task: t, day } of walkTasks) {
    if (day && weekDayList.includes(day)) {
      const list = plannedByDay.get(day) ?? [];
      list.push(t);
      plannedByDay.set(day, list);
    } else {
      noDay.push(t);
    }
  }
  const commitmentByTask = new Map(
    commitments.filter((c) => c.task_id).map((c) => [c.task_id as string, c])
  );
  // Committed items still needing a call: missed (open in this week) or
  // partly done. Done, rolled and dropped ones have already been decided.
  const committedOpen = commitments.filter((c) => {
    const o = outcomeOf(c);
    return (o === "missed" || o === "partial") && !!c.task_id && committedTaskById.has(c.task_id);
  });
  plannedByDay.forEach((list) => list.sort(byDayOrder));
  noDay.sort(byDayOrder);

  // Work that shipped this week but wasn't on this week's plan (carried from an
  // earlier week, or never planned) — so the review doesn't lose it.
  const weekTaskIds = new Set(weekTasks.map((t) => t.id));
  const alsoCompleted = shipped.filter((t) => !weekTaskIds.has(t.id) && !committedIds.has(t.id));

  // Slipped-by-category counts.
  const slippedByCategory = Object.fromEntries(
    TASK_CATEGORIES.map((c) => [c, 0])
  ) as Record<TaskCategory, number>;
  for (const t of stillPinned) {
    if ((TASK_CATEGORIES as readonly string[]).includes(t.category)) {
      slippedByCategory[t.category]++;
    }
  }
  const slippedRows = (Object.entries(slippedByCategory) as Array<[TaskCategory, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  // Truth-the-tasks actions: done / roll deliberately / drop. Rolling clears the
  // pin and re-stamps planned_week to next Monday (a forward move → the PATCH
  // route increments roll_count and clears the old day). Drop archives.
  const nowISO = new Date().toISOString();
  const stillPinnedActions: TaskRowAction[] = [
    { label: "Done", variant: "primary", patch: { status: "done" } },
    {
      label: "Roll to next week",
      variant: "default",
      patch: { pinned_for_this_week: false, planned_week: nextMonday() },
    },
    { label: "Drop", variant: "ghost", patch: { archived_at: nowISO } },
  ];

  // Existing friday_close session for this week (committed state + saved note/checklist).
  let committedAt: string | null = null;
  let closeNotes = "";
  let closeChecklist: Record<string, boolean> = {};
  if (me) {
    const { data: sess } = await supabase
      .from("rhythm_sessions")
      .select("completed_at, status, notes, checklist")
      .eq("org_id", me.orgId)
      .eq("user_id", me.userId)
      .eq("kind", "friday_close")
      .eq("week_of", mondayISO)
      .maybeSingle();
    if (sess) {
      if (sess.status === "completed") committedAt = sess.completed_at as string | null;
      closeNotes = typeof sess.notes === "string" ? sess.notes : "";
      closeChecklist =
        sess.checklist && typeof sess.checklist === "object"
          ? (sess.checklist as Record<string, boolean>)
          : {};
    }
  }

  // Recap: this-week meetings still needing follow-up (mine), + pending suggestions.
  const weekEndInstant = dayStartInstant(nextMonday());
  let recapMeetings: RecapMeeting[] = [];
  if (me) {
    const { data: meetingRows } = await supabase
      .from("meeting_records")
      .select("id, title, occurred_at")
      .eq("org_id", me.orgId)
      .eq("owner_user_id", me.userId)
      .eq("follow_up_status", "needs_follow_up")
      .gte("occurred_at", weekStartInstant)
      .lt("occurred_at", weekEndInstant)
      .order("occurred_at", { ascending: false });
    const ms =
      (meetingRows as Array<{ id: string; title: string | null; occurred_at: string }> | null) ?? [];
    if (ms.length > 0) {
      const ids = ms.map((m) => m.id);
      const { data: suggRows } = await supabase
        .from("meeting_suggested_tasks")
        .select("id, meeting_record_id, suggested_title, suggested_category")
        .in("meeting_record_id", ids)
        .eq("org_id", me.orgId)
        .eq("status", "pending");
      const byMeeting = new Map<string, RecapSuggestion[]>();
      for (const s of (suggRows as Array<{
        id: string;
        meeting_record_id: string;
        suggested_title: string;
        suggested_category: string | null;
      }> | null) ?? []) {
        const list = byMeeting.get(s.meeting_record_id) ?? [];
        list.push({ id: s.id, title: s.suggested_title, category: s.suggested_category });
        byMeeting.set(s.meeting_record_id, list);
      }
      recapMeetings = ms.map((m) => ({
        id: m.id,
        title: m.title ?? "",
        occurredAt: m.occurred_at,
        suggestions: byMeeting.get(m.id) ?? [],
      }));
    }
  }

  // The outcome line under a committed task (null when there is no commit).
  const outcomeLine = (t: OpsTask, canMarkPartial: boolean) => {
    const c = commitmentByTask.get(t.id);
    if (!c) return null;
    const o = outcomeOf(c);
    return (
      <CommitmentOutcome
        commitmentId={c.id}
        outcome={o}
        canMarkPartial={canMarkPartial && (o === "missed" || o === "partial")}
        placementNote={
          canMarkPartial && c.planned_day ? `planned ${formatDayLabel(c.planned_day)}` : null
        }
      />
    );
  };

  // ── Step content ───────────────────────────────────────────────────────────
  const truth = (
    <div className="space-y-6">
      {/* The week, day by day */}
      <section className="rounded-panel border-hairline bg-surface p-6">
        <header className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2 className={TYPE.sectionHeader}>The week, day by day</h2>
            <p className="text-xs text-ink-2 mt-1">
              {hasCommit
                ? `Walking the ${commitments.length} ${commitments.length === 1 ? "task" : "tasks"} you committed on Monday, by the day you placed them.`
                : "No plan was committed this week, so this walks what is planned now."}
            </p>
          </div>
          <div>
            <span className="font-display font-black text-revenue text-3xl leading-none">
              {shipped.length}
            </span>{" "}
            <span className="text-xs text-ink-2 uppercase tracking-wider">
              task{shipped.length === 1 ? "" : "s"} completed
            </span>
          </div>
        </header>

        <div className="space-y-4">
          {weekDayList.map((dayISO) => {
            const dayTasks = plannedByDay.get(dayISO) ?? [];
            const isToday = dayISO === todayISO;
            const doneCount = dayTasks.filter((t) => t.status === "done").length;
            return (
              <div
                key={dayISO}
                className={`rounded-control border p-4 ${
                  isToday ? "border-orange/40 bg-orange-light/40" : "border-hairline bg-surface"
                }`}
              >
                <h3
                  className={`text-xs uppercase tracking-wider mb-2 flex items-baseline gap-2 ${
                    isToday ? "text-orange font-semibold" : "text-ink-3"
                  }`}
                >
                  {formatDayLabel(dayISO)}
                  {isToday && <span className="text-orange">· today</span>}
                  {dayTasks.length > 0 && (
                    <span className="ml-auto text-xs text-ink-3 font-mono">
                      {doneCount}/{dayTasks.length} done
                    </span>
                  )}
                </h3>
                {dayTasks.length === 0 ? (
                  <p className="text-xs text-ink-3 italic">Nothing planned.</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayTasks.map((t) => (
                      <div key={t.id} className="space-y-1">
                        <TaskRowWithActions
                          task={t}
                          projectName={t.project_id ? projectNames.get(t.project_id) : null}
                          readOnly
                          completedTimestamp={t.status === "done" ? t.completed_at : null}
                        />
                        {outcomeLine(t, false)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {noDay.length > 0 && (
          <div className="mt-4 rounded-control border border-dashed border-hairline bg-tile/40 p-4">
            <h3 className="text-xs uppercase tracking-wider text-ink-3 mb-2">
              {hasCommit ? "Committed, no day set" : "Planned this week, no day set"} ({noDay.length})
            </h3>
            <div className="space-y-1.5">
              {noDay.map((t) => (
                <div key={t.id} className="space-y-1">
                  <TaskRowWithActions
                    task={t}
                    projectName={t.project_id ? projectNames.get(t.project_id) : null}
                    readOnly
                    completedTimestamp={t.status === "done" ? t.completed_at : null}
                  />
                  {outcomeLine(t, false)}
                </div>
              ))}
            </div>
          </div>
        )}

        {alsoCompleted.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wider text-ink-3 mb-2">
              Also completed this week ({alsoCompleted.length})
            </h3>
            <div className="space-y-1.5">
              {alsoCompleted.map((t) => (
                <TaskRowWithActions
                  key={t.id}
                  task={t}
                  projectName={t.project_id ? projectNames.get(t.project_id) : null}
                  readOnly
                  completedTimestamp={t.completed_at}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Still open — roll forward */}
      <section className="rounded-panel border-hairline bg-surface p-6">
        <h2 className={`${TYPE.sectionHeader} mb-4`}>
          {hasCommit ? "Committed, still open: truth it" : "Still open: truth it"}{" "}
          <span className="text-ink-3">({hasCommit ? committedOpen.length : stillPinned.length})</span>
        </h2>
        {hasCommit ? (
          committedOpen.length === 0 ? (
            <p className="text-sm text-revenue">Every committed task has an outcome. Solid week.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-ink-2">
                Done, roll it to next week, or drop it. Leave it and it counts as missed and
                waits in Monday&apos;s Carryover.
              </p>
              {committedOpen.map((c) => {
                const t = committedTaskById.get(c.task_id as string) as OpsTask;
                return (
                  <div key={c.id} className="space-y-1">
                    <TaskRowWithActions
                      task={t}
                      projectName={t.project_id ? projectNames.get(t.project_id) : null}
                      actions={stillPinnedActions}
                    />
                    {outcomeLine(t, true)}
                  </div>
                );
              })}
            </div>
          )
        ) : stillPinned.length === 0 ? (
          <p className="text-sm text-revenue">Everything pinned for this week is done. Solid week.</p>
        ) : (
          <div className="space-y-1.5">
            {stillPinned.map((t) => (
              <TaskRowWithActions
                key={t.id}
                task={t}
                projectName={t.project_id ? projectNames.get(t.project_id) : null}
                actions={stillPinnedActions}
              />
            ))}
          </div>
        )}
      </section>

      {/* Slipped by category (only if non-zero) */}
      {slippedRows.length > 0 && (
        <section className="rounded-panel border-hairline bg-surface p-6">
          <h2 className={`${TYPE.sectionHeader} mb-1`}>Slipped categories</h2>
          <p className="text-xs text-ink-2 mb-4">Visibility only. Patterns in what got pushed.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {slippedRows.map(([cat, count]) => (
              <div
                key={cat}
                className="rounded-control border-hairline bg-surface px-3 py-2 flex items-center justify-between"
              >
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-xs uppercase tracking-wider font-semibold border ${categoryBadgeClass(cat)}`}
                >
                  {categoryLabel(cat)}
                </span>
                <span className="font-display font-bold text-ink-1 text-lg">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <RhythmWizard
      eyebrow="Friday · Account"
      title="Close"
      subtitle={
        <>
          <span>Week of {formatWeekHeader(mondayISO)}</span>
          <span className="text-ink-3">·</span>
          <span>as {cap(currentUser)}</span>
        </>
      }
      steps={[
        { key: "status", label: "Status", content: <FridayOrient /> },
        { key: "truth", label: "Truth", content: truth },
        { key: "recap", label: "Recap", content: <MeetingRecap meetings={recapMeetings} /> },
        { key: "nudges", label: "Nudges", content: <FridayNudges orgId={me?.orgId ?? null} /> },
        {
          key: "close",
          label: "Close",
          content: (
            <FridayClose
              committedAt={committedAt}
              initialNotes={closeNotes}
              initialChecklist={closeChecklist}
            />
          ),
        },
      ]}
    />
  );
}
