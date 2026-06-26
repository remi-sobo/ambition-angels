// Shared between the server pages and the client controls — no "use client",
// so the server components can iterate these directly.

export const STAGES = [
  "prospect", "qualified", "loi", "proposal", "submitted",
  "awarded", "declined", "active", "closed",
] as const;

// Pipeline columns for the drag board, in order. Declined/closed are terminal
// and collapse into the board footer rather than getting drag columns. Lives
// here (not in the client GrantsBoard) so the server grants page can filter by
// it without importing a value across the client boundary — calling a method on
// a client-module export from the server throws at request time.
export const BOARD_STAGES = [
  "prospect", "qualified", "loi", "proposal", "submitted", "awarded", "active",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  prospect: "Prospect", qualified: "Qualified", loi: "LOI",
  proposal: "Proposal", submitted: "Submitted", awarded: "Awarded",
  declined: "Declined", active: "Active", closed: "Closed",
};
