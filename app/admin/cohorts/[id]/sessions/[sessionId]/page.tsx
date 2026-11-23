import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import PhoneAttendance, { type PhoneRosterEntry } from "./_components/PhoneAttendance";
import { TYPE } from "@/lib/admin/typeScale";
import { getProgramTerms } from "@/lib/admin/terminology";
import { isMarkStatus } from "@/lib/admin/program/attendance";
import { shortDate } from "@/lib/admin/program/roster";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

// Take attendance for one session (V4 Stage E, AttendancePhone.dc.html):
// the phone screen. Everyone defaults to present, one tap per exception,
// Save; marks queue on the device when offline (PhoneAttendance).
export const dynamic = "force-dynamic";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export default async function SessionAttendancePage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  const roleGate = await requirePagePermission("program.read", "Programs");
  if (!roleGate.ok) return roleGate.page;
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

  const [{ data: membersData }, { data: marksData }, canWrite, terms] = await Promise.all([
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
    ctxHasPermission(ctx, "program.write"),
    getProgramTerms(),
  ]);

  const markByStudent = new Map((marksData ?? []).map((m) => [m.student_id, m.status]));
  const roster: PhoneRosterEntry[] = (membersData ?? [])
    .map((m) => {
      const s = m.students as unknown as
        { first_name: string; last_name: string | null; custom_fields: Record<string, unknown> | null } | null;
      const saved = markByStudent.get(m.student_id);
      const grade = (s?.custom_fields?.grade as string | undefined) ?? null;
      return {
        participantId: m.student_id,
        name: s ? [s.first_name, s.last_name].filter(Boolean).join(" ") : "Unknown",
        detail: grade ? `Grade ${grade}` : null,
        saved: isMarkStatus(saved) ? saved : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const time = session.starts_at
    ? `${String(session.starts_at).slice(0, 5)}–${String(session.ends_at ?? "").slice(0, 5)}`
    : null;

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[640px]">
      <Link
        href={`/admin/programs/cohorts/${params.id}`}
        className="inline-flex items-center min-h-[44px] text-sm text-ink-2 hover:text-ink-1"
      >
        ← {cohortName}
      </Link>
      <h1 className={`${TYPE.pageTitle}`}>{session.title || terms.session}</h1>
      <p className={`${TYPE.bodyMuted} mt-0.5 mb-4 tabular-nums`}>
        {shortDate(session.session_date)}
        {time ? ` · ${time}` : ""}
        {session.location ? ` · ${session.location}` : ""}
      </p>

      <PhoneAttendance sessionId={params.sessionId} roster={roster} canWrite={canWrite} />
    </div>
  );
}
