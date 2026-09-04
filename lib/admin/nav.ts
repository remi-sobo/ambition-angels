import type { FeatureKey } from "@/lib/admin/entitlements";

// ── BloomOS IA (docs/bloomos/06-design-system.md §1) ────────────────────────
// The single source of truth for the admin information architecture: seven
// sidebar sections, one row per product, and the tab sets that fan out inside
// a product. Two surfaces read this model:
//
//   • Sidebar (app/admin/_components/Sidebar.tsx) — the vertical nav.
//   • SectionSubNav (app/admin/_components/SectionSubNav.tsx) — the horizontal
//     sub-topic bar rendered on every admin page from the admin layout.
//
// Keeping both on one model is what makes the sub-topic bar consistent: a
// section can't be "missing" its bar, because the bar is derived from the same
// list the sidebar renders rather than hand-wired into each route group.
//
// `feature` is THE mapping from nav entry to entitlement key (core fence spec
// §6b): entries whose org lacks the key are filtered out of both surfaces, and
// the matching module layout gates the routes themselves. Entries without a
// `feature` (Overview, Inbox, Settings) are platform surfaces every tenant
// gets.

export type IconName =
  | "overview" | "briefing" | "inbox" | "messages"
  | "students" | "cohorts" | "intake" | "demoday" | "camp" | "schools" | "app" | "internships" | "career"
  | "majorgifts" | "donors" | "grants" | "campaigns" | "events"
  | "finance" | "revenue" | "expenses" | "budget" | "cashflow"
  | "webanalytics" | "appanalytics" | "studentanalytics" | "surveys"
  | "week" | "tasks" | "monday" | "friday" | "projects" | "meetings" | "team" | "documents"
  | "board" | "compliance" | "kpis" | "strategy";

/** One pill in a horizontal sub-topic bar. */
export type SectionTab = {
  href: string;
  label: string;
  /** Extra route prefixes that count as this tab (e.g. the Monday/Friday
   *  wizards under My Week, or /admin/intake under Students). */
  match?: string[];
  feature?: FeatureKey;
  /** Terminology key (core fence spec B3) — see NavItem.term. */
  term?: string;
};

export type NavItem = {
  label: string;
  icon: IconName;
  href?: string;
  soon?: boolean;
  feature?: FeatureKey;
  /** Terminology key (core fence spec B3): when the org has renamed this term
   *  (org_terminology → entity_types fallback, resolved server-side in the
   *  admin layout), the resolved label replaces `label`. */
  term?: string;
  /** Route prefixes outside `href` that still belong to this item — they light
   *  it in the sidebar and in the section bar. */
  match?: string[];
  /** The product's own tabs, shown as a second row of the sub-topic bar on
   *  every route belonging to this item. */
  tabs?: SectionTab[];
};

