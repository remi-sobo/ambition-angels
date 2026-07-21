import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntityHistory } from "@/lib/admin/history";
import { getParticipantStages } from "@/lib/admin/program/stages";
import { getFieldDefs } from "@/lib/admin/customFields";
import { getProgramTerms, getTermLabel } from "@/lib/admin/terminology";
import StatCard from "../../_components/StatCard";
import { EntityTasks } from "../../_components/EntityTasks";
import { EntityDocuments } from "../../_components/EntityDocuments";
import { CommentThread } from "../../_components/CommentThread";
import { EntityHistory } from "../../_components/EntityHistory";
import { TYPE } from "@/lib/admin/typeScale";
import { fullName, cf, type Student } from "../_components/StudentControls";
import { StageControls, EditStudentProfile } from "./_components/StudentProfileControls";

// Student profile (governance-profile-views phase 2): the full record behind
// a roster row — identity + registry custom fields, stage controls,
// enrollment history across cohorts, per-session attendance, and the
// standard record panels (tasks, documents, comments, audit history).
export const dynamic = "force-dynamic";

const fmtDate = (s: string) =>
  new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

type Enrollment = {
  id: string;
  status: string;
  joined_on: string;
  ended_on: string | null;
  cohort: { id: string; name: string } | null;
};

type AttendanceRow = {
  id: string;
  status: string;
  session: { session_date: string; title: string | null; cohort: { name: string } | null } | null;
};

const ATT_STYLE: Record<string, string> = {
  present: "text-revenue",
  late: "text-[#A56A1B]",
  excused: "text-ink-3",
  absent: "text-expense",
};

