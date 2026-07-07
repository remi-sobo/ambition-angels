import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generate 360 rater assignments for a cycle from the org chart. For each active
 * subject: self, their manager (downward), their reports (upward), and their
 * peers (same manager). Idempotent — rows dedupe on
 * (cycle_id, subject_staff_id, rater_staff_id).
 *
 * Also computes the small-team anonymity warning: any upward/peer rater group of
 * exactly one can't be anonymous (it's obviously that one person), so the admin
 * is told and the cycle's confidential default is the honest setting.
 */

type Node = { id: string; full_name: string; reports_to: string | null };

export type SubjectAssignment = {
  subjectId: string;
  name: string;
  self: number;
  manager: number;
  upward: number;
  peers: number;
  /** true when an upward or peer group has exactly one rater (anonymity can't be real). */
  thinGroup: boolean;
};

export type GenerateResult = {
  inserted: number;
  subjects: SubjectAssignment[];
  anyThin: boolean;
};

export async function generateAssignments(
  supabase: SupabaseClient,
  orgId: string,
  cycleId: string
): Promise<GenerateResult> {
  const { data } = await supabase
    .from("staff")
    .select("id, full_name, reports_to")
    .eq("org_id", orgId)
    .eq("status", "active");
  const staff = (data ?? []) as Node[];
  const byId = new Map(staff.map((s) => [s.id, s]));

  type Row = { org_id: string; cycle_id: string; subject_staff_id: string; rater_staff_id: string; relationship: string };
  const rows: Row[] = [];
  const subjects: SubjectAssignment[] = [];

  for (const s of staff) {
    const reports = staff.filter((x) => x.reports_to === s.id);
    const peers = s.reports_to
      ? staff.filter((x) => x.reports_to === s.reports_to && x.id !== s.id)
      : [];
    const manager = s.reports_to && byId.has(s.reports_to) ? byId.get(s.reports_to)! : null;

    const add = (rater: string, rel: string) =>
      rows.push({ org_id: orgId, cycle_id: cycleId, subject_staff_id: s.id, rater_staff_id: rater, relationship: rel });

    add(s.id, "self");
    if (manager) add(manager.id, "manager");
    reports.forEach((r) => add(r.id, "report"));
    peers.forEach((p) => add(p.id, "peer"));

    const thinGroup = reports.length === 1 || peers.length === 1;
    subjects.push({
      subjectId: s.id,
      name: s.full_name,
      self: 1,
      manager: manager ? 1 : 0,
      upward: reports.length,
      peers: peers.length,
      thinGroup,
    });
  }

  let inserted = 0;
  if (rows.length) {
    const { data: up } = await supabase
      .from("review_feedback")
      .upsert(rows, { onConflict: "cycle_id,subject_staff_id,rater_staff_id", ignoreDuplicates: true })
      .select("id");
    inserted = (up ?? []).length;
  }

  return { inserted, subjects, anyThin: subjects.some((s) => s.thinGroup) };
}
