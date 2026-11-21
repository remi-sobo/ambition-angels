/**
 * Bulk enroll, the pure half (V4 Stage E). The route
 * (app/api/admin/programs/enroll) reads the org-pinned rows and writes the
 * plan this module computes; the import commit reuses planEnrollment for its
 * cohort column.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Most people one request may enroll (four pages of the roster). */
export const ENROLL_MAX_IDS = 200;

export function parseEnrollBody(
  body: unknown,
): { ok: true; ids: string[]; cohortId: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON" };
  const b = body as Record<string, unknown>;
  const raw = Array.isArray(b.ids) ? b.ids : [];
  if (raw.length === 0 || !raw.every((v) => typeof v === "string" && UUID.test(v))) {
    return { ok: false, error: "Choose at least one person to enroll." };
  }
  const ids = Array.from(new Set((raw as string[]).map((s) => s.toLowerCase())));
  if (ids.length > ENROLL_MAX_IDS) return { ok: false, error: `Enroll at most ${ENROLL_MAX_IDS} people at a time.` };
  if (typeof b.cohort_id !== "string" || !UUID.test(b.cohort_id)) return { ok: false, error: "Choose a cohort." };
  return { ok: true, ids, cohortId: b.cohort_id.toLowerCase() };
}

export type EnrollPlan = {
  /** Student ids to insert as new enrolled members. */
  insert: string[];
  /** cohort_members ids of dropped members to re-enroll. */
  reenroll: string[];
  reenrollStudents: string[];
  /** Already enrolled or finished: left alone. */
  already: number;
  /** Requested ids that are not participants of this org. */
  skipped: number;
  inOrg: number;
};

export function planEnrollment(
  requested: string[],
  inOrgIds: string[],
  existing: { id: string; student_id: string; status: string }[],
): EnrollPlan {
  const inOrg = new Set(inOrgIds.map((s) => s.toLowerCase()));
  const byStudent = new Map(existing.map((m) => [m.student_id.toLowerCase(), m]));
  const plan: EnrollPlan = { insert: [], reenroll: [], reenrollStudents: [], already: 0, skipped: 0, inOrg: 0 };
  for (const id of Array.from(new Set(requested.map((s) => s.toLowerCase())))) {
    if (!inOrg.has(id)) {
      plan.skipped++;
      continue;
    }
    plan.inOrg++;
    const m = byStudent.get(id);
    if (!m) plan.insert.push(id);
    else if (m.status === "dropped") {
      plan.reenroll.push(m.id);
      plan.reenrollStudents.push(id);
    } else plan.already++;
  }
  return plan;
}
