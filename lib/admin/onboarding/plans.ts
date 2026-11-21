import type { FeatureKey } from "@/lib/admin/entitlements";

/**
 * V4 Stage F: named plans for the operator setup script
 * (specs/bloomos-v4-product-readiness.md §11). A plan is the starting set of
 * org_entitlements rows a new org gets; billing is out of scope, so this is
 * only "which parts of BloomOS are on".
 *
 * Rules held by tests/setup-org-planner.test.ts:
 *  - no plan ever holds an aa.* key (those fence Ambition Angels' own
 *    website-coupled surfaces and are never seeded for anyone else);
 *  - every key is a real FeatureKey (a typo is a compile error here).
 *
 * The script only ADDS missing keys. An org whose operator turned something
 * else on by hand keeps it; the dry run lists it as "left as is".
 */

export type PlanName = "essentials" | "pilot" | "programs";

const ESSENTIALS: FeatureKey[] = [
  "modules.fundraising",
  "modules.finance",
  "modules.comms",
  "modules.ops",
  "modules.meetings",
  "modules.messages",
  "modules.documents",
  "ai.capture",
];

const PILOT: FeatureKey[] = [
  ...ESSENTIALS,
  "modules.strategy",
  "modules.board",
  "modules.compliance",
  "modules.staff",
  "modules.metrics",
];

const PROGRAMS: FeatureKey[] = [...PILOT, "modules.program", "modules.partners"];

export const PLANS: Record<PlanName, { label: string; blurb: string; features: readonly FeatureKey[] }> = {
  essentials: {
    label: "Essentials",
    blurb: "Fundraising, Comms, Finance, Work and Talk to log.",
    features: ESSENTIALS,
  },
  pilot: {
    label: "Pilot",
    blurb: "Essentials plus Strategy, Board, Compliance, Team and Impact metrics. Programs off.",
    features: PILOT,
  },
  programs: {
    label: "Pilot with Programs",
    blurb: "Everything in Pilot plus Programs (rosters, cohorts, attendance) and Partners.",
    features: PROGRAMS,
  },
};

export function isPlanName(v: unknown): v is PlanName {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PLANS, v);
}
