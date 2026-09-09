import type { FeatureKey } from "@/lib/admin/entitlements";

// ── BloomOS V2 IA ───────────────────────────────────────────────────────────
// The single source of truth for the admin information architecture: seven
// destinations plus the Inbox utility, one tab row each, no third level.
// The V1 model (NAV_SECTIONS, the sidebar sections and sub-topic bars) was
// DELETED here — Spec B's named cleanup, discharged when the last
// destination cut over (Spec Inbox X2): two live nav models drift, so the
// doomed one did not outlive the cutover.
//
// `feature` is THE mapping from nav entry to entitlement key (core fence
// spec §6b): entries whose org lacks the key are filtered out, and the
// matching module layout gates the routes themselves. Entries without a
// `feature` are platform surfaces every tenant gets.

export type IconName =
  | "overview" | "briefing" | "inbox" | "messages"
  | "students" | "cohorts" | "intake" | "demoday" | "camp" | "schools" | "app" | "internships" | "career"
  | "majorgifts" | "donors" | "grants" | "campaigns" | "events"
  | "finance" | "revenue" | "expenses" | "budget" | "cashflow"
  | "webanalytics" | "appanalytics" | "studentanalytics" | "surveys"
  | "week" | "tasks" | "monday" | "friday" | "projects" | "meetings" | "team" | "documents"
  | "board" | "compliance" | "kpis" | "strategy";


/** A nav entry's display label: the org's terminology when the entry is
 *  term-driven and a resolved label was passed down, else the code default. */
export function itemLabel(
  entry: { label: string; term?: string },
  terms?: Record<string, string> | null
): string {
  return (entry.term && terms?.[entry.term]) || entry.label;
}

function allowed(entry: { feature?: FeatureKey }, features?: string[] | null): boolean {
  // null features = no session yet (login screen) — show the full IA rather
  // than a stripped nav; B2 de-AAs the pre-auth shell.
  return !features || !entry.feature || features.includes(entry.feature);
}

// ── BloomOS V2 (Spec B, stage B1): the seven-destination model ──────────────
// The locked route map (Handoff Spec §05): seven destinations, one tab row
// each, no third level. Structure is code — a tenant cannot invent an eighth
// destination — while visibility is data (org_entitlements) and labels are
// data (org_terminology via itemLabel()).
//
// Two rules this model exists to enforce (Spec B):
//   1. A destination's landing tab is COMPUTED: resolve its tab list against
//      the org's entitlements and route to the first survivor. Never a
//      constant — Organization lands on Strategy for AA/YGB and on Board for
//      Young Life EPA/SafeSpace from the same declaration.
//   2. A destination whose tab list resolves empty disappears from the
//      sidebar entirely. No live org hits this today; the fifth tenant will.
//
// Tab hrefs are the canonical V2 routes. B2 ships the V1→V2 redirects and B3
// mounts the (v2) shell; until then these paths are model-only. The URL
// always names the resolved tab, never the destination alone, so a shared
// link is unambiguous across tenants. Tab ORDER is the landing priority.

export type V2Tab = {
  /** Stable id, unique within the destination (e.g. "plan-close"). */
  key: string;
  label: string;
  /** Canonical V2 route for this tab. */
  href: string;
  feature?: FeatureKey;
  /** Terminology key (org_terminology → entity_types fallback), per B4. */
  term?: string;
};

export type V2Destination = {
  key: string;
  label: string;
  icon: IconName;
  tabs: V2Tab[];
};

