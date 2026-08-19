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
  | "board" | "compliance" | "kpis" | "strategy"
  | "stories" | "editions";

/** One pill in a horizontal sub-topic bar. */
export type SectionTab = {
  href: string;
  label: string;
  /** Extra route prefixes that count as this tab (e.g. the Monday/Friday
   *  wizards under My Week, or /admin/intake under Students). */
  match?: string[];
  feature?: FeatureKey;
  /** Permission key gating this entry — see NavItem.perm. */
  perm?: string;
  /** Terminology key (core fence spec B3) — see NavItem.term. */
  term?: string;
};

export type NavItem = {
  label: string;
  icon: IconName;
  href?: string;
  soon?: boolean;
  feature?: FeatureKey;
  /**
   * Permission key required to SEE this entry. Distinct from `feature`:
   * an entitlement says the ORG bought the module, a permission says THIS
   * MEMBER may use it. Comms is the first entry that needs the difference —
   * an org holds `modules.comms` while a board viewer holds no `comms.*` key
   * at all, and showing them a section that only 403s is worse than not
   * showing it.
   *
   * Hiding is an affordance, never the boundary: the module layout's gate and
   * RLS still refuse a direct URL.
   */
  perm?: string;
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
        match: ["/admin/ops"],
        tabs: [
          {
            href: "/admin/ops/my-week",
            label: "My Week",
            match: ["/admin/ops/monday", "/admin/ops/friday"],
          },
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
      { label: "Donors", icon: "donors", href: "/admin/fundraising/donors", feature: "modules.fundraising" },
      { label: "Pipeline", icon: "majorgifts", href: "/admin/fundraising", feature: "modules.fundraising" },
      { label: "Grants", icon: "grants", href: "/admin/fundraising/grants", feature: "modules.fundraising" },
      { label: "Campaigns", icon: "campaigns", href: "/admin/fundraising/campaigns", feature: "modules.fundraising" },
    ],
  },
  {
    label: "Comms",
    // Top-level, NOT nested under Fundraising (spec §7.1): program staff are
    // the supply side of the story bank, and they should never have to walk
    // through the donor pipeline to log a win.
    //
    // Every entry carries `perm: "comms.manage"` as well as the module
    // entitlement — comms is the first product with a permission that not
    // every member of an entitled org holds.
    items: [
      {
        label: "Stories",
        icon: "stories",
        href: "/admin/comms",
        feature: "modules.comms",
        perm: "comms.manage",
        match: ["/admin/comms/stories"],
      },
      {
        label: "Editions",
        icon: "editions",
        href: "/admin/comms/editions",
        feature: "modules.comms",
        perm: "comms.manage",
        soon: true,
      },
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
      // Volunteers/Leaders belong to the program, not fundraising. The route
      // still lives under /admin/fundraising, so the item stays gated on the
      // fundraising module (where the page's own layout guard is) — the move is
      // its home in the IA. Because it's a longer prefix than the Fundraising
      // section's own routes, these pages get the Program bar, not the
      // Fundraising one. For YL EPA the "volunteer" term resolves to "Leaders".
      { label: "Volunteers", icon: "team", href: "/admin/fundraising/volunteers", feature: "modules.fundraising", term: "volunteer" },
      { label: "Demo Day", icon: "demoday", href: "/admin/demoday", feature: "aa.demoday" },
      { label: "YGB Camp", icon: "camp", href: "/admin/ygb", feature: "aa.ygb" },
      { label: "Schools & Partners", icon: "schools", href: "/admin/partners", feature: "modules.partners", term: "partner" },
      { label: "Career Library", icon: "career", href: "/admin/careers", feature: "aa.quiz" },
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

function allowed(
  entry: { feature?: FeatureKey; perm?: string },
  features?: string[] | null,
  perms?: string[] | null
): boolean {
  // null features/perms = no session yet (login screen) — show the full IA
  // rather than a stripped nav; B2 de-AAs the pre-auth shell.
  const entitled = !features || !entry.feature || features.includes(entry.feature);
  const permitted = !perms || !entry.perm || perms.includes(entry.perm);
  return entitled && permitted;
}

/** The sidebar sections filtered by entitlement AND permission, empty sections
 *  dropped. */
export function visibleSections(
  features?: string[] | null,
  perms?: string[] | null
): NavSection[] {
  if (!features && !perms) return NAV_SECTIONS;
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => allowed(item, features, perms)),
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
  opts?: {
    features?: string[] | null;
    terms?: Record<string, string> | null;
    perms?: string[] | null;
  }
): ResolvedSectionNav | null {
  const features = opts?.features ?? null;
  const terms = opts?.terms ?? null;
  const perms = opts?.perms ?? null;

  const href = activeHref(pathname);
  if (!href) return null;

  const section = NAV_SECTIONS.find((s) => s.items.some((i) => i.href === href));
  const item = section?.items.find((i) => i.href === href);
  if (!section || !item) return null;
  // The route's own module is gated off for this org — the page renders the
  // not-authorized panel, so don't crown it with a nav bar.
  if (!allowed(item, features, perms)) return null;

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
        perm: i.perm,
        term: i.term,
      }))
  ).filter((t) => allowed(t, features, perms));
  // A lone sub-topic is not navigation — skip the row (Finance and Data each
  // have one sidebar item).
  if (sectionTabs.length > 1) {
    rows.push({ label: section.label, tabs: mark(sectionTabs) });
  }

  // Row 2 — the active sub-topic's own tabs (Work, Meetings, Finance, Students).
  const itemTabs = (item.tabs ?? []).filter((t) => allowed(t, features, perms));
  if (itemTabs.length > 1) {
    rows.push({ label: itemLabel(item, terms), tabs: mark(itemTabs) });
  }

  if (rows.length === 0) return null;
  return { rows };
}