export default async function StudentProfilePage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS — scope every read to the
  // caller's org (a foreign id must 404, not leak).
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const orgId = ctx.orgId;

  const [studentRes, stages, terms, volunteerTerm, history] = await Promise.all([
    supabase.from("students").select("*").eq("org_id", orgId).eq("id", params.id).maybeSingle(),
    getParticipantStages(),
    getProgramTerms(),
    getTermLabel("volunteer", "Volunteer"),
    getEntityHistory(orgId, "student", params.id),
  ]);
  if (!studentRes.data) notFound();
  const student = studentRes.data as Student;

  const [defs, enrollRes, attRes, leaderRows] = await Promise.all([
    getFieldDefs(orgId, "student"),
    supabase
      .from("cohort_members")
      .select("id, status, joined_on, ended_on, cohort:cohorts(id, name)")
      .eq("org_id", orgId)
      .eq("student_id", student.id)
      .order("joined_on", { ascending: false }),
    supabase
      .from("attendance")
      .select("id, status, session:cohort_sessions(session_date, title, cohort:cohorts(name))")
      .eq("org_id", orgId)
      .eq("student_id", student.id)
      .limit(200),
    supabase
      .from("constituents")
      .select("id, first_name, last_name, org_name")
      .eq("org_id", orgId)
      .eq("is_volunteer", true)
      .is("archived_at", null)
      .order("last_name", { ascending: true, nullsFirst: false })
      .limit(200),
  ]);
  const enrollments = (enrollRes.data ?? []) as unknown as Enrollment[];
  const attendance = ((attRes.data ?? []) as unknown as AttendanceRow[]).sort((a, b) =>
    (b.session?.session_date ?? "").localeCompare(a.session?.session_date ?? "")
  );
  const leaders = ((leaderRows.data ?? []) as {
    id: string; first_name: string | null; last_name: string | null; org_name: string | null;
  }[]).map((l) => ({
    id: l.id,
    name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.org_name || "(no name)",
  }));

  const stageOptions = stages.map((s) => ({
    stage_key: s.stage_key, label: s.label, terminal: s.terminal, description: s.description,
  }));
  const stageLabel = stages.find((s) => s.stage_key === student.stage)?.label ?? student.stage;
  const activeEnrollments = enrollments.filter((e) => e.status === "enrolled");
  const attended = attendance.filter((a) => a.status === "present" || a.status === "late");
  const leaderName = student.leader_id
    ? leaders.find((l) => l.id === student.leader_id)?.name ?? null
    : null;

  const guardianName = cf(student, "guardian_name");
  const guardianEmail = cf(student, "guardian_email");
  const guardianPhone = cf(student, "guardian_phone");
  const grade = cf(student, "grade");
  const school = cf(student, "school");

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <Link href="/admin/students" className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors">
          ← {terms.students}
        </Link>
        <h1 className={`${TYPE.pageTitle} !text-lg`}>{fullName(student)}</h1>
        {student.external_source && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 uppercase tracking-wider">
            {student.external_source}
          </span>
        )}
        <div className="ml-auto">
          <StageControls student={student} stages={stageOptions} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label={terms.stage} value={stageLabel} />
        <StatCard
          label="Enrollments"
          value={activeEnrollments.length}
          sub={`${enrollments.length} all-time`}
          muted={enrollments.length === 0}
        />
        <StatCard
          label="Attendance"
          value={attendance.length > 0 ? `${attended.length}/${attendance.length}` : "—"}
          sub={
            attendance.length > 0
              ? `${Math.round((attended.length / attendance.length) * 100)}% of recorded sessions`
              : "no sessions recorded"
          }
          muted={attendance.length === 0}
        />
        <StatCard
          label="Last activity"
          value={student.last_activity_at ? fmtDate(student.last_activity_at) : "—"}
          muted={!student.last_activity_at}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-5 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-3 self-start">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h2 className={TYPE.cardTitle}>Profile</h2>
            <EditStudentProfile
              student={student}
              defs={defs}
              term={terms.student}
              leaders={leaders}
              volunteerTerm={volunteerTerm}
            />
          </div>
          {[
            ["Email", student.email ?? "—"],
            ["Phone", student.phone ?? "—"],
            ["Location", student.location ?? "—"],
            ...(grade ? [["Grade", grade]] : []),
            ...(school ? [["School", school]] : []),
            [volunteerTerm, leaderName ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-3 text-xs">
              <span className="text-ink-3 w-24 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">
                {label}
              </span>
              <span className="text-ink-1 break-words min-w-0">{String(value)}</span>
            </div>
          ))}
          {(guardianName || guardianEmail || guardianPhone) && (
            <div className="border-t border-outline pt-3">
              <h3 className={`${TYPE.sectionHeader} mb-2`}>Guardian</h3>
              <p className="text-xs text-ink-1">
                {guardianName || "—"}
                {guardianEmail && (
                  <a href={`mailto:${guardianEmail}`} className="text-orange/80 hover:text-orange ml-1.5">
                    {guardianEmail}
                  </a>
                )}
                {guardianPhone ? ` · ${guardianPhone}` : ""}
              </p>
            </div>
          )}
          {student.notes && (
            <p className="text-xs text-ink-2 border-t border-outline pt-3 whitespace-pre-wrap">{student.notes}</p>
          )}
        </section>

        <div className="lg:col-span-7 space-y-4">
          <EntityTasks
            entityType="student"
            entityId={student.id}
            entityLabel={fullName(student)}
            defaultCategory="program"
          />
          <EntityDocuments entityType="student" entityId={student.id} entityLabel={fullName(student)} />

          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline">
              <h2 className={TYPE.cardTitle}>
                Enrollments {enrollments.length > 0 && (
                  <span className="text-ink-3 font-normal">· {enrollments.length}</span>
                )}
              </h2>
            </div>
            {enrollments.length === 0 ? (
              <p className={`p-6 ${TYPE.bodyMuted}`}>
                Not enrolled in any {terms.programs.toLowerCase()} yet — enroll from a cohort page.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {enrollments.map((e) => (
                  <li key={e.id} className="px-5 py-3 text-sm flex items-center gap-4">
                    <span className="text-xs text-ink-2 w-24 flex-shrink-0 tabular-nums">
                      {fmtDate(e.joined_on)}
                    </span>
                    {e.cohort ? (
                      <Link href={`/admin/cohorts/${e.cohort.id}`}
                        className="text-ink-1 hover:text-orange transition-colors flex-1 min-w-0 truncate">
                        {e.cohort.name}
                      </Link>
                    ) : (
                      <span className="text-ink-1 flex-1">—</span>
                    )}
                    <span
                      className={`text-[11px] font-semibold ${
                        e.status === "enrolled" ? "text-revenue" : e.status === "completed" ? "text-ink-2" : "text-expense"
                      }`}
                    >
                      {e.status}
                      {e.ended_on ? ` · ended ${fmtDate(e.ended_on)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {attendance.length > 0 && (
            <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-outline">
                <h2 className={TYPE.cardTitle}>
                  Attendance <span className="text-ink-3 font-normal">· {attended.length} of {attendance.length} attended</span>
                </h2>
              </div>
              <ul className="divide-y divide-hairline">
                {attendance.slice(0, 15).map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm flex items-center gap-4">
                    <span className="text-xs text-ink-2 w-24 flex-shrink-0 tabular-nums">
                      {a.session ? fmtDate(a.session.session_date) : "—"}
                    </span>
                    <span className="text-ink-1 flex-1 min-w-0 truncate">
                      {a.session?.title || a.session?.cohort?.name || "Session"}
                      {a.session?.title && a.session?.cohort?.name && (
                        <span className="text-ink-3"> · {a.session.cohort.name}</span>
                      )}
                    </span>
                    <span className={`text-[11px] font-semibold ${ATT_STYLE[a.status] ?? "text-ink-2"}`}>
                      {a.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <CommentThread entityType="student" entityId={student.id} entityLabel={fullName(student)} />
          <EntityHistory events={history} />
        </div>
      </div>
    </div>
  );
}
