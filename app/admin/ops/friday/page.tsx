import Link from "next/link";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import TaskRowWithActions, {
  type TaskRowAction,
} from "../_components/TaskRowWithActions";
import {
  TASK_CATEGORIES,
  categoryBadgeClass,
  categoryLabel,
  type AdminUserId,
  type TaskCategory,
  type OpsTask,
} from "../_types/ops";

export const dynamic = "force-dynamic";

// ── Date math (inlined; same helpers as monday/page.tsx) ───────────────────
function thisMonday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return d;
}
function fmtWeekHeader(monday: Date): string {
  return monday.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function readCurrentUser(): AdminUserId | null {
  const c = cookies().get("admin_user")?.value;
  return c === "remi" || c === "shannon" ? c : null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function FridayReviewPage() {
  const currentUser = readCurrentUser() ?? "remi";
  const supabase = getSupabaseAdmin();

  const mondayDate = thisMonday();
  const mondayISO = mondayDate.toISOString();
  const mineFilter = `assigned_to.eq.${currentUser},assigned_to.is.null`;

  const [shippedRes, stillPinnedRes] = await Promise.all([
    // Section 1: completed this week, mine
    supabase
      .from("ops_tasks")
      .select("*")
      .gte("completed_at", mondayISO)
      .or(mineFilter)
      .order("completed_at", { ascending: false }),
    // Section 2: still pinned + not done, mine
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("pinned_for_this_week", true)
      .neq("status", "done")
      .or(mineFilter)
      .order("due_date", { ascending: true, nullsFirst: true }),
  ]);

  const shipped = (shippedRes.data as OpsTask[] | null) ?? [];
  const stillPinned = (stillPinnedRes.data as OpsTask[] | null) ?? [];

  // Project name lookup for displayed rows.
  const referencedProjectIds = new Set<string>();
  for (const t of [...shipped, ...stillPinned]) {
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

  // Group shipped by day-of-week.
  const shippedByDay = new Map<string, OpsTask[]>();
  for (const t of shipped) {
    if (!t.completed_at) continue;
    const day = t.completed_at.slice(0, 10);
    const arr = shippedByDay.get(day) ?? [];
    arr.push(t);
    shippedByDay.set(day, arr);
  }
  const shippedDays = Array.from(shippedByDay.keys()).sort();

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

  // Section 2 actions: three buttons per spec (Mark done / Push / Unpin).
  // Per spec, "Drop / Won't do" was dropped because the schema can't
  // distinguish "done" from "dropped".
  const stillPinnedActions: TaskRowAction[] = [
    { label: "Mark done", variant: "primary", patch: { status: "done" } },
    { label: "Push to next week", variant: "default", patch: { pinned_for_this_week: true } },
    { label: "Unpin", variant: "ghost", patch: { pinned_for_this_week: false } },
  ];

  return (
    <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <header>
        <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
          Friday Review
        </h1>
        <div className="mt-2 flex items-baseline gap-3 flex-wrap text-sm">
          <span className="text-ink-2">Week of {fmtWeekHeader(mondayDate)}</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-2">Reviewing as {cap(currentUser)}</span>
        </div>
        <Link href="/admin/ops" className="mt-2 inline-block text-xs text-ink-2 hover:text-ink-1">
          ← Ops
        </Link>
      </header>

      {/* ── Section 1: What shipped this week ──────────────────────────── */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <header className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
          <h2 className="text-xs uppercase tracking-wider text-ink-2">
            What shipped this week
          </h2>
          <div>
            <span className="font-display font-black text-revenue text-3xl leading-none">
              {shipped.length}
            </span>{" "}
            <span className="text-xs text-ink-2 uppercase tracking-wider">
              task{shipped.length === 1 ? "" : "s"} completed
            </span>
          </div>
        </header>

        {shipped.length === 0 ? (
          <p className="text-sm text-ink-2">
            Nothing marked done this week yet. Mark some tasks as done before
            reviewing.
          </p>
        ) : (
          <div className="space-y-5">
            {shippedDays.map((day) => {
              const d = new Date(day + "T00:00:00");
              const label = d.toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              });
              return (
                <div key={day}>
                  <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
                    {label}
                  </h3>
                  <div className="space-y-1.5">
                    {(shippedByDay.get(day) ?? []).map((t) => (
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
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 2: Still pinned, not done ──────────────────────────── */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">
          Still pinned, not done{" "}
          <span className="text-ink-3">({stillPinned.length})</span>
        </h2>
        {stillPinned.length === 0 ? (
          <p className="text-sm text-revenue">
            Everything pinned for this week is done. Solid week.
          </p>
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

      {/* ── Section 3: Slipped by category (only if non-zero) ──────────── */}
      {slippedRows.length > 0 && (
        <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
          <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-1">
            Slipped categories
          </h2>
          <p className="text-xs text-ink-2 mb-4">
            Visibility only — patterns in what got pushed.
          </p>
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
                <span className="font-display font-bold text-ink-1 text-lg">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
