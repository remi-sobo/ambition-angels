import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/admin/ops/week";
import { constituentName } from "@/lib/fundraising/display";

/**
 * Acknowledgments v2 — the ack-to-task bridge.
 *
 * A pending thank-you is a unit of work, not a status flag. This module turns
 * a gift that needs a personal thank-you into a real `ops_task`, so it flows to
 * the cockpit, the Ops queue, the Right Rail "Needs You" shelf, and the Today
 * queue with zero extra wiring — those surfaces already read `ops_tasks`.
 *
 * The task links to the CONSTITUENT (so the existing ♥ donor chip carries the
 * context) and carries two hidden labels: `sys:ack` marks it as an
 * acknowledgment, and `sys:gift:<id>` back-references the specific gift. Both
 * are hidden from the task chip UI — TaskRow filters labels with the `sys:`
 * prefix — so the queue stays clean.
 *
 * Phase 4 replaces the interim per-gift decisions here (SLA, assignee,
 * priority, and whether a task is created at all) with `stewardship_rules`.
 */

export const ACK_LABEL = "sys:ack";
export const GIFT_LABEL_PREFIX = "sys:gift:";
// A major-gift escalation task. Distinct from the gift label so it lives
// independently of Shannon's receipt task: it is not deduped against it and is
// not closed when the receipt is sent — the escalation owner closes it himself.
export const ESCALATE_LABEL_PREFIX = "sys:escalate:";

// Interim stewardship defaults until the matrix lands (Phase 4): a pending gift
// that needs a personal thank-you becomes a 48-hour task on the ops lead.
// ACK_DEFAULT_ASSIGNEE is the legacy last-ditch fallback only — live callers
// resolve the org's steward via lib/fundraising/steward.ts and pass it in.
export const ACK_DEFAULT_SLA_HOURS = 48;
export const ACK_DEFAULT_ASSIGNEE = "shannon" as const;

// Gifts that arrive in bulk (historical CSV imports, HubSpot deal backfill) are
// not live thank-you moments — tasking them would bury the queue. Only
// operator- and donor-initiated single gifts spawn a personal-touch task.
const TASKABLE_SOURCES = new Set(["manual", "pledge", "stripe"]);
export function isTaskableSource(src: string | null | undefined): boolean {
  return !!src && TASKABLE_SOURCES.has(src);
}

export function giftLabel(giftId: string): string {
  return GIFT_LABEL_PREFIX + giftId;
}

export function escalateLabel(giftId: string): string {
  return ESCALATE_LABEL_PREFIX + giftId;
}

export function parseGiftId(labels: string[] | null | undefined): string | null {
  const hit = (labels ?? []).find((l) => l.startsWith(GIFT_LABEL_PREFIX));
  return hit ? hit.slice(GIFT_LABEL_PREFIX.length) : null;
}

