// Shared between the server pages and the client controls — no "use client",
// so the server components can read these directly.

export const COHORT_STATUSES = ["planning", "active", "completed", "archived"] as const;

export const COHORT_STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};
