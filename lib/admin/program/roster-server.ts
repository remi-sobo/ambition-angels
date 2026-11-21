import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import {
  buildRosterRows,
  type CohortLite,
  type MarkLite,
  type MembershipLite,
  type ParticipantLite,
  type RosterRow,
  type SessionLite,
} from "./roster";

/**
 * The roster loader (V4 Stage E). Reads the active org's participants,
 * memberships, cohorts, sessions and marks through the service-role client,
 * every read pinned to org_id (the house trap: the service role bypasses
 * RLS), and builds rows with the pure rules in roster.ts. Each read is paged
 * past PostgREST's 1,000-row cap; `partial` says when a hard cap still cut a
 * read short, so the page can say its numbers are incomplete.
 */
export type RosterData = {
  rows: RosterRow[];
  cohorts: CohortLite[];
  partial: boolean;
  error: string | null;
};

export async function loadRoster(orgId: string, today: string): Promise<RosterData> {
  const db = getSupabaseAdmin();
  const [people, members, cohorts, sessions, marks] = await Promise.all([
    fetchAll<ParticipantLite>(
      () => db.from("students").select("id, first_name, last_name, email, stage, custom_fields").eq("org_id", orgId),
      { order: ["id"] },
    ),
    fetchAll<MembershipLite>(
      () => db.from("cohort_members").select("cohort_id, student_id, status").eq("org_id", orgId),
      { order: ["id"] },
    ),
    fetchAll<CohortLite>(
      () => db.from("cohorts").select("id, name, status, owner_id").eq("org_id", orgId),
      { order: ["id"] },
    ),
    fetchAll<SessionLite>(
      () => db.from("cohort_sessions").select("id, cohort_id, session_date, status").eq("org_id", orgId),
      { order: ["id"] },
    ),
    fetchAll<MarkLite>(
      () => db.from("attendance").select("session_id, student_id, status").eq("org_id", orgId),
      { order: ["id"] },
    ),
  ]);
  const failed = [people, members, cohorts, sessions, marks].find((r) => r.data === null);
  if (failed || !people.data) {
    return { rows: [], cohorts: [], partial: false, error: "The roster could not be read." };
  }
  const cohortRows = (cohorts.data ?? []) as CohortLite[];
  return {
    rows: buildRosterRows(
      {
        participants: people.data,
        memberships: members.data ?? [],
        cohorts: cohortRows,
        sessions: sessions.data ?? [],
        marks: marks.data ?? [],
      },
      today,
    ),
    cohorts: cohortRows,
    partial: [people, members, cohorts, sessions, marks].some((r) => r.truncated),
    error: null,
  };
}
