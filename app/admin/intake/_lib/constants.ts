// Shared between the server page and the client controls — no "use client",
// so the server component can read these directly.

export const APP_STATUS_LABELS: Record<string, string> = {
  new: "New",
  eligible: "Eligible",
  ineligible: "Ineligible",
  waitlisted: "Waitlisted",
  offered: "Offered",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};
