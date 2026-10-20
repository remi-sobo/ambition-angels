import { addDays } from "@/lib/admin/ops/week";

/**
 * Needs you popout (specs/needs-you-popout-thank-yous.md, PR 2). PURE: the
 * per-type registry the popout shell reads, and the record links the Today
 * loader stamps on each row. Tests feed it fixtures.
 *
 * A registry, not branches: a new obligation type adds an entry here (and,
 * when it has quick actions, a panel in app/admin/today/_components/popout),
 * and the shell never changes. A type with no entry gets the fallback: the
 * shell alone, with Open full record, so nothing on the card is ever
 * unclickable.
 */

export type ObligationMeta = {
  /** The type chip in the popout header. */
  label: string;
  /** What the shell's primary button says. Absent → the type has no
   *  one-tap Done on Today (it resolves on its own screen). */
  primaryLabel?: string;
  /** What the record link says. */
  recordLabel: string;
};

const FALLBACK: ObligationMeta = { label: "Item", recordLabel: "Open full record" };

export const OBLIGATION_META: Record<string, ObligationMeta> = {
  ops_task: { label: "Task", primaryLabel: "Done", recordLabel: "Edit full task" },
  acknowledgment: { label: "Thank-you", primaryLabel: "Mark thanked", recordLabel: "Open donor" },
  grant_requirement: { label: "Grant requirement", primaryLabel: "Mark submitted", recordLabel: "Open grant" },
  compliance_item: { label: "Compliance", primaryLabel: "Mark filed", recordLabel: "Open filing" },
  fr_next_step: { label: "Next move", recordLabel: "Open donor" },
  capture: { label: "Recording", recordLabel: "Open recording" },
  session_unrecorded: { label: "Attendance", recordLabel: "Open session" },
  metric_stale: { label: "Metric", recordLabel: "Open metrics" },
  document_renewal: { label: "Document", recordLabel: "Open documents" },
  reconciliation_item: { label: "Reconciliation", recordLabel: "Open reconcile" },
  application_pending: { label: "Application", recordLabel: "Open applications" },
};

export function obligationMeta(type: string): ObligationMeta {
  return OBLIGATION_META[type] ?? FALLBACK;
}

type RecordInput = {
  type: string;
  source_id: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  /** Acknowledgments: the donor behind the gift (PR 1's gift facts). */
  constituent_id?: string | null;
};

/**
 * The per-record page for a row, or null when the type has no record page
 * (the caller falls back to the module list). ops_task has none: its record
 * is the full edit modal, which the popout opens in place.
 */
export function recordHref(r: RecordInput): string | null {
  switch (r.type) {
    case "acknowledgment":
      return r.constituent_id ? `/admin/fundraising/donors-funders/${r.constituent_id}` : null;
    case "compliance_item":
      return `/admin/organization/compliance/${r.source_id}`;
    case "grant_requirement":
      return r.related_entity_id ? `/admin/fundraising/grants/${r.related_entity_id}` : null;
    case "session_unrecorded":
      // related_entity_id is the cohort; the session is the row's own id.
      return r.related_entity_id
        ? `/admin/programs/cohorts/${r.related_entity_id}/sessions/${r.source_id}`
        : null;
    case "fr_next_step":
      return r.related_entity_id ? `/admin/fundraising/donors-funders/${r.related_entity_id}` : null;
    case "capture":
      return `/admin/capture/${r.source_id}`;
    default:
      return null;
  }
}

/** Snooze target: tomorrow for anything overdue or due today, else a week. */
export function snoozeUntil(due: string | null, today: string): string {
  return due && due <= today ? addDays(today, 1) : addDays(today, 7);
}

/** The id J (dir 1) or K (dir -1) moves to, or null at either end. */
export function neighborId(ids: readonly string[], current: string, dir: 1 | -1): string | null {
  const i = ids.indexOf(current);
  if (i === -1) return null;
  return ids[i + dir] ?? null;
}

/**
 * Where the popout goes after its item leaves the list (Done, Snooze): the
 * next item, else the previous one, else nothing (close). `ids` is the list
 * BEFORE removal.
 */
export function afterRemoval(ids: readonly string[], removed: string): string | null {
  const i = ids.indexOf(removed);
  if (i === -1) return null;
  return ids[i + 1] ?? ids[i - 1] ?? null;
}

/** Keys the popout listens for are ignored while the person is typing. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || typeof (el as HTMLElement).tagName !== "string") return false;
  const node = el as HTMLElement;
  const tag = node.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || node.isContentEditable === true;
}
