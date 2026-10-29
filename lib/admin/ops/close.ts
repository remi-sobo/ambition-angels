/**
 * Friday Close against the Monday commit (Weekly Plan v2, PR 4). Pure;
 * tests/close.test.ts.
 *
 * Outcomes come from what the task's own buttons already did, so Close needs
 * no new write for the common cases:
 *   done      the task is done
 *   dropped   the task was archived (or deleted)
 *   deferred  the task was rolled to a later week
 *   missed    still open in this week (it shows up in Monday's Carryover)
 *   partial   the one explicit outcome: "Partly done", saved on the row
 * A done task reads done even if it was marked partial earlier.
 */

export type Outcome = "done" | "partial" | "missed" | "deferred" | "dropped";

export const OUTCOMES: readonly Outcome[] = ["done", "partial", "missed", "deferred", "dropped"];

export function isOutcome(v: unknown): v is Outcome {
  return typeof v === "string" && (OUTCOMES as readonly string[]).includes(v);
}

export type OutcomeTask = {
  status: string;
  archived_at: string | null;
  planned_week: string | null;
};

export function deriveOutcome(
  task: OutcomeTask | null,
  weekOf: string,
  explicit: Outcome | null
): Outcome {
  if (!task) return explicit ?? "dropped"; // task deleted since the commit
  if (task.status === "done") return "done";
  if (explicit === "partial") return "partial";
  if (task.archived_at) return "dropped";
  if (task.planned_week && task.planned_week > weekOf) return "deferred";
  return "missed";
}

export type CloseStats = {
  committed: number;
  committed_done: number;
  partial: number;
  missed: number;
  deferred: number;
  dropped: number;
  added_midweek: number;
};

export function buildCloseStats(outcomes: Outcome[], addedMidweek: number): CloseStats {
  const n = (o: Outcome) => outcomes.filter((x) => x === o).length;
  return {
    committed: outcomes.length,
    committed_done: n("done"),
    partial: n("partial"),
    missed: n("missed"),
    deferred: n("deferred"),
    dropped: n("dropped"),
    added_midweek: addedMidweek,
  };
}

/** The short label an outcome wears on Close and on Monday's Carryover. */
export const OUTCOME_LABEL: Record<Outcome, string> = {
  done: "done",
  partial: "partly done",
  missed: "missed",
  deferred: "deferred",
  dropped: "dropped",
};

/**
 * Monday Carryover label for a slipped task, from its latest commitment in an
 * earlier week. Only the outcomes that land a task in Carryover get one.
 */
export function carryoverOutcomeLabel(outcome: Outcome | null): string | null {
  if (outcome === "missed") return "missed last week";
  if (outcome === "partial") return "partly done last week";
  return null;
}
