// Shared between the server pages and the client controls — no "use client",
// so the server components can iterate these directly.

export const STAGES = [
  "prospect", "qualified", "loi", "proposal", "submitted",
  "awarded", "declined", "active", "closed",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  prospect: "Prospect", qualified: "Qualified", loi: "LOI",
  proposal: "Proposal", submitted: "Submitted", awarded: "Awarded",
  declined: "Declined", active: "Active", closed: "Closed",
};
