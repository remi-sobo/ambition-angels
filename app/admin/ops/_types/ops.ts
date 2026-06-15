/**
 * Shared types and constants for the Ops domain (ops_projects + ops_tasks).
 * Mirrors the Postgres schema from PR Ops-1.
 *
 * Display labels are computed at render time from these values (title-case
 * via a small helper) — not stored.
 */

export const CATEGORIES = [
  "fundraising",
  "admin",
  "board",
  "recruitment",
  "program",
  "finance",
  "compliance",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "done", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PROJECT_STATUSES = ["active", "paused", "done", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type AdminUserId = "remi" | "shannon";

export type OpsTask = {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  category: Category;
  status: TaskStatus;
  assigned_to: AdminUserId | null;
  created_by: AdminUserId;
  due_date: string | null; // ISO date (YYYY-MM-DD)
  pinned_for_today: boolean;
  pinned_for_this_week: boolean;
  display_order: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type OpsProject = {
  id: string;
  title: string;
  category: Category;
  status: ProjectStatus;
  description: string | null;
  assigned_to: AdminUserId | null;
  created_by: AdminUserId;
  due_date: string | null;
  last_touched_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function categoryLabel(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}

export function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === "string" && (PROJECT_STATUSES as readonly string[]).includes(v);
}

export function isAdminUserId(v: unknown): v is AdminUserId {
  return v === "remi" || v === "shannon";
}

// ── Style helpers ──────────────────────────────────────────────────────────
// Centralized so all components render consistent colors.

const CATEGORY_BADGE_STYLES: Record<Category, string> = {
  fundraising: "bg-orange/15 text-orange border-orange/30",
  admin: "bg-zinc-500/15 text-zinc-700 border-zinc-500/30",
  board: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  recruitment: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  program: "bg-revenue-bg text-revenue border-revenue/30",
  finance: "bg-[#F4E8D0] text-[#A56A1B] border-[#D9BE86]",
  compliance: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  other: "bg-tile text-ink-2 border-outline",
};

export function categoryBadgeClass(c: Category | string): string {
  if (isCategory(c)) return CATEGORY_BADGE_STYLES[c];
  return CATEGORY_BADGE_STYLES.other;
}

const TASK_STATUS_BADGE_STYLES: Record<TaskStatus, string> = {
  todo: "bg-tile text-ink-2 border-outline",
  in_progress: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  done: "bg-revenue-bg text-revenue border-revenue/30",
  blocked: "bg-expense-bg text-expense border-expense/30",
};

export function taskStatusBadgeClass(s: TaskStatus | string): string {
  if (isTaskStatus(s)) return TASK_STATUS_BADGE_STYLES[s];
  return TASK_STATUS_BADGE_STYLES.todo;
}

const PROJECT_STATUS_BADGE_STYLES: Record<ProjectStatus, string> = {
  active: "bg-revenue-bg text-revenue border-revenue/30",
  paused: "bg-[#F4E8D0] text-[#A56A1B] border-[#D9BE86]",
  done: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  archived: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export function projectStatusBadgeClass(s: ProjectStatus | string): string {
  if (isProjectStatus(s)) return PROJECT_STATUS_BADGE_STYLES[s];
  return PROJECT_STATUS_BADGE_STYLES.active;
}

// ── Date / relative time helpers ───────────────────────────────────────────

export function todayISO(): string {
  // Server-local YYYY-MM-DD. Acceptable for v1 — admin users are all in
  // the same broad timezone band.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDueLabel(iso: string | null): string {
  if (!iso) return "—";
  const today = todayISO();
  if (iso === today) return "Today";
  // Compute "tomorrow" by adding one day to today.
  const t = new Date(today + "T00:00:00");
  t.setDate(t.getDate() + 1);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  if (iso === tomorrow) return "Tomorrow";
  // Otherwise absolute: "May 23"
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