function usd(amount: number): string {
  const whole = Math.round(amount) === amount;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

// Donor-centered, plain, no em dashes (design directive).
export function ackTaskTitle(donorName: string, amount: number): string {
  return `Thank ${donorName} for the ${usd(amount)} gift`;
}

type DonorRow = {
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
};

type AckTaskGift = {
  orgId: string;
  createdBy: string;
  giftId: string;
  constituentId: string;
  donorName: string;
  amount: number;
  giftDate: string; // YYYY-MM-DD
  slaHours?: number;
  assignee?: string | null;
  priority?: "urgent" | "high" | "medium" | "low";
};

/** The ops_tasks insert row for an acknowledgment task. */
export function buildAckTaskInsert(g: AckTaskGift) {
  const slaDays = Math.max(1, Math.ceil((g.slaHours ?? ACK_DEFAULT_SLA_HOURS) / 24));
  return {
    org_id: g.orgId,
    title: ackTaskTitle(g.donorName, g.amount),
    category: "fundraising" as const,
    priority: g.priority ?? "medium",
    labels: [ACK_LABEL, giftLabel(g.giftId)],
    assigned_to: g.assignee === undefined ? ACK_DEFAULT_ASSIGNEE : g.assignee,
    created_by: g.createdBy,
    // SLA is measured from gift_date — a backdated or imported gift lands overdue.
    due_date: addDays(g.giftDate, slaDays),
    linked_entity_type: "constituent" as const,
    linked_entity_id: g.constituentId,
    linked_label: g.donorName,
  };
}

export async function openTaskByLabel(supabase: SupabaseClient, label: string): Promise<string | null> {
  const { data } = await supabase
    .from("ops_tasks")
    .select("id")
    .contains("labels", [label])
    .neq("status", "done")
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function openAckTaskId(supabase: SupabaseClient, giftId: string): Promise<string | null> {
  return openTaskByLabel(supabase, giftLabel(giftId));
}

/**
 * Idempotently ensure a pending gift has an open acknowledgment task. Returns
 * the task id (existing or new), or null when one can't/shouldn't be made.
 * Best-effort: never throws into the caller's gift-creation path.
 */
export async function ensureAckTaskForGift(
  supabase: SupabaseClient,
  g: Omit<AckTaskGift, "donorName"> & { donorName?: string }
): Promise<string | null> {
  try {
    const existing = await openAckTaskId(supabase, g.giftId);
    if (existing) return existing;

    let donorName = g.donorName;
    if (!donorName) {
      const { data: c } = await supabase
        .from("constituents")
        .select("type, first_name, last_name, org_name")
        .eq("id", g.constituentId)
        .maybeSingle();
      donorName = c ? constituentName(c as DonorRow) : "this donor";
    }

    const { data, error } = await supabase
      .from("ops_tasks")
      .insert(buildAckTaskInsert({ ...g, donorName }))
      .select("id")
      .single();
    if (error) {
      console.error("[ack-tasks] ensure failed:", error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (e) {
    console.error("[ack-tasks] ensure threw:", e);
    return null;
  }
}

/**
 * Close the open acknowledgment task(s) for a gift when its thank-you is done.
 * Returns the closed task id (for linking into the acknowledgments row), or
 * null if there was none. Best-effort.
 */
export async function closeAckTaskForGift(
  supabase: SupabaseClient,
  giftId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("ops_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .contains("labels", [giftLabel(giftId)])
      .neq("status", "done")
      .select("id");
    if (error) {
      console.error("[ack-tasks] close failed:", error.message);
      return null;
    }
    return (data as { id: string }[] | null)?.[0]?.id ?? null;
  } catch (e) {
    console.error("[ack-tasks] close threw:", e);
    return null;
  }
}

type EscalationGift = {
  orgId: string;
  createdBy: string;
  giftId: string;
  constituentId: string;
  donorName: string;
  amount: number;
  giftDate: string;
  assignee: string;
  slaHours?: number;
  /** The matched stewardship rule's name; titles the task when present, so an
   *  additive rule that isn't a major-gift escalation (e.g. a handwritten-note
   *  step) reads as itself. Absent → the classic major-gift copy. */
  ruleName?: string | null;
  /** The rule's template body; becomes the task description when present. */
  noteBody?: string | null;
};

/** The ops_tasks insert for an additive stewardship task (major-gift
 *  escalation by default; any rule-named extra touch when ruleName is set). */
export function buildEscalationTaskInsert(g: EscalationGift) {
  const slaDays = Math.max(1, Math.ceil((g.slaHours ?? 24) / 24));
  return {
    org_id: g.orgId,
    title: g.ruleName
      ? `${g.ruleName}: ${g.donorName} (${usd(g.amount)} gift)`
      : `Personally thank ${g.donorName} for their ${usd(g.amount)} major gift`,
    description: g.noteBody?.trim()
      ? g.noteBody
      : "A gift this size is yours to acknowledge personally. A call or a handwritten note from you goes a long way.",
    category: "fundraising" as const,
    priority: "high" as const,
    labels: [ACK_LABEL, escalateLabel(g.giftId)],
    assigned_to: g.assignee,
    created_by: g.createdBy,
    due_date: addDays(g.giftDate, slaDays),
    linked_entity_type: "constituent" as const,
    linked_entity_id: g.constituentId,
    linked_label: g.donorName,
  };
}

/**
 * Idempotently ensure a major gift has its own escalation task (a personal
 * touch for the escalation owner, e.g. Remi), independent of Shannon's receipt
 * task. Best-effort; never throws into the caller.
 */
export async function ensureEscalationTaskForGift(
  supabase: SupabaseClient,
  g: Omit<EscalationGift, "donorName"> & { donorName?: string }
): Promise<string | null> {
  try {
    const existing = await openTaskByLabel(supabase, escalateLabel(g.giftId));
    if (existing) return existing;

    let donorName = g.donorName;
    if (!donorName) {
      const { data: c } = await supabase
        .from("constituents")
        .select("type, first_name, last_name, org_name")
        .eq("id", g.constituentId)
        .maybeSingle();
      donorName = c ? constituentName(c as DonorRow) : "this donor";
    }

    const { data, error } = await supabase
      .from("ops_tasks")
      .insert(buildEscalationTaskInsert({ ...g, donorName }))
      .select("id")
      .single();
    if (error) {
      console.error("[ack-tasks] escalation ensure failed:", error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (e) {
    console.error("[ack-tasks] escalation ensure threw:", e);
    return null;
  }
}

export type AckQueueGift = {
  id: string;
  amount: number;
  gift_date: string;
  method: string;
  fair_market_value: number | null;
  deductible_amount: number | null;
  external_source: string | null;
  constituent_id: string | null;
  constituent: {
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    emails: string[];
    preferred_ack_channel: string | null;
  } | null;
  taskId: string | null;
};

/**
 * Read the pending-acknowledgment queue and reconcile it with its tasks in one
 * pass: create tasks for taskable pending gifts that lack one (covers the
 * Stripe and pledge paths without touching the DB trigger), and close tasks
 * whose gift is no longer pending (thanked elsewhere, or deleted on a pledge
 * reset). Returns the pending gifts annotated with their task id.
 */
export async function reconcileAckQueue(
  supabase: SupabaseClient,
  orgId: string,
  createdBy: string
): Promise<AckQueueGift[]> {
  const { data: giftsRaw } = await supabase
    .from("gifts")
    .select(
      "id, amount, gift_date, method, fair_market_value, deductible_amount, external_source, constituent_id, constituent:constituents(type, first_name, last_name, org_name, emails, preferred_ack_channel)"
    )
    .eq("org_id", orgId)
    .eq("acknowledgment_status", "pending")
    .order("gift_date", { ascending: true })
    .limit(200);
  const gifts = ((giftsRaw ?? []) as unknown as AckQueueGift[]).map((g) => ({
    ...g,
    amount: Number(g.amount),
  }));

  const { data: tasksRaw } = await supabase
    .from("ops_tasks")
    .select("id, labels")
    .eq("org_id", orgId)
    .contains("labels", [ACK_LABEL])
    .neq("status", "done")
    .is("archived_at", null);
  const tasks = (tasksRaw ?? []) as { id: string; labels: string[] }[];

  const giftToTask = new Map<string, string>();
  for (const t of tasks) {
    const gid = parseGiftId(t.labels);
    if (gid) giftToTask.set(gid, t.id);
  }
  const pendingIds = new Set(gifts.map((g) => g.id));

  // Create tasks for taskable pending gifts that don't have one yet.
  const toCreate = gifts.filter(
    (g) => g.constituent_id && isTaskableSource(g.external_source) && !giftToTask.has(g.id)
  );
  if (toCreate.length) {
    const inserts = toCreate.map((g) =>
      buildAckTaskInsert({
        orgId,
        createdBy,
        giftId: g.id,
        constituentId: g.constituent_id as string,
        donorName: g.constituent ? constituentName(g.constituent) : "this donor",
        amount: g.amount,
        giftDate: g.gift_date,
      })
    );
    const { data: created, error } = await supabase
      .from("ops_tasks")
      .insert(inserts)
      .select("id, labels");
    if (error) console.error("[ack-tasks] reconcile create failed:", error.message);
    for (const t of (created ?? []) as { id: string; labels: string[] }[]) {
      const gid = parseGiftId(t.labels);
      if (gid) giftToTask.set(gid, t.id);
    }
  }

  // Close tasks whose gift is no longer pending (handled elsewhere or deleted).
  const staleIds = tasks
    .filter((t) => {
      const gid = parseGiftId(t.labels);
      return gid && !pendingIds.has(gid);
    })
    .map((t) => t.id);
  if (staleIds.length) {
    await supabase
      .from("ops_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .in("id", staleIds);
  }

  return gifts.map((g) => ({ ...g, taskId: giftToTask.get(g.id) ?? null }));
}
