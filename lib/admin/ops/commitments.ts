/**
 * Week commitments (Weekly Plan v2, PR 3): turn this week's planned tasks into
 * the frozen week_commitments rows a Monday Plan commit writes. Pure;
 * tests/commitments.test.ts.
 *
 * The current flow has no per-task decision step yet (Choose, PR 7), so every
 * row is a `commit` inferred from the task's state at commit time:
 *   - placement, first match wins: on a work block -> block (with its id);
 *     on its own calendar block -> block; a prep:<event> label -> prep;
 *     placed on a day -> day; otherwise floating.
 *   - source is `backlog` for now: once a carryover task is pulled into the
 *     week its old planned_week is overwritten, so the server can't tell.
 *   - no defer/drop rows: a Carryover push or drop leaves no record tied to
 *     this session, and guessing would be worse than recording nothing.
 */

export type CommitTask = {
  id: string;
  title: string;
  planned_day: string | null;
  calendar_event_id: string | null;
  labels: string[] | null;
  estimated_minutes: number | null;
};

export type CommitPlacement = "day" | "block" | "prep" | "floating";

export type CommitRow = {
  org_id: string;
  session_id: string;
  user_id: string;
  week_of: string;
  task_id: string;
  task_title: string;
  decision: "commit";
  placement: CommitPlacement;
  planned_day: string | null;
  work_block_id: string | null;
  prep_for_event_id: string | null;
  estimated_minutes: number | null;
  source: "backlog";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The event id a prep:<id> label points at, or null if it has none. */
export function prepEventId(labels: string[] | null): string | null {
  for (const l of labels ?? []) {
    if (typeof l === "string" && l.startsWith("prep:")) return l.slice(5);
  }
  return null;
}

/** Prep label ids that could be calendar_events ids (bookings are "booking:<uuid>"). */
export function candidatePrepEventIds(tasks: CommitTask[]): string[] {
  const ids = new Set<string>();
  for (const t of tasks) {
    const id = prepEventId(t.labels);
    if (id && UUID_RE.test(id)) ids.add(id);
  }
  return Array.from(ids);
}

export function buildCommitRows(
  tasks: CommitTask[],
  ctx: {
    orgId: string;
    userId: string;
    sessionId: string;
    weekOf: string;
    /** task id -> the work block it sits on. */
    workBlockByTask: Map<string, string>;
    /** prep event ids confirmed to exist in calendar_events (org-scoped). */
    knownEventIds: Set<string>;
  }
): CommitRow[] {
  return tasks.map((t) => {
    const workBlockId = ctx.workBlockByTask.get(t.id) ?? null;
    const prepId = prepEventId(t.labels);
    let placement: CommitPlacement;
    if (workBlockId || t.calendar_event_id) placement = "block";
    else if (prepId) placement = "prep";
    else if (t.planned_day) placement = "day";
    else placement = "floating";

    return {
      org_id: ctx.orgId,
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      week_of: ctx.weekOf,
      task_id: t.id,
      task_title: t.title,
      decision: "commit",
      placement,
      planned_day: t.planned_day ?? null,
      work_block_id: workBlockId,
      prep_for_event_id:
        placement === "prep" && prepId && ctx.knownEventIds.has(prepId) ? prepId : null,
      estimated_minutes: t.estimated_minutes ?? null,
      source: "backlog",
    };
  });
}

/** Minimum characters for a light-week reason to count as a reason. */
export const LIGHT_WEEK_REASON_MIN = 3;

/**
 * The light-week guard: a commit with nothing in it must say why. Returns the
 * reason to store, null when none is needed, or undefined when one is needed
 * and missing.
 */
export function lightWeekReason(commitCount: number, raw: unknown): string | null | undefined {
  if (commitCount > 0) return null;
  const reason = typeof raw === "string" ? raw.trim().slice(0, 500) : "";
  return reason.length >= LIGHT_WEEK_REASON_MIN ? reason : undefined;
}
