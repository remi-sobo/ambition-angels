// Shared between the server page and the client controls — no "use client",
// so the server component can iterate these directly.

export const STATUS_ORDER = [
  "prospect", "outreach", "pilot", "active", "anchor", "lapsed",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  prospect: "Prospects",
  outreach: "In outreach",
  pilot: "Pilots",
  active: "Active",
  anchor: "Anchor partners",
  lapsed: "Lapsed",
};
