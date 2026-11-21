/**
 * The participant roster (V4 Stage E, specs/bloomos-v4-product-readiness.md
 * §5 List archetype, prototype Roster.dc.html).
 *
 * PURE: no React, no server imports, so the page, the tests and any client
 * code share one set of rules. The server loader (roster-server.ts) reads the
 * org's students, memberships, cohorts, sessions and marks, and hands them
 * here; this module turns them into rows, filters them by the URL, sorts and
 * pages them.
 *
 * Attendance math is the module's existing rule (app/admin/cohorts/_lib/
 * rollups.ts): rate = (present + late) / (present + late + absent) over HELD
 * sessions of the cohorts a person is enrolled in. Excused and unmarked days
 * count against no one. A person with no countable marks has no rate (null),
 * never 0%.
 *
 * URL vocabulary (DataTable v2 owns page/sort/dir):
 *   view=mine|unenrolled|followup   omitted for "all"
 *   q=<text>                        name search
 *   cohort=<uuid>                   one cohort
 */

import type { TablePage, TableSort, TableSpec, TableState } from "@/lib/admin/dataTable";

export type RosterView = "all" | "mine" | "unenrolled" | "followup";

/** The built-in saved views, "mine" first (spec §5). */
export const ROSTER_VIEWS: { key: RosterView; label: string; mine?: boolean }[] = [
  { key: "mine", label: "My cohorts", mine: true },
  { key: "all", label: "Everyone" },
  { key: "unenrolled", label: "Not in a cohort" },
  { key: "followup", label: "Needs follow-up" },
];

