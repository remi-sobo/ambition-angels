/**
 * Executive Briefing engine — shared types (spec Phase 4).
 *
 * A BriefingItem is the unit of "something needs the operator today". Every
 * item is deterministic and traceable to a real source record (no model
 * output). Signal sources are pure functions that read one slice of the spine
 * and return zero or more of these; the engine ranks, caps, and renders them.
 */

export type Severity = "critical" | "watch" | "due_soon";

export type BriefingSource =
  | "finance"
  | "tasks"
  | "major_gifts"
  | "compliance"
  | "donors"
  | "engagement"
  | "strategy"
  | "sync";

export type Decision = "open" | "mark_done" | "snooze" | "dismiss";

export type BriefingItem = {
  /** Stable key for snooze/dismiss/done state. Same inputs ⇒ same id. */
  id: string;
  source: BriefingSource;
  severity: Severity;
  /** One line, plain English, names the thing. */
  title: string;
  /** One line, the why, with a number in it. */
  detail: string;
  /** The number that matters, if any (already formatted). */
  metric?: string;
  /** Intra-severity ranking weight (dollars or urgency). Higher = first. */
  weight: number;
  /** Intra-severity tiebreak by due date (ISO), earliest first. */
  dueDate?: string;
  decisions: Decision[];
  /** Route to the source page, pre-filtered to the record where possible. */
  deepLink: string;
  computedAt: string;
  /** Age (days) of the spine data this was computed from; null if unknown. */
  dataAgeDays: number | null;
  /** True when computed off a stale spine — the engine demotes/flags these. */
  staleFlag: boolean;
};

/** Severity → rank (lower sorts first). The load-bearing order of the feed. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  watch: 1,
  due_soon: 2,
};

/** Severity → the five-value status scale used by <StatusChip>. */
export const SEVERITY_STATUS: Record<Severity, "critical" | "watch" | "due"> = {
  critical: "critical",
  watch: "watch",
  due_soon: "due",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  watch: "Watch",
  due_soon: "Due soon",
};
