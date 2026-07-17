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
  return {
    student: pluralizeTerm(label("student", "Student")),
    cohort: pluralizeTerm(label("cohort", "Cohort")),
    staff: label("staff", "Staff"),
  };
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