export const V2_DESTINATIONS: V2Destination[] = [
  {
    key: "home",
    label: "Home",
    icon: "overview",
    // Platform surfaces: no gates. Every tenant gets Today and Health.
    tabs: [
      { key: "today", label: "Today", href: "/admin/today" },
      { key: "organization-health", label: "Organization Health", href: "/admin/organization-health" },
    ],
  },
  {
    key: "work",
    label: "Work",
    icon: "week",
    tabs: [
      { key: "plan-close", label: "Plan & Close", href: "/admin/work/plan-close", feature: "modules.ops" },
      // The week grid pairs with the Google calendar connection, which ships
      // under the meetings module — the two 9-key orgs lose My Week with it.
      { key: "my-week", label: "My Week", href: "/admin/work/my-week", feature: "modules.meetings" },
      { key: "tasks", label: "Tasks", href: "/admin/work/tasks", feature: "modules.ops" },
      { key: "projects", label: "Projects", href: "/admin/work/projects", feature: "modules.ops" },
      { key: "meetings", label: "Meetings", href: "/admin/work/meetings", feature: "modules.meetings" },
      { key: "documents", label: "Documents", href: "/admin/work/documents", feature: "modules.documents" },
    ],
  },
  {
    key: "programs",
    label: "Programs",
    icon: "students",
    tabs: [
      { key: "overview", label: "Overview", href: "/admin/programs/overview", feature: "modules.program" },
      // term "student": only an org's OWN rename relabels People (B4 —
      // shellTermLabels is override-only here, so the registry's generic
      // "Student" never clobbers the V2 name).
      { key: "people", label: "People", href: "/admin/programs/people", feature: "modules.program", term: "student" },
      { key: "intake", label: "Intake", href: "/admin/programs/intake", feature: "modules.program" },
      { key: "cohorts", label: "Cohorts", href: "/admin/programs/cohorts", feature: "modules.program", term: "cohort" },
      { key: "attendance", label: "Attendance", href: "/admin/programs/attendance", feature: "modules.program" },
      { key: "partners", label: "Partners", href: "/admin/programs/partners", feature: "modules.partners", term: "partner" },
      { key: "content", label: "Content", href: "/admin/programs/content", feature: "modules.content" },
    ],
  },
  {
    key: "fundraising",
    label: "Fundraising",
    icon: "majorgifts",
    tabs: [
      { key: "today", label: "Today", href: "/admin/fundraising/today", feature: "modules.fundraising" },
      { key: "donors-funders", label: "Donors & Funders", href: "/admin/fundraising/donors-funders", feature: "modules.fundraising" },
      { key: "pipeline", label: "Pipeline", href: "/admin/fundraising/pipeline", feature: "modules.fundraising" },
      { key: "grants", label: "Grants", href: "/admin/fundraising/grants", feature: "modules.fundraising" },
      { key: "campaigns", label: "Campaigns", href: "/admin/fundraising/campaigns", feature: "modules.fundraising" },
      // Prospect research (ai.prospect_research) is deliberately NOT a sixth
      // tab: only AA and YGB hold the key, and a tab present for two of four
      // orgs makes the row a different width per tenant. It is a full-height
      // drawer off Donors & Funders (signed ruling R1).
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: "finance",
    tabs: [
      { key: "snapshot", label: "Snapshot", href: "/admin/finance/snapshot", feature: "modules.finance" },
      { key: "transactions", label: "Transactions", href: "/admin/finance/transactions", feature: "modules.finance" },
      { key: "budget", label: "Budget", href: "/admin/finance/budget", feature: "modules.finance" },
      { key: "forecast", label: "Forecast", href: "/admin/finance/forecast", feature: "modules.finance" },
      { key: "reports", label: "Reports", href: "/admin/finance/reports", feature: "modules.finance" },
    ],
  },
  {
    key: "impact",
    label: "Impact",
    icon: "kpis",
    tabs: [
      { key: "outcomes", label: "Outcomes", href: "/admin/impact/outcomes", feature: "modules.metrics" },
      { key: "kpis", label: "KPIs", href: "/admin/impact/kpis", feature: "modules.metrics" },
      { key: "analytics", label: "Analytics", href: "/admin/impact/analytics", feature: "aa.site_analytics" },
      { key: "reports", label: "Reports", href: "/admin/impact/reports", feature: "modules.metrics" },
    ],
  },
  {
    key: "organization",
    label: "Organization",
    icon: "strategy",
    tabs: [
      { key: "strategy", label: "Strategy", href: "/admin/organization/strategy", feature: "modules.strategy" },
      { key: "team", label: "Team", href: "/admin/organization/team", feature: "modules.staff", term: "staff" },
      { key: "board", label: "Board", href: "/admin/organization/board", feature: "modules.board", term: "board" },
      { key: "compliance", label: "Compliance", href: "/admin/organization/compliance", feature: "modules.compliance" },
    ],
  },
];

/** Inbox: a global utility below the divider, not one of the seven. Modeled
 *  the same way so the Messages tab drops with modules.messages. */
export const V2_INBOX: V2Destination = {
  key: "inbox",
  label: "Inbox",
  icon: "inbox",
  tabs: [
    { key: "inbox", label: "Inbox", href: "/admin/inbox" },
    { key: "messages", label: "Messages", href: "/admin/inbox/messages", feature: "modules.messages" },
  ],
};

export type ResolvedV2Destination = {
  key: string;
  label: string;
  icon: IconName;
  /** The computed landing tab — the first entitled survivor, never a constant. */
  landingTab: V2Tab & { label: string };
  /** The destination's href IS the landing tab's href. */
  href: string;
  tabs: (V2Tab & { label: string })[];
};

/**
 * Resolve one destination against an org's entitlements and terminology.
 * Returns null when no tab survives — the destination is hidden (rule 2).
 * `features === null/undefined` follows the V1 convention (no session yet →
 * full IA); an empty array means "no entitlements" and hides gated tabs.
 */
export function resolveV2Destination(
  dest: V2Destination,
  features?: string[] | null,
  terms?: Record<string, string> | null
): ResolvedV2Destination | null {
  const tabs = dest.tabs
    .filter((t) => allowed(t, features))
    .map((t) => ({ ...t, label: itemLabel(t, terms) }));
  if (tabs.length === 0) return null;
  return {
    key: dest.key,
    label: itemLabel(dest, terms),
    icon: dest.icon,
    landingTab: tabs[0],
    href: tabs[0].href,
    tabs,
  };
}

/** The whole V2 sidebar for an org: the visible destinations plus Inbox. */
export function resolveV2Nav(
  features?: string[] | null,
  terms?: Record<string, string> | null
): { destinations: ResolvedV2Destination[]; inbox: ResolvedV2Destination | null } {
  return {
    destinations: V2_DESTINATIONS.map((d) => resolveV2Destination(d, features, terms)).filter(
      (d): d is ResolvedV2Destination => d !== null
    ),
    inbox: resolveV2Destination(V2_INBOX, features, terms),
  };
}
