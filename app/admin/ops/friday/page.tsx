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

export const dynamic = "force-dynamic";

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

export default async function FridayClosePage() {
  const me = await resolveUserHandle();
  const currentUser = me?.handle ?? "remi";
  const supabase = getSupabaseAdmin();

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
      .gte("completed_at", weekStartInstant)
      .or(mineFilter)
      .order("completed_at", { ascending: false }),
    // Everything planned for this week (any status), mine — drives the
    // day-by-day walk and the still-open roll-forward.
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("planned_week", mondayISO)
      .or(mineFilter),
  ]);

  const shipped = (shippedRes.data as OpsTask[] | null) ?? [];
  const weekTasks = (weekTasksRes.data as OpsTask[] | null) ?? [];
  const stillPinned = weekTasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31"));

  // Project name lookup for displayed rows.
  const referencedProjectIds = new Set<string>();
  for (const t of [...shipped, ...weekTasks]) {
    if (t.project_id) referencedProjectIds.add(t.project_id);
  }
  const projectNames = new Map<string, string>();
  if (referencedProjectIds.size > 0) {
    const { data: projRows } = await supabase
      .from("ops_projects")
      .select("id, title")
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
  for (const t of weekTasks) {
    if (t.planned_day && weekDayList.includes(t.planned_day)) {
      const list = plannedByDay.get(t.planned_day) ?? [];
      list.push(t);
      plannedByDay.set(t.planned_day, list);
    } else {
      noDay.push(t);
    }
  }
  plannedByDay.forEach((list) => list.sort(byDayOrder));
  noDay.sort(byDayOrder);

  // Work that shipped this week but wasn't on this week's plan (carried from an
  // earlier week, or never planned) — so the review doesn't lose it.
  const weekTaskIds = new Set(weekTasks.map((t) => t.id));
  const alsoCompleted = shipped.filter((t) => !weekTaskIds.has(t.id));

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

  // ── Step content ───────────────────────────────────────────────────────────
  const truth = (
    <div className="space-y-6">
      {/* The week, day by day */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <header className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
          <h2 className="text-xs uppercase tracking-wider text-ink-2">The week, day by day</h2>
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
                className={`rounded-lg border p-4 ${
                  isToday ? "border-orange/40 bg-orange-light/40" : "border-outline bg-surface"
                }`}
              >
                <h3
                  className={`text-[11px] uppercase tracking-wider mb-2 flex items-baseline gap-2 ${
                    isToday ? "text-orange font-semibold" : "text-ink-3"
                  }`}
                >
                  {formatDayLabel(dayISO)}
                  {isToday && <span className="text-orange">· today</span>}
                  {dayTasks.length > 0 && (
                    <span className="ml-auto text-[10px] text-ink-3 font-mono">
                      {doneCount}/{dayTasks.length} done
                    </span>
                  )}
                </h3>
                {dayTasks.length === 0 ? (
                  <p className="text-xs text-ink-3 italic">Nothing planned.</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayTasks.map((t) => (
                      <TaskRowWithActions
                        key={t.id}
                        task={t}
                        projectName={t.project_id ? projectNames.get(t.project_id) : null}
                        readOnly
                        completedTimestamp={t.status === "done" ? t.completed_at : null}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {noDay.length > 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-outline bg-tile/40 p-4">
            <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              Planned this week, no day set ({noDay.length})
            </h3>
            <div className="space-y-1.5">
              {noDay.map((t) => (
                <TaskRowWithActions
                  key={t.id}
                  task={t}
                  projectName={t.project_id ? projectNames.get(t.project_id) : null}
                  readOnly
                  completedTimestamp={t.status === "done" ? t.completed_at : null}
                />
              ))}
            </div>
          </div>
        )}

        {alsoCompleted.length > 0 && (
          <div className="mt-4">
            <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
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
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">
          Still open — truth it <span className="text-ink-3">({stillPinned.length})</span>
        </h2>
        {stillPinned.length === 0 ? (
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
        <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
          <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-1">Slipped categories</h2>
          <p className="text-xs text-ink-2 mb-4">Visibility only — patterns in what got pushed.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {slippedRows.map(([cat, count]) => (
              <div
                key={cat}
                className="rounded-lg border-[1.5px] border-outline bg-surface shadow-panel px-3 py-2 flex items-center justify-between"
              >
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(cat)}`}
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
        { key: "verdict", label: "Verdict", content: <FridayOrient /> },
        { key: "truth", label: "Truth", content: truth },
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
