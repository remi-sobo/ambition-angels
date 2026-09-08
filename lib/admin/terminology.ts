import "server-only";
import { getEntityTypes, getTerminology } from "./entities";

/**
 * Terminology reader + label helper (core fence spec B3).
 *
 * Per-tenant vocabulary: an org can rename "Student" to "Scholar" or "Cohort"
 * to "Chapter" without a code change. Label precedence per term key:
 *
 *   1. org_terminology.label — the org's own rename (empty for AA, so nothing
 *      visibly changes until a tenant actually renames something),
 *   2. entity_types.display_name — the registry default,
 *   3. the caller's code fallback (for keys with no registry row, e.g. 'staff').
 *
 * Labels are stored SINGULAR ("Scholar", not "Scholars"); UI surfaces that
 * read plural pluralize at render time via pluralizeTerm(). Both reads reuse
 * the request-cached session-client readers in lib/admin/entities.ts, so a
 * request pays for at most one query per table regardless of call count.
 */

/** Pure precedence rule, separated from the data reads for testability. */
export function resolveTermLabel(
  key: string,
  fallback: string,
  overrides: ReadonlyMap<string, string>,
  registryNames: ReadonlyMap<string, string>,
): string {
  return overrides.get(key)?.trim() || registryNames.get(key)?.trim() || fallback;
}

/**
 * Naive English pluralizer — enough for the short nouns terminology holds
 * ("Scholar" → "Scholars", "Class" → "Classes", "Family" → "Families").
 * Collective nouns like "Staff" should simply not be pluralized by callers.
 */
export function pluralizeTerm(label: string): string {
  const t = label.trim();
  if (!t) return t;
  if (/(?:s|x|z|ch|sh)$/i.test(t)) return `${t}es`;
  if (/[^aeiou]y$/i.test(t)) return `${t.slice(0, -1)}ies`;
  return `${t}s`;
}

/** The org's label for one term key (singular). */
export async function getTermLabel(key: string, fallback: string): Promise<string> {
  const [overrides, registry] = await Promise.all([getTerminology(), getEntityTypes()]);
  return (
    overrides.get(key)?.trim() ||
    registry.get(key)?.display_name?.trim() ||
    fallback
  );
}

/**
 * Resolved labels for the term-driven nav items, keyed by term key and
 * already pluralized where the nav reads plural. Computed server-side in the
 * admin layout and passed to the (client) Sidebar; 'staff' is a collective
 * noun and stays as-is ("Staff", "Team").
 */
export async function getNavTermLabels(): Promise<Record<string, string>> {
  const [overrides, registry] = await Promise.all([getTerminology(), getEntityTypes()]);
  const registryNames = new Map(
    Array.from(registry, ([key, row]) => [key, row.display_name] as const),
  );
  const label = (key: string, fallback: string) =>
    resolveTermLabel(key, fallback, overrides, registryNames);
  // partner/board are override-only: their nav code defaults are compound
  // ("Schools & Partners") or module names ("Board") that the registry's
  // singular display_name must not replace — only an org's own rename does.
  // 'board' is a collective noun like 'staff' and is never pluralized.
  const partnerOverride = overrides.get("partner")?.trim();
  const boardOverride = overrides.get("board")?.trim();
  return {
    student: pluralizeTerm(label("student", "Student")),
    cohort: pluralizeTerm(label("cohort", "Cohort")),
    staff: label("staff", "Staff"),
    volunteer: pluralizeTerm(label("volunteer", "Volunteer")),
    partner: partnerOverride ? pluralizeTerm(partnerOverride) : "Schools & Partners",
    board: boardOverride || "Board",
  };
}

/**
 * Spec B, stage B4 — the V2 shell's term map, pure for testability.
 *
 * The V2 nav renamed several surfaces (Students → People, Staff → Team), so
 * the V1 map above would clobber those names with generic registry nouns
 * ("Schools & Partners", "Staff"). The V2 rule:
 *
 *   - The V2 TAB LABEL is the code default.
 *   - An org's OWN rename (org_terminology) always wins — Groups/Crews/
 *     Kids/Scholars/Committee read through with no code change.
 *   - The registry (entity_types.display_name) fills in ONLY where the V2
 *     label IS the term's generic noun (cohort → "Cohorts", partner →
 *     "Partners"); it must never replace a V2 rename, so student/staff/
 *     board are override-only here.
 *
 * cohort/partner/student pluralize; staff/board are collective nouns and
 * stay as-is. AA has zero org_terminology rows by design, so every value
 * falls through to the registry/code default — the fallback chain is
 * exercised, not assumed (tests/nav-terminology.test.ts).
 */
export function shellTermLabels(
  overrides: ReadonlyMap<string, string>,
  registryNames: ReadonlyMap<string, string>,
): Record<string, string> {
  const chained = (key: string, fallback: string) =>
    pluralizeTerm(resolveTermLabel(key, fallback, overrides, registryNames));
  const overrideOnly = (key: string, fallback: string, plural: boolean) => {
    const own = overrides.get(key)?.trim();
    if (!own) return fallback;
    return plural ? pluralizeTerm(own) : own;
  };
  return {
    cohort: chained("cohort", "Cohort"),
    partner: chained("partner", "Partner"),
    student: overrideOnly("student", "People", true),
    staff: overrideOnly("staff", "Team", false),
    board: overrideOnly("board", "Board", false),
  };
}

/** The async wrapper the V2 shell layout calls (session-client reads, so
 *  RLS scopes both tables to the active org). */
export async function getShellTermLabels(): Promise<Record<string, string>> {
  const [overrides, registry] = await Promise.all([getTerminology(), getEntityTypes()]);
  const registryNames = new Map(
    Array.from(registry, ([key, row]) => [key, row.display_name] as const),
  );
  return shellTermLabels(overrides, registryNames);
}

/** The program module's vocabulary (participant spine spec #4 §6d). */
export type ProgramTerms = {
  student: string; students: string;
  cohort: string; cohorts: string;
  program: string; programs: string;
  session: string; sessions: string;
  stage: string; stages: string;
};

/**
 * Program-module labels (participant / group / program / session / stage),
 * singular and plural, resolved once per request. AA leaves org_terminology
 * empty so these are Student/Cohort/Program/Session/Stage; a seeded tenant
 * (Safespace) reads Student leader/Chapter/… with no code change. `session`
 * and `stage` have no entity_types row, so they fall back to the code default
 * until an org overrides them — the override still wins.
 */
export async function getProgramTerms(): Promise<ProgramTerms> {
  const [overrides, registry] = await Promise.all([getTerminology(), getEntityTypes()]);
  const registryNames = new Map(
    Array.from(registry, ([key, row]) => [key, row.display_name] as const),
  );
  const one = (key: string, fallback: string) =>
    resolveTermLabel(key, fallback, overrides, registryNames);
  const student = one("student", "Student");
  const cohort = one("cohort", "Cohort");
  const program = one("program", "Program");
  const session = one("session", "Session");
  const stage = one("stage", "Stage");
  return {
    student, students: pluralizeTerm(student),
    cohort, cohorts: pluralizeTerm(cohort),
    program, programs: pluralizeTerm(program),
    session, sessions: pluralizeTerm(session),
    stage, stages: pluralizeTerm(stage),
  };
}
