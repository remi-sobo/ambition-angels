import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getActionQueue } from "@/lib/admin/actionQueue";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import { FINANCE, TASKS } from "@/lib/admin/thresholds";

/**
 * Operating Spine — Phase 4: the deterministic Command Center statusLine and the
 * "changed since you were last here" diff. Rule-based only — no model calls;
 * Reed narrates on top of this surface later (spec #6), Reed does not decide.
 *
 * The statusLine reuses the same canonical reads the rest of BloomOS trusts:
 * finance from getFinanceSnapshot() (cash/burn/runway can't drift from the
 * Finance dashboard) and open items from getActionQueue() (the v_action_items
 * spine, RLS-scoped). Thresholds come from lib/admin/thresholds, never inline
 * literals.
 *
 * The diff anchors on user_org_state: last_seen_at bumps on every load, while
 * prev_seen_at — the anchor the diff renders against — only rolls forward
 * when the previous visit ended a real absence (SESSION_GAP), so a page
 * refresh doesn't collapse the window to "since ten seconds ago".
 */

const SESSION_GAP_MS = 30 * 60 * 1000;

export type StatusLevel = "critical" | "watch" | "steady";

export type StatusLine = {
  level: StatusLevel;
  /** One line naming the real conditions behind the level. */
  line: string;
  runwayMonths: number | null;
  overdueCount: number;
  acksDue: number;
  openCount: number;
};

export const getStatusLine = cache(async (): Promise<StatusLine> => {
  const [finance, queue] = await Promise.all([getFinanceSnapshot(), getActionQueue()]);
  const today = new Date().toISOString().slice(0, 10);

  const overdue = queue.filter((it) => it.dueDate != null && it.dueDate < today);
  // Thank-yous due: acknowledgment rows plus the ops tasks that mirror one
  // (the queue keeps only one row per gift — the `ack` flag marks both forms).
  const acksDue = queue.filter((it) => it.ack).length;
  const runway = finance.runwayMonths;

  const parts: string[] = [];
  if (runway != null) parts.push(`${runway.toFixed(1)} months of runway`);
  parts.push(
    overdue.length === 0 ? "nothing overdue" : `${overdue.length} overdue item${overdue.length === 1 ? "" : "s"}`,
  );
  if (acksDue > 0) parts.push(`${acksDue} thank-you${acksDue === 1 ? "" : "s"} due`);

  let level: StatusLevel = "steady";
  let lead = "Steady";
  if ((runway != null && runway <= FINANCE.runwayCriticalMonths) || overdue.length >= TASKS.overdueCriticalCount) {
    level = "critical";
    lead = runway != null && runway <= FINANCE.runwayCriticalMonths ? "Act on runway" : "Clear the overdue pile";
  } else if (
    (runway != null && runway <= FINANCE.runwayWatchMonths) ||
    finance.cashOnHand <= FINANCE.cashFloorUsd ||
    overdue.length > 0
  ) {
    level = "watch";
    lead = "Watch";
  }

  return {
    level,
    line: `${lead}: ${parts.join(", ")}.`,
    runwayMonths: runway,
    overdueCount: overdue.length,
    acksDue,
    openCount: queue.length,
  };
});

export type ChangeSince = {
  /** ISO timestamp the diff is measured from; null on a first visit. */
  since: string | null;
  giftsCount: number;
  giftsTotal: number;
  tasksCompleted: number;
  tasksCreated: number;
  reconProposals: number;
};

/**
 * Read the diff anchor, compute what changed, and stamp this visit.
 * Session-client throughout: RLS keeps every count org- and permission-scoped,
 * and user_org_state rows are self-only by policy.
 */
export const getChangeSince = cache(async (): Promise<ChangeSince | null> => {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();
  const now = new Date();

  const { data: state } = await supabase
    .from("user_org_state")
    .select("last_seen_at, prev_seen_at")
    .eq("user_id", ctx.userId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  const lastSeen = state?.last_seen_at ? new Date(state.last_seen_at as string) : null;
  const anchor: string | null = lastSeen
    ? now.getTime() - lastSeen.getTime() > SESSION_GAP_MS
      ? (state!.last_seen_at as string) // real absence — the diff starts at the last visit
      : ((state!.prev_seen_at as string | null) ?? null) // same session — keep the anchor
    : null;

  await supabase.from("user_org_state").upsert(
    {
      user_id: ctx.userId,
      org_id: ctx.orgId,
      last_seen_at: now.toISOString(),
      prev_seen_at: anchor,
    },
    { onConflict: "user_id,org_id" },
  );

  if (!anchor) {
    return { since: null, giftsCount: 0, giftsTotal: 0, tasksCompleted: 0, tasksCreated: 0, reconProposals: 0 };
  }

  const count = async (table: string, timeCol: string) => {
    const { count: n } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .gt(timeCol, anchor);
    return n ?? 0;
  };

  const [gifts, tasksCompleted, tasksCreated, reconProposals] = await Promise.all([
    supabase
      .from("gifts")
      .select("amount")
      .eq("org_id", ctx.orgId)
      .gt("created_at", anchor)
      .limit(1000)
      .then((res) => {
        const rows = (res.data ?? []) as { amount: number }[];
        return { count: rows.length, total: rows.reduce((s, r) => s + Number(r.amount || 0), 0) };
      }),
    count("ops_tasks", "completed_at"),
    count("ops_tasks", "created_at"),
    count("fin_reconciliation_items", "created_at"),
  ]);

  return {
    since: anchor,
    giftsCount: gifts.count,
    giftsTotal: gifts.total,
    tasksCompleted,
    tasksCreated,
    reconProposals,
  };
});
