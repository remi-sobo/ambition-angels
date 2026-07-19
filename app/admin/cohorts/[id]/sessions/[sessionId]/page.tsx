import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import AttendanceSheet, { type RosterEntry } from "./_components/AttendanceSheet";
import { TYPE } from "@/lib/admin/typeScale";

// Session check-in: the roster-tap attendance screen for one session.
export const dynamic = "force-dynamic";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export default async function SessionAttendancePage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  if (!isUuid(params.id) || !isUuid(params.sessionId)) notFound();
  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS. Scope the session read to the
  // caller's org (foreign session id → not-found, was an IDOR) and every child
  // read too.
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const orgId = ctx.orgId;

  const { data: session } = await supabase
    .from("cohort_sessions")
    .select("*, cohorts(name)")
    .eq("org_id", orgId)
    .eq("id", params.sessionId)
    .eq("cohort_id", params.id)
    .maybeSingle();
  if (!session) notFound();
  const cohortName =
    (session.cohorts as unknown as { name: string } | null)?.name ?? "Cohort";

  const [{ data: membersData }, { data: marksData }] = await Promise.all([
    supabase
      .from("cohort_members")
      .select("student_id, status, students(first_name, last_name, custom_fields)")
      .eq("org_id", orgId)
      .eq("cohort_id", params.id)
      .eq("status", "enrolled"),
    supabase
      .from("attendance")
      .select("student_id, status")
      .eq("org_id", orgId)
      .eq("session_id", params.sessionId),
  ]);

  const markByStudent = new Map((marksData ?? []).map((m) => [m.student_id, m.status]));
  const roster: RosterEntry[] = (membersData ?? [])
    .map((m) => {
      const s = m.students as unknown as
        { first_name: string; last_name: string | null; custom_fields: Record<string, unknown> | null } | null;
      return {
        studentId: m.student_id,
        name: s ? [s.first_name, s.last_name].filter(Boolean).join(" ") : "Unknown",
        grade: (s?.custom_fields?.grade as string | undefined) ?? null,
        status: markByStudent.get(m.student_id) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const time = session.starts_at
    ? `${String(session.starts_at).slice(0, 5)}–${String(session.ends_at ?? "").slice(0, 5)}`
    : null;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[640px]">
      <Link href={`/admin/cohorts/${params.id}`} className="text-[11px] text-ink-2 hover:text-ink-1">
        ← {cohortName}
      </Link>
      <h1 className={`${TYPE.pageTitle} mt-2`}>
        {session.title || "Session"}
      </h1>
      <p className={`${TYPE.bodyMuted} mt-0.5 mb-6 tabular-nums`}>
        {session.session_date}
        {time ? ` · ${time}` : ""}
        {session.location ? ` · ${session.location}` : ""}
      </p>

      <AttendanceSheet sessionId={params.sessionId} roster={roster} />
    </div>
  );
}
