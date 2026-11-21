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
// land in "pages". "recent" is synthetic (Phase 4 empty-state), never produced
// by search — so it's excluded from GROUP_ORDER. Group order here IS the render
// order in the overlay.
export type SearchGroup = "people" | "deals" | "tasks" | "program" | "meetings" | "pages" | "recent";

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
  recent: "Recent",
};

// Phase 4: scope prefixes ("people: koshland", "task: loi") filter results to
// one group. Maps a typed prefix → the group it constrains to.
export const SCOPE_PREFIXES: Record<string, SearchGroup> = {
  people: "people", person: "people", org: "people", orgs: "people",
  donor: "people", donors: "people", prospect: "people",
  deal: "deals", deals: "deals", grant: "deals", grants: "deals",
  task: "tasks", tasks: "tasks", project: "tasks", projects: "tasks",
  program: "program", student: "program", students: "program",
  cohort: "program", partner: "program", partners: "program",
  meeting: "meetings", meetings: "meetings",
  page: "pages", pages: "pages",
};

/** Split a leading "scope:" prefix off the query, if one is recognized. */
export function parseScope(raw: string): { term: string; scope: SearchGroup | null } {
  const m = raw.match(/^([a-zA-Z]+):\s*(.*)$/);
  if (m) {
    const scope = SCOPE_PREFIXES[m[1].toLowerCase()];
    if (scope) return { term: m[2].trim(), scope };
  }
  return { term: raw.trim(), scope: null };
}

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

// ── Page index ───────────────────────────────────────────────────────────────
// V4 Stage A2: the page list is no longer a hand-kept V1 list. It is
// generated from the nav model for THIS org (lib/admin/navIndex.ts →
// navPageIndex, computed in app/admin/layout.tsx and passed to GlobalSearch),
// so search offers exactly the destinations, tabs and Settings sections the
// org can see, under their current labels. Matched client-side so pages
// appear instantly and search is never empty.
export type { PageEntry } from "@/lib/admin/navIndex";
import type { PageEntry } from "@/lib/admin/navIndex";

/** Client-side page match → SearchHit[]. Mirrors the server scoring tiers. */
export function matchPages(query: string, pages: readonly PageEntry[]): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const p of pages) {
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