export type NavSection = {
  label: string;
  items: NavItem[];
  /** Explicit sub-topic bar for the section, when it differs from the item
   *  list — Fundraising surfaces Prospects / Ask Log / Strategy on the bar
   *  without giving each a sidebar row. Defaults to the section's items. */
  tabs?: SectionTab[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Command Center",
    items: [
      { label: "Overview", icon: "overview", href: "/admin" },
      { label: "Inbox", icon: "inbox", href: "/admin/inbox" },
      { label: "Messages", icon: "messages", href: "/admin/messages", feature: "modules.messages" },
      { label: "Strategy", icon: "strategy", href: "/admin/strategic-plan", feature: "modules.strategy" },
      { label: "Executive Briefing", icon: "briefing", href: "/admin/briefing", feature: "modules.ops" },
    ],
  },
  {
    label: "Operations",
    items: [
      // One item for the whole ops_tasks product — My Week, Tasks, and
      // Projects live on its own tab row. Lands on My Week, the personal
      // daily home.
      {
        label: "Work",
        icon: "week",
        href: "/admin/ops/my-week",
        feature: "modules.ops",
        match: ["/admin/ops", "/admin/calendar"],
        tabs: [
          {
            href: "/admin/ops/my-week",
            label: "My Week",
            match: ["/admin/ops/monday", "/admin/ops/friday"],
          },
          { href: "/admin/calendar", label: "Calendar" },
          { href: "/admin/ops", label: "Tasks" },
          { href: "/admin/ops/projects", label: "Projects" },
        ],
      },
      // One item for the whole meetings product — the booking admin (the old
      // "Booking page" item at /admin/meet) now lives on its tab row. Overview
      // owns every route no other tab claims (meeting records included), so
      // drilling into one keeps you oriented.
      {
        label: "Meetings",
        icon: "meetings",
        href: "/admin/meetings",
        feature: "modules.meetings",
        tabs: [
          { href: "/admin/meetings", label: "Overview" },
          { href: "/admin/meetings/connections", label: "Connections" },
          { href: "/admin/meetings/booking-page", label: "Booking page" },
        ],
      },
      { label: "Staff", icon: "team", href: "/admin/staff", feature: "modules.staff", term: "staff" },
      { label: "Documents", icon: "documents", href: "/admin/documents", feature: "modules.documents" },
    ],
  },
  {
    label: "Fundraising",
    // The sidebar keeps only the daily surfaces; the bar carries the full set,
    // including Prospects, the Ask Log, and fundraising Strategy.
    tabs: [
      { href: "/admin/fundraising/today", label: "Today's Moves" },
      { href: "/admin/fundraising/plan", label: "Plan" },
      { href: "/admin/fundraising/donors", label: "Donors" },
      { href: "/admin/fundraising", label: "Pipeline" },
      { href: "/admin/fundraising/prospects", label: "Prospects" },
      { href: "/admin/fundraising/asks", label: "Ask Log" },
      { href: "/admin/fundraising/grants", label: "Grants" },
      { href: "/admin/fundraising/campaigns", label: "Campaigns" },
      { href: "/admin/fundraising/strategy", label: "Strategy" },
    ],
    items: [
      { label: "Today's Moves", icon: "tasks", href: "/admin/fundraising/today", feature: "modules.fundraising" },
      { label: "Plan", icon: "strategy", href: "/admin/fundraising/plan", feature: "modules.fundraising" },
      { label: "Donors", icon: "donors", href: "/admin/fundraising/donors", feature: "modules.fundraising" },
      { label: "Pipeline", icon: "majorgifts", href: "/admin/fundraising", feature: "modules.fundraising" },
      { label: "Grants", icon: "grants", href: "/admin/fundraising/grants", feature: "modules.fundraising" },
      { label: "Campaigns", icon: "campaigns", href: "/admin/fundraising/campaigns", feature: "modules.fundraising" },
    ],
  },
  {
    label: "Program",
    items: [
      // Intake is the pipeline INTO the roster, so it's a tab of Students even
      // though its routes sit at /admin/intake.
      {
        label: "Students",
        icon: "students",
        href: "/admin/students",
        feature: "modules.program",
        term: "student",
        match: ["/admin/intake"],
        tabs: [
          { href: "/admin/students", label: "Roster" },
          { href: "/admin/intake", label: "Intake" },
        ],
      },
      { label: "Cohorts", icon: "cohorts", href: "/admin/cohorts", feature: "modules.program", term: "cohort" },
      // Volunteers/Leaders belong to the program, not fundraising — Spec B
      // (B1) fixes the V1 gating error that keyed this on modules.fundraising
      // just because the route sits under /admin/fundraising. The nav gate is
      // the program module; the page's own layout guard still checks
      // fundraising until the destination migrates (all four live orgs hold
      // both keys, so nothing visible changes today). For YL EPA the
      // "volunteer" term resolves to "Leaders".
      { label: "Volunteers", icon: "team", href: "/admin/fundraising/volunteers", feature: "modules.program", term: "volunteer" },
      { label: "Demo Day", icon: "demoday", href: "/admin/demoday", feature: "aa.demoday" },
      { label: "YGB Camp", icon: "camp", href: "/admin/ygb", feature: "aa.ygb" },
      { label: "Schools & Partners", icon: "schools", href: "/admin/partners", feature: "modules.partners", term: "partner" },
      // Spec B (B1): content production gets its own key. Gating this on
      // aa.quiz was a V1 error — the quiz and the career library are different
      // products. seed_aa_modules_content.sql must be applied before this
      // deploys or AA's Career Library row disappears until it is.
      { label: "Career Library", icon: "career", href: "/admin/careers", feature: "modules.content" },
    ],
  },
  {
    label: "Finance",
    items: [
      // One item — the finance product's own tab row covers Revenue /
      // Expenses / Budget and the rest.
      {
        label: "Finance",
        icon: "finance",
        href: "/admin/finance",
        feature: "modules.finance",
        tabs: [
          { href: "/admin/finance", label: "Dashboard" },
          { href: "/admin/finance/close", label: "Friday close" },
          { href: "/admin/finance/reconcile", label: "Reconcile" },
          { href: "/admin/finance/forecast", label: "Forecast" },
          { href: "/admin/finance/report", label: "Report" },
          { href: "/admin/finance/model", label: "Model" },
          { href: "/admin/finance/upload", label: "Upload" },
          { href: "/admin/finance/transactions", label: "Transactions" },
          { href: "/admin/finance/budget", label: "Budget" },
          { href: "/admin/finance/revenue", label: "Pledges" },
          { href: "/admin/finance/rules", label: "Rules" },
          { href: "/admin/finance/config", label: "Config" },
        ],
      },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Analytics", icon: "webanalytics", href: "/admin/analytics", feature: "aa.site_analytics" },
    ],
  },
  {
    label: "Governance",
    items: [
      { label: "Board", icon: "board", href: "/admin/board", feature: "modules.board", term: "board" },
      { label: "Compliance", icon: "compliance", href: "/admin/compliance", feature: "modules.compliance" },
    ],
  },
];

