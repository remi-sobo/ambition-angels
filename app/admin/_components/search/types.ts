// Shared shapes for BloomOS global search (Phase 1).
// Used by the API route (app/api/admin/search/route.ts) and the overlay.

export type SearchKind =
  | "constituent"
  | "prospect"
  | "grant"
  | "commitment"
  | "task"
  | "project"
  | "partner"
  | "student"
  | "cohort"
  | "booking"
  | "page"
  | "action";

// Display buckets. DB hits map to the first five; client-side page matches
// land in "pages". Group order here IS the render order in the overlay.
export type SearchGroup = "people" | "deals" | "tasks" | "program" | "meetings" | "pages";

export const GROUP_ORDER: SearchGroup[] = [
  "people",
  "deals",
  "tasks",
  "program",
  "meetings",
  "pages",
];

export const GROUP_LABEL: Record<SearchGroup, string> = {
  people: "People & Orgs",
  deals: "Deals & Grants",
  tasks: "Tasks & Projects",
  program: "Program & Partners",
  meetings: "Meetings",
  pages: "Pages & Actions",
};

export type SearchHit = {
  kind: SearchKind;
  group: SearchGroup;
  id: string | null;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
  score: number;
};

// ── 360° entity profile (Phase 2) ────────────────────────────────────────────
// The route builds these arrays; the overlay just renders them, so adding a new
// stat or section never touches the client.
export type ProfileStat = { label: string; value: string; tone?: "default" | "warn" };
export type ProfileRow = { id: string; title: string; subtitle?: string; badge?: string; href: string };
export type ProfileSection = { key: string; label: string; rows: ProfileRow[] };
export type ProfileTimelineItem = { kind: string; when: string | null; text: string };

export type ProfilePayload = {
  entity: {
    id: string;
    name: string;
    subtitle: string;
    href: string;
    tags: string[];
    doNotContact: boolean;
  };
  stats: ProfileStat[];
  sections: ProfileSection[];
  timeline: ProfileTimelineItem[];
};

// ── Static page index ────────────────────────────────────────────────────────
// The navigable surface of BloomOS, matched client-side so pages appear
// instantly (no network round-trip) and search is never empty. Keywords cover
// synonyms a user might type that don't appear in the label.
export type PageEntry = { label: string; href: string; keywords?: string[] };

export const PAGES: PageEntry[] = [
  { label: "Overview", href: "/admin", keywords: ["home", "command center", "dashboard"] },
  { label: "Strategy", href: "/admin/strategic-plan", keywords: ["plan", "objectives", "okrs", "scorecard"] },
  { label: "Executive Briefing", href: "/admin/briefing", keywords: ["brief", "morning", "summary"] },

  { label: "Tasks", href: "/admin/ops", keywords: ["ops", "todo", "to-do", "moves"] },
  { label: "Monday Plan", href: "/admin/ops/monday", keywords: ["weekly", "planning"] },
  { label: "Friday Review", href: "/admin/ops/friday", keywords: ["weekly", "retro"] },
  { label: "Projects", href: "/admin/ops/projects", keywords: ["initiatives"] },
  { label: "Meetings", href: "/admin/meetings", keywords: ["calendar", "bookings", "notes"] },
  { label: "Booking page", href: "/admin/meet", keywords: ["schedule", "availability"] },

  { label: "Today's Moves", href: "/admin/fundraising/today", keywords: ["fundraising", "daily"] },
  { label: "Donors", href: "/admin/fundraising/donors", keywords: ["constituents", "people", "households"] },
  { label: "Pipeline", href: "/admin/fundraising", keywords: ["major gifts", "fundraising", "opportunities"] },
  { label: "Fundraising Strategy", href: "/admin/fundraising/strategy", keywords: ["plan"] },
  { label: "Prospects", href: "/admin/fundraising/prospects", keywords: ["leads", "research", "bench"] },
  { label: "Grants", href: "/admin/fundraising/grants", keywords: ["foundations", "deadlines", "loi"] },
  { label: "Campaigns", href: "/admin/fundraising/campaigns", keywords: ["appeals", "email"] },

  { label: "Students", href: "/admin/students", keywords: ["roster", "teens", "program"] },
  { label: "Cohorts", href: "/admin/cohorts", keywords: ["attendance", "sessions", "camp"] },
  { label: "Intake", href: "/admin/intake", keywords: ["applications", "forms"] },
  { label: "Demo Day", href: "/admin/demoday", keywords: ["signups", "mentors", "event"] },
  { label: "YGB Camp", href: "/admin/ygb", keywords: ["young gifted black", "creators"] },
  { label: "Schools & Partners", href: "/admin/partners", keywords: ["mou", "champions"] },

  { label: "Finance Overview", href: "/admin/finance", keywords: ["runway", "cash", "money"] },
  { label: "Revenue", href: "/admin/finance/revenue", keywords: ["income", "commitments", "pledges"] },
  { label: "Expenses", href: "/admin/finance/transactions", keywords: ["spend", "transactions", "burn"] },
  { label: "Budget vs Actual", href: "/admin/finance/budget", keywords: ["budget", "forecast"] },

  { label: "Website Analytics", href: "/admin/analytics", keywords: ["traffic", "ga4", "data"] },

  { label: "Board", href: "/admin/board", keywords: ["directors", "governance", "meetings"] },
  { label: "Compliance", href: "/admin/compliance", keywords: ["filings", "renewals", "legal"] },

  { label: "Settings", href: "/admin/settings", keywords: ["account", "preferences"] },
  { label: "How-To", href: "/admin/howto", keywords: ["help", "docs", "guide"] },
];

/** Client-side page match → SearchHit[]. Mirrors the server scoring tiers. */
export function matchPages(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const p of PAGES) {
    const label = p.label.toLowerCase();
    let score = 0;
    if (label.startsWith(q)) score = 100;
    else if (label.includes(q)) score = 70;
    else if (p.keywords?.some((k) => k.includes(q))) score = 45;
    if (score > 0) {
      hits.push({ kind: "page", group: "pages", id: null, title: p.label, href: p.href, score });
    }
  }
  return hits;
}
