import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OpsProject, OpsTask } from "@/app/admin/ops/_types/ops";

/**
 * The Monday area walk (Operating Rhythm v2, Phase 4). Groups a person's live
 * work by `category` — the intrinsic axis every nonprofit has — so the walk
 * doubles as an "are we working on what matters" check: each active project
 * carries the strategy initiative it serves (ops_projects.initiative_id →
 * plan_initiatives → plan_goals), reusing the resolver shape from the project
 * detail page.
 *
 * "Mine" = assigned to me or unassigned. Org-scoped (the house trap). Empty
 * categories are dropped by the caller's render, not surfaced here.
 */

export type AreaProject = OpsProject & {
  initiativeLabel: string | null;
  openTaskCount: number;
};

export type Area = {
  category: string;
  projects: AreaProject[];
  /** Open tasks in this category with no project — the loose work to triage. */
  looseTasks: OpsTask[];
  /** How many of this area's open tasks are already pinned for the week. */
  pinnedCount: number;
};

// Canonical area order: the task taxonomy first (the axis the walk is built on),
// then project-only categories, then the catch-all. Anything unknown sorts last.
const CATEGORY_ORDER = [
  "fundraising",
  "program",
  "product",
  "operations",
  "admin",
  "recruitment",
  "finance",
  "board",
  "compliance",
  "other",
];

function orderRank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

export async function loadAreaWalk(
  orgId: string | null,
  handle: string
): Promise<Area[]> {
  if (!orgId) return [];
  const sb = getSupabaseAdmin();
  const mineFilter = `assigned_to.eq.${handle},assigned_to.is.null`;

  const [projectsRes, tasksRes] = await Promise.all([
    sb
      .from("ops_projects")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "active")
      .or(mineFilter)
      .order("last_touched_at", { ascending: true }),
    sb
      .from("ops_tasks")
      .select("*")
      .eq("org_id", orgId)
      .neq("status", "done")
      .is("archived_at", null)
      .or(mineFilter)
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);

  const projects = (projectsRes.data as OpsProject[] | null) ?? [];
  const tasks = (tasksRes.data as OpsTask[] | null) ?? [];

  // Resolve each project's initiative to a "Goal · Initiative" label.
  const initiativeIds = Array.from(
    new Set(projects.map((p) => p.initiative_id).filter((x): x is string => !!x))
  );
  const initiativeLabel = new Map<string, string>();
  if (initiativeIds.length > 0) {
    const [initRes, goalRes] = await Promise.all([
      sb.from("plan_initiatives").select("id, title, goal_id").in("id", initiativeIds),
      sb.from("plan_goals").select("id, title").eq("org_id", orgId),
    ]);
    const goalTitle = new Map(
      ((goalRes.data ?? []) as Array<{ id: string; title: string }>).map((g) => [g.id, g.title])
    );
    for (const i of (initRes.data ?? []) as Array<{
      id: string;
      title: string;
      goal_id: string | null;
    }>) {
      const g = i.goal_id ? goalTitle.get(i.goal_id) : undefined;
      const prefix = g ? `${g.length > 32 ? g.slice(0, 32) + "…" : g} · ` : "";
      initiativeLabel.set(i.id, `${prefix}${i.title}`);
    }
  }

  // Open task counts per project, in one pass over the tasks we already have.
  const openByProject = new Map<string, number>();
  for (const t of tasks) {
    if (t.project_id) openByProject.set(t.project_id, (openByProject.get(t.project_id) ?? 0) + 1);
  }

  // The categories that actually have active work.
  const categories = new Set<string>();
  projects.forEach((p) => categories.add(p.category));
  tasks.forEach((t) => categories.add(t.category));

  const areas: Area[] = [];
  for (const category of Array.from(categories)) {
    const catProjects: AreaProject[] = projects
      .filter((p) => p.category === category)
      .map((p) => ({
        ...p,
        initiativeLabel: p.initiative_id ? initiativeLabel.get(p.initiative_id) ?? null : null,
        openTaskCount: openByProject.get(p.id) ?? 0,
      }));
    const looseTasks = tasks.filter((t) => t.category === category && !t.project_id);
    const pinnedCount = tasks.filter(
      (t) => t.category === category && t.pinned_for_this_week
    ).length;
    if (catProjects.length === 0 && looseTasks.length === 0) continue;
    areas.push({ category, projects: catProjects, looseTasks, pinnedCount });
  }

  areas.sort((a, b) => orderRank(a.category) - orderRank(b.category));
  return areas;
}