export type RosterFilters = { view: RosterView; q: string; cohort: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** searchParams → validated filters. Never throws; junk falls back to defaults. */
export function parseRosterFilters(raw: RawParams): RosterFilters {
  const v = first(raw.view);
  const view: RosterView = v === "mine" || v === "unenrolled" || v === "followup" ? v : "all";
  const q = (first(raw.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const c = first(raw.cohort);
  const cohort = c && UUID.test(c) ? c.toLowerCase() : null;
  return { view, q, cohort };
}

/** Filters → the params a link carries (defaults omitted, so the bare path is "all"). */
export function rosterFilterParams(f: RosterFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.view !== "all") out.view = f.view;
  if (f.q) out.q = f.q;
  if (f.cohort) out.cohort = f.cohort;
  return out;
}

export function rosterHref(base: string, f: RosterFilters): string {
  const s = new URLSearchParams(rosterFilterParams(f)).toString();
  return s ? `${base}?${s}` : base;
}

export const ROSTER_TABLE: TableSpec = {
  sortable: [{ key: "name" }, { key: "rate", first: "asc" }, { key: "last", first: "desc" }],
  defaultSort: { key: "name", dir: "asc" },
  pageSize: 50,
};

// ── Inputs ─────────────────────────────────────────────────────────────────

export type ParticipantLite = {
  id: string;
  first_name: string;
  last_name: string | null;
  email?: string | null;
  stage?: string | null;
  custom_fields?: Record<string, unknown> | null;
};
export type MembershipLite = { cohort_id: string; student_id: string; status: string };
export type CohortLite = { id: string; name: string; status: string; owner_id?: string | null };
export type SessionLite = { id: string; cohort_id: string; session_date: string; status: string };
export type MarkLite = { session_id: string; student_id: string; status: string };

export type NextStep = { text: string; tone: "late" | "due" | "none" };

export type RosterRow = {
  id: string;
  name: string;
  grade: string | null;
  /** Cohorts the person is enrolled in now (not completed, not dropped). */
  cohorts: { id: string; name: string }[];
  attended: number;
  counted: number;
  rate: number | null;
  lastAttended: string | null;
  consecutiveAbsences: number;
  hasGuardian: boolean;
  nextSession: string | null;
  next: NextStep;
};

const ATTENDED = new Set(["present", "late"]);
/** Cohorts whose enrolments are live (a completed or archived cohort is history). */
const LIVE_COHORT = new Set(["planning", "active"]);

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Reachable = own email, or a guardian email or phone (the roster's contact rule). */
export function hasGuardianContact(p: ParticipantLite): boolean {
  const c = p.custom_fields ?? {};
  return !!(str(p.email) || str(c.guardian_email) || str(c.guardian_phone));
}

export function shortDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * The next step for one person, first match wins:
 *  1. not in a live cohort       → enroll them
 *  2. missed the last 2+ held    → follow up (late tone: it is already overdue)
 *  3. no way to reach a guardian → add a contact
 *  4. a session coming up        → the next session date
 *  5. otherwise                  → nothing needed
 */
export function rosterNextStep(r: Omit<RosterRow, "next">): NextStep {
  if (r.cohorts.length === 0) return { text: "Enroll in a cohort", tone: "due" };
  if (r.consecutiveAbsences >= 2) return { text: `Follow up: missed the last ${r.consecutiveAbsences}`, tone: "late" };
  if (!r.hasGuardian) return { text: "Add a guardian contact", tone: "due" };
  if (r.nextSession) return { text: `Next session ${shortDate(r.nextSession)}`, tone: "none" };
  return { text: "Nothing needed now", tone: "none" };
}

/** Students + memberships + sessions + marks → one row per participant. */
export function buildRosterRows(
  input: {
    participants: ParticipantLite[];
    memberships: MembershipLite[];
    cohorts: CohortLite[];
    sessions: SessionLite[];
    marks: MarkLite[];
  },
  today: string,
): RosterRow[] {
  const cohortById = new Map(input.cohorts.map((c) => [c.id, c]));
  const sessionsByCohort = new Map<string, SessionLite[]>();
  for (const s of input.sessions) {
    const list = sessionsByCohort.get(s.cohort_id) ?? [];
    list.push(s);
    sessionsByCohort.set(s.cohort_id, list);
  }
  const markByKey = new Map<string, string>();
  for (const m of input.marks) markByKey.set(`${m.session_id}:${m.student_id}`, m.status);
  const enrolledIn = new Map<string, string[]>();
  for (const m of input.memberships) {
    if (m.status !== "enrolled") continue;
    const c = cohortById.get(m.cohort_id);
    if (!c || !LIVE_COHORT.has(c.status)) continue;
    const list = enrolledIn.get(m.student_id) ?? [];
    list.push(m.cohort_id);
    enrolledIn.set(m.student_id, list);
  }

  return input.participants.map((p) => {
    const cohortIds = enrolledIn.get(p.id) ?? [];
    const held = cohortIds
      .flatMap((id) => sessionsByCohort.get(id) ?? [])
      .filter((s) => s.status === "held")
      .sort((a, b) => a.session_date.localeCompare(b.session_date));
    let attended = 0;
    let absent = 0;
    let run = 0;
    let lastAttended: string | null = null;
    for (const s of held) {
      const st = markByKey.get(`${s.id}:${p.id}`);
      if (st && ATTENDED.has(st)) {
        attended++;
        run = 0;
        lastAttended = s.session_date;
      } else if (st === "absent") {
        absent++;
        run++;
      } else if (st === "excused") {
        run = 0;
      }
    }
    const counted = attended + absent;
    const nextSession =
      cohortIds
        .flatMap((id) => sessionsByCohort.get(id) ?? [])
        .filter((s) => s.status === "scheduled" && s.session_date >= today)
        .map((s) => s.session_date)
        .sort()[0] ?? null;
    const base: Omit<RosterRow, "next"> = {
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "(no name)",
      grade: str(p.custom_fields?.grade) || null,
      cohorts: cohortIds
        .map((id) => ({ id, name: cohortById.get(id)!.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      attended,
      counted,
      rate: counted > 0 ? attended / counted : null,
      lastAttended,
      consecutiveAbsences: run,
      hasGuardian: hasGuardianContact(p),
      nextSession,
    };
    return { ...base, next: rosterNextStep(base) };
  });
}

/** Does this row belong in the view? `myCohortIds` = cohorts the viewer owns. */
export function inView(r: RosterRow, f: RosterFilters, myCohortIds: ReadonlySet<string>): boolean {
  if (f.cohort && !r.cohorts.some((c) => c.id === f.cohort)) return false;
  if (f.q) {
    const needle = f.q.toLowerCase();
    if (!r.name.toLowerCase().includes(needle)) return false;
  }
  switch (f.view) {
    case "mine":
      return r.cohorts.some((c) => myCohortIds.has(c.id));
    case "unenrolled":
      return r.cohorts.length === 0;
    case "followup":
      return r.consecutiveAbsences >= 2 || !r.hasGuardian;
    default:
      return true;
  }
}

export function filterRoster(rows: RosterRow[], f: RosterFilters, myCohortIds: ReadonlySet<string>): RosterRow[] {
  return rows.filter((r) => inView(r, f, myCohortIds));
}

/** Server-side order. A missing rate or date always sorts last, either way. */
export function sortRoster(rows: RosterRow[], sort: TableSort | null): RosterRow[] {
  const s = sort ?? { key: "name", dir: "asc" as const };
  const dir = s.dir === "asc" ? 1 : -1;
  const byName = (a: RosterRow, b: RosterRow) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const nullsLast = <T,>(a: T | null, b: T | null, cmp: (x: T, y: T) => number) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return cmp(a, b) * dir;
  };
  return [...rows].sort((a, b) => {
    let c = 0;
    if (s.key === "rate") c = nullsLast(a.rate, b.rate, (x, y) => x - y);
    else if (s.key === "last") c = nullsLast(a.lastAttended, b.lastAttended, (x, y) => x.localeCompare(y));
    else c = byName(a, b) * dir;
    return c || byName(a, b);
  });
}

/** One page of rows, in the DataTable v2 shape. */
export function pageRoster(rows: RosterRow[], state: TableState, spec: TableSpec, error?: string | null): TablePage<RosterRow> {
  const sorted = sortRoster(rows, state.sort);
  const from = state.page * spec.pageSize;
  return {
    rows: sorted.slice(from, from + spec.pageSize),
    total: rows.length,
    page: state.page,
    pageSize: spec.pageSize,
    error: error ?? null,
  };
}

/** The summary strip's numbers for the rows in view. */
export function rosterSummary(rows: RosterRow[]) {
  let attended = 0;
  let counted = 0;
  for (const r of rows) {
    attended += r.attended;
    counted += r.counted;
  }
  return {
    people: rows.length,
    attended,
    counted,
    rate: counted > 0 ? attended / counted : null,
    missedTwice: rows.filter((r) => r.consecutiveAbsences >= 2).length,
    unenrolled: rows.filter((r) => r.cohorts.length === 0).length,
  };
}

export function pctText(rate: number | null): string | null {
  return rate === null ? null : `${Math.round(rate * 100)}%`;
}
