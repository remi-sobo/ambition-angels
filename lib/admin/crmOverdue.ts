import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Overdue tasks across the CRM — open ops_tasks linked to a partner org or a
// constituent (donor) whose due date has passed. Powers the weekly digest
// (email + in-app) and any "what's slipping" surface. linked_label is
// denormalised on the task, so this needs no joins.

export type CrmOverdueTask = {
  id: string;
  title: string;
  due_date: string;
  entityType: "partner" | "constituent";
  entityId: string;
  label: string;
  daysOverdue: number;
  assignedTo: "remi" | "shannon" | null;
};

export type CrmOverdue = {
  all: CrmOverdueTask[];
  partners: CrmOverdueTask[];
  donors: CrmOverdueTask[];
  total: number;
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ambitionangels.org";

// Absolute (email) / relative (in-app) profile link for an overdue task.
export function crmTaskHref(t: CrmOverdueTask, absolute = false): string {
  const path =
    t.entityType === "partner"
      ? `/admin/partners/${t.entityId}`
      : `/admin/fundraising/donors/${t.entityId}`;
  return absolute ? `${SITE}${path}` : path;
}

// Map an operator email to an admin user id, so the Monday digest can scope
// to "your" overdue work. The two operators' mailboxes are remi@… / shannon@…,
// so the local-part is the reliable key.
export function assigneeFromEmail(email: string): "remi" | "shannon" | null {
  const local = email.toLowerCase().split("@")[0];
  if (local === "remi") return "remi";
  if (local === "shannon") return "shannon";
  return null;
}

// Pure: regroup a flat task list into the {all, partners, donors, total} shape
// (used to re-scope by assignee without another DB round-trip).
export function groupOverdue(tasks: CrmOverdueTask[]): CrmOverdue {
  return {
    all: tasks,
    partners: tasks.filter((t) => t.entityType === "partner"),
    donors: tasks.filter((t) => t.entityType === "constituent"),
    total: tasks.length,
  };
}

export async function gatherCrmOverdue(
  today = new Date().toISOString().slice(0, 10)
): Promise<CrmOverdue> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("ops_tasks")
    .select("id, title, due_date, linked_entity_type, linked_entity_id, linked_label, assigned_to")
    .neq("status", "done")
    .not("linked_entity_type", "is", null)
    .not("due_date", "is", null)
    .lt("due_date", today)
    .order("due_date", { ascending: true })
    .limit(300);

  const all: CrmOverdueTask[] = [];
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  for (const t of (data ?? []) as Array<{
    id: string; title: string; due_date: string | null;
    linked_entity_type: "partner" | "constituent" | null; linked_entity_id: string | null;
    linked_label: string | null; assigned_to: "remi" | "shannon" | null;
  }>) {
    if (!t.due_date || !t.linked_entity_id || !t.linked_entity_type) continue;
    const daysOverdue = Math.max(0, Math.round((todayMs - Date.parse(`${t.due_date}T00:00:00Z`)) / 86400000));
    all.push({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      entityType: t.linked_entity_type,
      entityId: t.linked_entity_id,
      label: t.linked_label ?? "—",
      daysOverdue,
      assignedTo: t.assigned_to ?? null,
    });
  }
  return groupOverdue(all);
}

