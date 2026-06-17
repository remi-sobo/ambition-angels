// Shared between the server page and the client controls — no "use client",
// so the server component can iterate these directly.

export const STATUS_ORDER = [
  "prospect", "outreach", "pilot", "active", "anchor", "lapsed",
] as const;

export type PartnerStatus = (typeof STATUS_ORDER)[number];

export const STATUS_LABELS: Record<string, string> = {
  prospect: "Prospect",
  outreach: "Emerging · in outreach",
  pilot: "Piloting",
  active: "Active",
  anchor: "Anchor partner",
  lapsed: "Lapsed",
};

// Short chip label (the per-row badge).
export const STATUS_SHORT: Record<string, string> = {
  prospect: "Prospect",
  outreach: "Emerging",
  pilot: "Pilot",
  active: "Active",
  anchor: "Anchor",
  lapsed: "Lapsed",
};

// Badge colour per stage (Tailwind classes from the admin palette).
export const STATUS_STYLE: Record<string, string> = {
  prospect: "bg-tile text-ink-2 border border-outline",
  outreach: "bg-blue-500/15 text-blue-400",
  pilot: "bg-orange/15 text-orange",
  active: "bg-revenue/15 text-revenue",
  anchor: "bg-revenue/20 text-revenue",
  lapsed: "bg-expense-bg text-expense",
};

// The two-tab split the pipeline is presented through (mirrors how the
// 2026 workbook separated "Prospective" from "Emerging/Current"):
//   • Pipeline — orgs actively being worked (emerging → anchor).
//   • Prospects — the cold/inbound list (status = prospect).
export type TabKey = "pipeline" | "prospects" | "all";

export const TAB_STATUSES: Record<TabKey, readonly PartnerStatus[]> = {
  pipeline: ["outreach", "pilot", "active", "anchor"],
  prospects: ["prospect"],
  all: STATUS_ORDER,
};

// One-step-forward target for the "Move forward →" quick action.
export const NEXT_STATUS: Partial<Record<PartnerStatus, PartnerStatus>> = {
  prospect: "outreach",
  outreach: "pilot",
  pilot: "active",
  active: "anchor",
};
