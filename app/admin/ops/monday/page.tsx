import Link from "next/link";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import TaskRowWithActions, {
  type TaskRowAction,
} from "../_components/TaskRowWithActions";
import {
  categoryBadgeClass,
  categoryLabel,
  formatRelative,
  type AdminUserId,
  type OpsProject,
  type OpsTask,
} from "../_types/ops";

export const dynamic = "force-dynamic";

// ── Date math (inlined to avoid touching _types/ops.ts outside scope) ──────
function thisMonday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return d;
}
function lastMonday(): Date {
  const d = thisMonday();
  d.setDate(d.getDate() - 7);
  return d;
}
function fmtWeekHeader(monday: Date): string {
  return monday.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function readCurrentUser(): AdminUserId | null {
  const c = cookies().get("admin_user")?.value;
  return c === "remi" || c === "shannon" ? c : null;
}

function otherUser(u: AdminUserId | null): AdminUserId | null {
  if (u === "remi") return "shannon";
  if (u === "shannon") return "remi";
  return null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function MondayPlanPage() {
  const currentUser = readCurrentUser() ?? "remi";
  const otherPerson = otherUser(currentUser);
  const supabase = getSupabaseAdmin();

  const mondayDate = thisMonday();
  const lastMondayDate = lastMonday();
  const mondayISO = mondayDate.toISOString();
  const lastMondayISO = lastMondayDate.toISOString();

  // Tasks-of-mine filter: assigned to me OR unassigned.
  const mineFilter = `assigned_to.eq.${currentUser},assigned_to.is.null`;
  // Tasks-of-other-person filter: explicitly assigned to them.

  const [
    slippedRes,
    pinnedThisWeekRes,
    candidatesRes,
    neglectedProjectsRes,
    otherPersonPinnedRes,
  ] = await Promise.all([
    // Section 1: pinned + open + updated_at in last week
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("pinned_for_this_week", true)
      .neq("status", "done")
      .or(mineFilter)
      .gte("updated_at", lastMondayISO)
      .lt("updated_at", mondayISO)
      .order("updated_at", { ascending: true }),
    // Section 2: pinned + open + assigned to me (or null)
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("pinned_for_this_week", true)
      .neq("status", "done")
      .or(mineFilter)
      .order("due_date", { ascending: true, nullsFirst: true }),
    // Section 3a: unpinned + open + assigned to me (or null). Sort by
    // due_date asc nulls last, then last_touched (updated_at) asc.
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("pinned_for_this_week", false)
      .neq("status", "done")
      .or(mineFilter)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: true })
      .limit(26), // 25 + 1 to detect "more"
    // Section 3b: active projects assigned to me (or null), most neglected
    supabase
      .from("ops_projects")
      .select("*")
      .eq("status", "active")
      .or(mineFilter)
      .order("last_touched_at", { ascending: true })
      .limit(10),
    // Section 3c: other person's pinned tasks (read-only)
    otherPerson
      ? supabase
          .from("ops_tasks")
          .select("*")
          .eq("pinned_for_this_week", true)
          .eq("assigned_to", otherPerson)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("category", { ascending: true })
          .limit(15)
      : Promise.resolve({ data: [], error: null } as { data: OpsTask[]; error: null }),
  ]);

  const slippedRaw = (slippedRes.data as OpsTask[] | null) ?? [];
  const pinnedThisWeekAll = (pinnedThisWeekRes.data as OpsTask[] | null) ?? [];
  const candidatesAll = (candidatesRes.data as OpsTask[] | null) ?? [];
  const neglectedProjects = (neglectedProjectsRes.data as OpsProject[] | null) ?? [];
  const otherPersonPinned =
    (otherPersonPinnedRes.data as OpsTask[] | null) ?? [];

  // Section 2 deviates slightly from spec: exclude tasks already in Section 1
  // (last-week-slipped). Keeps the surfaces mutually exclusive so the user
  // isn't reviewing the same task in both places. See diff summary.
  const slippedIds = new Set(slippedRaw.map((t) => t.id));
  const pinnedThisWeek = pinnedThisWeekAll.filter(
    (t) => !slippedIds.has(t.id)
  );

  const candidates = candidatesAll.slice(0, 25);
  const hasMoreCandidates = candidatesAll.length > 25;

  // Look up project names for any task that has a project_id, in a single
  // query — avoids the N+1 trap.
  const referencedProjectIds = new Set<string>();
  for (const t of [...slippedRaw, ...pinnedThisWeek, ...candidates, ...otherPersonPinned]) {
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
  for (const p of neglectedProjects) projectNames.set(p.id, p.title);

  // Open-task counts for neglected projects.
  const openCounts = new Map<string, number>();
  if (neglectedProjects.length > 0) {
    const ids = neglectedProjects.map((p) => p.id);
    const { data: taskRows } = await supabase
      .from("ops_tasks")
      .select("project_id, status")
      .in("project_id", ids)
      .neq("status", "done");
    for (const r of (taskRows as Array<{ project_id: string }> | null) ?? []) {
      openCounts.set(r.project_id, (openCounts.get(r.project_id) ?? 0) + 1);
    }
  }

  // Group pinned-this-week by due date (with an "Anytime this week" bucket).
  const anytime = pinnedThisWeek.filter((t) => !t.due_date);
  const byDay = new Map<string, OpsTask[]>();
  for (const t of pinnedThisWeek) {
    if (!t.due_date) continue;
    const list = byDay.get(t.due_date) ?? [];
    list.push(t);
    byDay.set(t.due_date, list);
  }
  const days = Array.from(byDay.keys()).sort();

  // ── Action definitions reused inline ──────────────────────────────────────
  const slippedActions: TaskRowAction[] = [
    { label: "Carry to this week", variant: "primary", patch: { pinned_for_this_week: true } },
    { label: "Mark done", variant: "default", patch: { status: "done" } },
    { label: "Drop", variant: "ghost", patch: { pinned_for_this_week: false } },
  ];
  const pinnedThisWeekActions: TaskRowAction[] = [
    { label: "Unpin", variant: "ghost", patch: { pinned_for_this_week: false } },
  ];
  const candidateActions: TaskRowAction[] = [
    { label: "Pin for this week", variant: "primary", patch: { pinned_for_this_week: true } },
  ];

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <header>
        <h1 className="font-display font-black uppercase tracking-tight text-cream text-3xl sm:text-4xl leading-none">
          Monday Plan
        </h1>
        <div className="mt-2 flex items-baseline gap-3 flex-wrap text-sm">
          <span className="text-gray-mid">Week of {fmtWeekHeader(mondayDate)}</span>
          <span className="text-cream/50">·</span>
          <span className="text-cream/70">Planning as {cap(currentUser)}</span>
        </div>
        <Link href="/admin/ops" className="mt-2 inline-block text-xs text-gray-mid hover:text-cream">
          ← Ops
        </Link>
      </header>

      {/* ── Section 1: Slipped from last week ──────────────────────────── */}
      {slippedRaw.length > 0 && (
        <section className="rounded-card border border-amber-500/30 bg-amber-500/[0.04] p-6">
          <h2 className="text-xs uppercase tracking-wider text-amber-300 mb-1">
            From last week
          </h2>
          <p className="text-sm text-cream/80 mb-4">
            <span className="font-semibold text-cream">{slippedRaw.length}</span>{" "}
            {slippedRaw.length === 1 ? "item" : "items"} from last week didn&apos;t
            ship. Carry over, mark done, or drop:
          </p>
          <div className="space-y-1.5">
            {slippedRaw.map((t) => {
              const overdue = daysSince(t.updated_at);
              return (
                <div key={t.id} className="space-y-1">
                  <TaskRowWithActions
                    task={t}
                    projectName={t.project_id ? projectNames.get(t.project_id) : null}
                    actions={slippedActions}
                  />
                  <div className="text-[10px] text-amber-300/70 pl-3">
                    {overdue} day{overdue === 1 ? "" : "s"} since last touched
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 2: This week's commitment ──────────────────────────── */}
      <section className="rounded-card border border-white/10 bg-black/30 p-6">
        <h2 className="text-xs uppercase tracking-wider text-gray-mid mb-4">
          This Week
        </h2>
        {pinnedThisWeek.length === 0 ? (
          <p className="text-sm text-gray-mid">
            Nothing pinned for this week yet. Use the section below to add
            commitments.
          </p>
        ) : (
          <div className="space-y-5">
            {anytime.length > 0 && (
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-cream/50 mb-2">
                  Anytime this week
                </h3>
                <div className="space-y-1.5">
                  {anytime.map((t) => (
                    <TaskRowWithActions
                      key={t.id}
                      task={t}
                      projectName={t.project_id ? projectNames.get(t.project_id) : null}
                      actions={pinnedThisWeekActions}
                    />
                  ))}
                </div>
              </div>
            )}
            {days.map((day) => {
              const d = new Date(day + "T00:00:00");
              const label = d.toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              });
              return (
                <div key={day}>
                  <h3 className="text-[10px] uppercase tracking-wider text-cream/50 mb-2">
                    {label}
                  </h3>
                  <div className="space-y-1.5">
                    {(byDay.get(day) ?? []).map((t) => (
                      <TaskRowWithActions
                        key={t.id}
                        task={t}
                        projectName={t.project_id ? projectNames.get(t.project_id) : null}
                        actions={pinnedThisWeekActions}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 3: Candidates ──────────────────────────────────────── */}
      <section className="rounded-card border border-white/10 bg-black/30 p-6">
        <h2 className="text-xs uppercase tracking-wider text-gray-mid mb-4">
          Candidates for this week
        </h2>

        {/* 3a: Open tasks not pinned */}
        <details open className="group mb-4">
          <summary className="cursor-pointer select-none flex items-baseline gap-2 mb-2">
            <span className="text-sm font-medium text-cream group-open:text-orange transition-colors">
              Open tasks ({candidatesAll.length})
            </span>
            <span className="text-[11px] text-gray-mid">
              {candidates.length === 0
                ? "nothing unpinned"
                : "sorted by due date, then most-neglected first"}
            </span>
          </summary>
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-mid mt-2 pl-2 italic">
              No unpinned open tasks. You&apos;re already on top of it.
            </p>
          ) : (
            <div className="space-y-1.5 mt-2">
              {candidates.map((t) => (
                <TaskRowWithActions
                  key={t.id}
                  task={t}
                  projectName={t.project_id ? projectNames.get(t.project_id) : null}
                  actions={candidateActions}
                />
              ))}
              {hasMoreCandidates && (
                <p className="text-xs text-gray-mid pl-2 pt-1">
                  {candidatesAll.length - 25} more open tasks not shown.
                </p>
              )}
            </div>
          )}
        </details>

        {/* 3b: Neglected active projects */}
        <details className="group mb-4">
          <summary className="cursor-pointer select-none flex items-baseline gap-2 mb-2">
            <span className="text-sm font-medium text-cream group-open:text-orange transition-colors">
              Active projects ({neglectedProjects.length})
            </span>
            <span className="text-[11px] text-gray-mid">
              sorted by neglect — least recently touched first
            </span>
          </summary>
          {neglectedProjects.length === 0 ? (
            <p className="text-sm text-gray-mid mt-2 pl-2 italic">
              No active projects assigned to you (or unassigned).
            </p>
          ) : (
            <div className="space-y-1.5 mt-2">
              {neglectedProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/ops/projects/${p.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors group/row"
                >
                  <span className="text-sm text-cream group-hover/row:text-orange flex-1 truncate">
                    {p.title}
                  </span>
                  <span
                    className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(p.category)}`}
                  >
                    {categoryLabel(p.category)}
                  </span>
                  <span className="shrink-0 text-[11px] text-cream/60 font-mono">
                    {openCounts.get(p.id) ?? 0} open
                  </span>
                  <span className="shrink-0 text-[11px] text-amber-300/70 font-mono">
                    {formatRelative(p.last_touched_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </details>

        {/* 3c: Other person's pinned tasks (read-only) */}
        <details className="group">
          <summary className="cursor-pointer select-none flex items-baseline gap-2 mb-2">
            <span className="text-sm font-medium text-cream group-open:text-orange transition-colors">
              {otherPerson ? `${cap(otherPerson)}'s pinned tasks` : "Counterpart"}{" "}
              ({otherPersonPinned.length})
            </span>
            <span className="text-[11px] text-gray-mid">read-only</span>
          </summary>
          {otherPersonPinned.length === 0 ? (
            <p className="text-sm text-gray-mid mt-2 pl-2 italic">
              {otherPerson ? cap(otherPerson) : "They"} hasn&apos;t pinned anything for this week yet.
            </p>
          ) : (
            <div className="space-y-1.5 mt-2">
              {otherPersonPinned.map((t) => (
                <TaskRowWithActions
                  key={t.id}
                  task={t}
                  projectName={t.project_id ? projectNames.get(t.project_id) : null}
                  readOnly
                />
              ))}
            </div>
          )}
        </details>
      </section>
    </div>
  );
}
