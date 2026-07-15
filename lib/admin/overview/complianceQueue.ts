/**
 * Compliance → daily queue bridge (pure logic).
 *
 * A compliance item surfaces in its assignee's daily queue (MyQueueWidget on
 * the Ops panel / CEO cockpit) once its due date is COMPLIANCE_QUEUE_LEAD_DAYS
 * away or closer. Unassigned items never surface. The Supabase filter in
 * getQueueTasks mirrors isInComplianceQueue — this module exists so the window
 * rule is unit-testable without a database.
 */

import type { TaskPriority } from "@/app/admin/ops/_types/ops";

export const COMPLIANCE_QUEUE_LEAD_DAYS = 30;

/** Statuses under which a compliance item is still actionable. */
export const OPEN_COMPLIANCE_STATUSES = ["upcoming", "in_progress"] as const;

export type ComplianceQueueSource = {
  id: string;
  title: string;
  assigned_to: string | null;
  status: string;
  due_date: string; // ISO YYYY-MM-DD
  updated_at?: string | null;
};

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last due date (inclusive) that qualifies for the queue as of `today`. */
export function complianceQueueHorizon(today: string): string {
  return addDaysISO(today, COMPLIANCE_QUEUE_LEAD_DAYS);
}

/**
 * Whether an item belongs in `assignee`'s queue as of `today`. Assignee text
 * is compared case-insensitively ('Remi' ↔ 'remi'), matching the DB's ilike.
 */
export function isInComplianceQueue(
  item: ComplianceQueueSource,
  assignee: "remi" | "shannon",
  today: string
): boolean {
  if (!item.assigned_to || item.assigned_to.trim().toLowerCase() !== assignee) return false;
  if (!(OPEN_COMPLIANCE_STATUSES as readonly string[]).includes(item.status)) return false;
  return item.due_date <= complianceQueueHorizon(today);
}

export type ComplianceQueueEntry = {
  id: string;
  title: string;
  category: string;
  due: string;
  pinnedToday: boolean;
  priority: TaskPriority;
  href: string;
  updatedAt: string;
};

/** Shape a compliance item like a queue task so compareQueue can rank it. */
export function complianceQueueEntry(item: ComplianceQueueSource): ComplianceQueueEntry {
  return {
    id: `compliance:${item.id}`,
    title: item.title,
    category: "compliance",
    due: item.due_date,
    pinnedToday: false,
    priority: "high",
    href: "/admin/compliance",
    updatedAt: item.updated_at ?? "",
  };
}
