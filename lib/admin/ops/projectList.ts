import type { TableSpec } from "@/lib/admin/dataTable";

/**
 * Projects list on DataTable v2 (V4 Stage G; spec §5 List archetype).
 *
 * PURE: the URL filter vocabulary, the table spec and the next-step rule.
 * The page (app/admin/ops/projects/page.tsx, hosted at /admin/work/projects)
 * reads with these; tests drive them directly.
 *
 * URL vocabulary (kept from the V1 list): status (default "active"; "all"
 * for every status), category, assignee ("me", "unassigned" or a handle), q,
 * grants=show. Paging and sort are DataTable's (page 0-based, sort, dir).
 */

export const PROJECT_STATUS_VALUES = ["active", "paused", "done", "archived"] as const;
export type ProjectStatusFilter = (typeof PROJECT_STATUS_VALUES)[number] | "all";

export type ProjectFilters = {
  status: ProjectStatusFilter;
  category: string;
  assignee: string;
  q: string;
  showGrants: boolean;
};

export const PROJECT_TABLE: TableSpec = {
  sortable: [
    { key: "title", first: "asc" },
    { key: "due_date", first: "asc" },
    { key: "last_touched_at", first: "desc" },
  ],
  defaultSort: { key: "last_touched_at", dir: "desc" },
  pageSize: 25,
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseProjectFilters(
  raw: Record<string, string | string[] | undefined>,
  isCategory: (s: string) => boolean,
): ProjectFilters {
  const s = one(raw.status);
  // "" was the V1 "all statuses" value; "all" is the explicit one now.
  const status: ProjectStatusFilter =
    s === "all" || s === "" ? "all" : (PROJECT_STATUS_VALUES as readonly string[]).includes(s ?? "") ? (s as ProjectStatusFilter) : "active";
  const c = one(raw.category) ?? "";
  return {
    status,
    category: c && isCategory(c) ? c : "",
    assignee: (one(raw.assignee) ?? "").trim(),
    q: (one(raw.q) ?? "").trim().slice(0, 120),
    showGrants: one(raw.grants) === "show",
  };
}

/** Filters → the params DataTable carries through sort and page links. */
export function projectFilterParams(f: ProjectFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.status !== "active") out.status = f.status;
  if (f.category) out.category = f.category;
  if (f.assignee) out.assignee = f.assignee;
  if (f.q) out.q = f.q;
  if (f.showGrants) out.grants = "show";
  return out;
}

export function projectListHref(base: string, f: ProjectFilters): string {
  const s = new URLSearchParams(projectFilterParams(f)).toString();
  return s ? `${base}?${s}` : base;
}

/** The saved views as tabs, "mine" first (spec §5). */
export function projectViews(base: string, f: ProjectFilters) {
  const reset = { ...f, assignee: "", status: "active" as ProjectStatusFilter };
  const views = [
    { key: "mine", label: "My projects", mine: true, href: projectListHref(base, { ...reset, assignee: "me" }) },
    { key: "active", label: "Active", href: projectListHref(base, reset) },
    { key: "all", label: "Every status", href: projectListHref(base, { ...reset, status: "all" }) },
  ];
  const activeKey =
    f.assignee === "me" && f.status === "active" ? "mine" : !f.assignee && f.status === "all" ? "all" : !f.assignee && f.status === "active" ? "active" : "";
  return { views, activeKey };
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type ProjectNextStep = { text: string; tone: "late" | "due" | "quiet" };

/**
 * What to do next on a project row (spec §2 "next step first"):
 *  - finished projects need nothing
 *  - late (past due, still open) first, saying how late
 *  - no owner → assign one; no open tasks → add the first task
 *  - otherwise the due date or the open-task count
 */
export function projectNextStep(
  p: { status: string; due_date: string | null; assigned_to: string | null },
  openTasks: number,
  today: string,
): ProjectNextStep {
  if (p.status === "done" || p.status === "archived") return { text: "Nothing to do", tone: "quiet" };
  if (p.status === "paused") return { text: "Paused. Resume when ready", tone: "quiet" };
  if (p.due_date && p.due_date < today) {
    const late = daysBetween(p.due_date, today);
    return { text: `${late} ${late === 1 ? "day" : "days"} late. Set a new date or close it`, tone: "late" };
  }
  if (!p.assigned_to) return { text: "Assign an owner", tone: "due" };
  if (openTasks === 0) return { text: "Add the first task", tone: "due" };
  if (p.due_date) {
    const d = daysBetween(today, p.due_date);
    return { text: d === 0 ? "Due today" : `Due in ${d} ${d === 1 ? "day" : "days"}`, tone: d <= 7 ? "due" : "quiet" };
  }
  return { text: `${openTasks} open ${openTasks === 1 ? "task" : "tasks"}`, tone: "quiet" };
}
