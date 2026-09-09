/**
 * Spec Home, stage H1 — the Needs-you ranking rule. PURE (the loader feeds
 * it v_obligations rows; tests feed it fixtures).
 *
 * The flood guard: AA has ~103 open obligations, and Today shows at most
 * SHOW_CAP of them — ranked, never truncated arbitrarily. The rule
 * (spec §Architecture): overdue first (most overdue at top), then due
 * today, then future-dated (soonest first), then undated by source weight —
 * primary human-owned sources (ops_task, grant_requirement) over derived
 * arms. Ties break by source weight, then title, so the order is stable.
 *
 * why_it_matters renders when present; when the column is NULL (most
 * pre-contract rows) the fallback line is HONEST and type-specific — never
 * a bare checkbox, never an invented stake.
 */

export const SHOW_CAP = 7;

export type ObligationRow = {
  id: string; // 'type:uuid' (Contract 3)
  type: string;
  title: string;
  why_it_matters: string | null;
  due_date: string | null; // YYYY-MM-DD
  state: "open" | "in_progress" | "blocked";
  module: string;
};

/** Lower = more urgent among undated rows / on ties. The two primary
 *  human-owned sources outrank the derived arms. */
const SOURCE_WEIGHT: Record<string, number> = {
  ops_task: 0,
  grant_requirement: 0,
  fr_next_step: 1, // a dated human move (F5) — always dated, so this is a tiebreak
  compliance_item: 1,
  reconciliation_item: 2,
  acknowledgment: 3,
  document_renewal: 3,
  application_pending: 4,
  session_unrecorded: 4,
  metric_stale: 5,
};

const weight = (type: string) => SOURCE_WEIGHT[type] ?? 6;

function bucket(due: string | null, today: string): number {
  if (!due) return 3;
  if (due < today) return 0;
  if (due === today) return 1;
  return 2;
}

/** Full ranked list (the caller slices to SHOW_CAP; "show all N" renders the
 *  rest in the same order — open decision 1, resolved: expand-in-place). */
export function rankObligations<T extends ObligationRow>(rows: readonly T[], today: string): T[] {
  return [...rows].sort((a, b) => {
    const ba = bucket(a.due_date, today);
    const bb = bucket(b.due_date, today);
    if (ba !== bb) return ba - bb;
    // Overdue: most overdue first; future: soonest first — both ascending.
    if (ba === 0 || ba === 2) {
      if (a.due_date! !== b.due_date!) return a.due_date! < b.due_date! ? -1 : 1;
    }
    const wa = weight(a.type);
    const wb = weight(b.type);
    if (wa !== wb) return wa - wb;
    return a.title.localeCompare(b.title);
  });
}

/** The honest per-type line rendered when why_it_matters is NULL. States
 *  what the row IS, never invents a stake. */
export function whyFallback(row: ObligationRow, today: string): string {
  const due = row.due_date
    ? row.due_date < today
      ? `was due ${row.due_date}`
      : row.due_date === today
        ? "due today"
        : `due ${row.due_date}`
    : "no due date";
  switch (row.type) {
    case "ops_task":
      return `Task${row.state === "blocked" ? " (blocked)" : ""} — ${due}. No reason recorded yet.`;
    case "grant_requirement":
      return `Grant requirement — ${due}.`;
    case "compliance_item":
      return `Compliance filing — ${due}.`;
    case "acknowledgment":
      return `A gift is waiting on its thank-you (${due}).`;
    case "fr_next_step":
      return `A move you set on an open ask — ${due}.`;
    case "reconciliation_item":
      return "A reconciliation proposal is waiting for review.";
    case "document_renewal":
      return `A document needs renewal — ${due}.`;
    case "metric_stale":
      return "This metric is past its update cadence.";
    case "application_pending":
      return "An application is waiting on a decision.";
    case "session_unrecorded":
      return "A session happened; attendance was never recorded.";
    default:
      return `Filed under ${row.module} — ${due}.`;
  }
}