// ── Matching ────────────────────────────────────────────────────────────────
// Longest-prefix wins so "/admin" (Overview) doesn't light up on every page,
// and "/admin/ops" (Work) yields to nothing shorter. Pages without a nav entry
// of their own (e.g. /admin/finance/rules) light up their nearest ancestor.

function prefixHit(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/** Length of the longest prefix of `path` claimed by this entry, or -1. */
function matchDepth(path: string, entry: { href?: string; match?: string[] }): number {
  let best = -1;
  for (const p of [entry.href, ...(entry.match ?? [])]) {
    if (p && prefixHit(path, p) && p.length > best) best = p.length;
  }
  return best;
}

/** The sidebar item href that owns `pathname`, or null. */
export function activeHref(pathname: string): string | null {
  let best: string | null = null;
  let bestDepth = -1;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (!item.href) continue;
      const depth = matchDepth(pathname, item);
      if (depth > bestDepth) {
        best = item.href;
        bestDepth = depth;
      }
    }
  }
  return best;
}

/** Index of the tab that owns `pathname` (longest prefix wins), or -1. */
export function activeTabIndex(pathname: string, tabs: SectionTab[]): number {
  let best = -1;
  let bestDepth = -1;
  tabs.forEach((tab, i) => {
    const depth = matchDepth(pathname, tab);
    if (depth > bestDepth) {
      best = i;
      bestDepth = depth;
    }
  });
  return best;
}

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

/** The sidebar sections with entitlement-filtered items, empty sections dropped. */
export function visibleSections(features?: string[] | null): NavSection[] {
  if (!features) return NAV_SECTIONS;
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => allowed(item, features)),
  })).filter((section) => section.items.length > 0);
}

export type ResolvedSectionNav = {
  /** One or more rows of pills: the section's sub-topics first, then the
   *  active sub-topic's own tabs when it has them. Each row carries the
   *  eyebrow shown to its left. Never empty — the resolver returns null
   *  instead. */
  rows: { label: string; tabs: (SectionTab & { active: boolean })[] }[];
};

/**
 * The horizontal sub-topic bar for `pathname`, or null when there's nothing to
 * show (an unrecognized route, a section with a single sub-topic and no tabs,
 * or a module this org isn't entitled to).
 */
export function resolveSectionNav(
  pathname: string,
  opts?: { features?: string[] | null; terms?: Record<string, string> | null }
): ResolvedSectionNav | null {
  const features = opts?.features ?? null;
  const terms = opts?.terms ?? null;

  const href = activeHref(pathname);
  if (!href) return null;

  const section = NAV_SECTIONS.find((s) => s.items.some((i) => i.href === href));
  const item = section?.items.find((i) => i.href === href);
  if (!section || !item) return null;
  // The route's own module is gated off for this org — the page renders the
  // not-authorized panel, so don't crown it with a nav bar.
  if (!allowed(item, features)) return null;

  const rows: ResolvedSectionNav["rows"] = [];

  const mark = (tabs: SectionTab[]) => {
    const activeIdx = activeTabIndex(pathname, tabs);
    return tabs.map((t, i) => ({ ...t, label: itemLabel(t, terms), active: i === activeIdx }));
  };

  // Row 1 — the section's sibling sub-topics. Declared tabs win; otherwise
  // derive them from the sidebar items so a new section can't be forgotten.
  const sectionTabs: SectionTab[] = (
    section.tabs ??
    section.items
      .filter((i) => i.href)
      .map((i) => ({
        href: i.href as string,
        label: i.label,
        match: i.match,
        feature: i.feature,
        term: i.term,
      }))
  ).filter((t) => allowed(t, features));
  // A lone sub-topic is not navigation — skip the row (Finance and Data each
  // have one sidebar item).
  if (sectionTabs.length > 1) {
    rows.push({ label: section.label, tabs: mark(sectionTabs) });
  }

  // Row 2 — the active sub-topic's own tabs (Work, Meetings, Finance, Students).
  const itemTabs = (item.tabs ?? []).filter((t) => allowed(t, features));
  if (itemTabs.length > 1) {
    rows.push({ label: itemLabel(item, terms), tabs: mark(itemTabs) });
  }

  if (rows.length === 0) return null;
  return { rows };
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
      { key: "people", label: "People", href: "/admin/programs/people", feature: "modules.program" },
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
