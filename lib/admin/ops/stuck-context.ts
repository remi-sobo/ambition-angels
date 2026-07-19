import type { SupabaseClient } from "@supabase/supabase-js";
import { constituentName } from "@/lib/fundraising/display";
import type { OpsTask } from "@/app/admin/ops/_types/ops";

/**
 * Project context for the Stuck Work rollup: which project a stuck task hangs
 * off, plus the fundraising identifiers the operator recognizes it by.
 *
 * ops_projects carries no donor/partner fields of its own, so the context is
 * derived from the two links the data model actually has:
 *   - donor        → the grant funder (grant-backed projects: ops_projects.
 *                    grant_id → grants.funder_id → constituents), plus any
 *                    constituents the project's tasks link to (linked_entity).
 *   - partnership  → partners the project's tasks link to (linked_entity).
 * A "connector" has no representation in the schema today (the closest thing
 * is HubSpot's Angel Connectors pipeline, which nothing project-side points
 * at) — when such a link exists, add it here and the rollup will render it.
 */

export type StuckProjectContext = {
  id: string;
  title: string;
  /** Donor names — grant funder first, then task-linked donors. Deduped. */
  donors: string[];
  /** Partnership names the project's tasks link to. Deduped. */
  partnerships: string[];
};

type ProjectRow = { id: string; title: string; grant_id: string | null };
type LinkedTask = Pick<
  OpsTask,
  "project_id" | "linked_entity_type" | "linked_label"
>;

/** Case-insensitive de-dupe that keeps first-seen casing and order. */
function pushUnique(list: string[], value: string | null | undefined) {
  const v = value?.trim();
  if (!v) return;
  if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
}

/**
 * Pure aggregation over already-fetched rows (unit-tested); the Supabase
 * round-trips live in loadStuckProjectContext below.
 */
export function buildStuckProjectContext(
  projects: ProjectRow[],
  grantFunderNames: Record<string, string>,
  tasks: LinkedTask[]
): Record<string, StuckProjectContext> {
  const out: Record<string, StuckProjectContext> = {};
  for (const p of projects) {
    const ctx: StuckProjectContext = {
      id: p.id,
      title: p.title,
      donors: [],
      partnerships: [],
    };
    if (p.grant_id) pushUnique(ctx.donors, grantFunderNames[p.grant_id]);
    out[p.id] = ctx;
  }
  for (const t of tasks) {
    const ctx = t.project_id ? out[t.project_id] : undefined;
    if (!ctx || !t.linked_entity_type) continue;
    if (t.linked_entity_type === "constituent") pushUnique(ctx.donors, t.linked_label);
    else if (t.linked_entity_type === "partner") pushUnique(ctx.partnerships, t.linked_label);
  }
  return out;
}

/**
 * Load context for the projects the stuck tasks reference. `allTasks` is the
 * page's already-loaded task set — linked entities are aggregated from it in
 * memory, so the only round-trips are the (tiny) project/grant/funder lookups,
 * and none at all when no stuck task has a project.
 */
export async function loadStuckProjectContext(
  supabase: SupabaseClient,
  stuckTasks: OpsTask[],
  allTasks: OpsTask[],
  orgId: string
): Promise<Record<string, StuckProjectContext>> {
  const projectIds = Array.from(
    new Set(stuckTasks.map((t) => t.project_id).filter((id): id is string => !!id))
  );
  if (projectIds.length === 0) return {};

  // Org fence: service-role client bypasses RLS, so every lookup below is
  // constrained to the caller's org — these reads reach into ops_projects,
  // grants, and constituents (donor names).
  const { data: projectRows } = await supabase
    .from("ops_projects")
    .select("id, title, grant_id")
    .eq("org_id", orgId)
    .in("id", projectIds);
  const projects = (projectRows as ProjectRow[] | null) ?? [];

  // Grant-backed projects: resolve grant → funder constituent → display name.
  const grantIds = Array.from(
    new Set(projects.map((p) => p.grant_id).filter((id): id is string => !!id))
  );
  const grantFunderNames: Record<string, string> = {};
  if (grantIds.length > 0) {
    const { data: grantRows } = await supabase
      .from("grants")
      .select("id, funder_id")
      .eq("org_id", orgId)
      .in("id", grantIds);
    const grants = (grantRows as { id: string; funder_id: string | null }[] | null) ?? [];
    const funderIds = Array.from(
      new Set(grants.map((g) => g.funder_id).filter((id): id is string => !!id))
    );
    if (funderIds.length > 0) {
      const { data: funderRows } = await supabase
        .from("constituents")
        .select("id, type, first_name, last_name, org_name")
        .eq("org_id", orgId)
        .in("id", funderIds);
      const funderName = new Map(
        (
          (funderRows as
            | { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null }[]
            | null) ?? []
        ).map((c) => [c.id, constituentName(c)])
      );
      for (const g of grants) {
        const name = g.funder_id ? funderName.get(g.funder_id) : undefined;
        if (name) grantFunderNames[g.id] = name;
      }
    }
  }

  return buildStuckProjectContext(projects, grantFunderNames, allTasks);
}
