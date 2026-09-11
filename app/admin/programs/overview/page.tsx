import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getProgramTerms } from "@/lib/admin/terminology";
import { todayInTZ } from "@/lib/admin/ops/week";
import { pct } from "@/app/admin/cohorts/_lib/rollups";
import { cf, fullName, type Student } from "@/app/admin/students/_lib/studentFields";
import PageHeader from "@/app/admin/_components/PageHeader";
import EmptyState from "@/app/admin/_components/EmptyState";
import { TYPE } from "@/lib/admin/typeScale";

// Spec Programs P2 — Overview, the destination's landing. Until P2 this host
// re-exported /admin/program, a nine-line placeholder — the only V2 landing
// that would greet every org empty. The build is BOUND DATA ONLY (decision
// 3, resolved: the FY26 funnel is platform-app data and stays out until
// Impact's provenance work): the near-term session schedule and the
// needs-attention list — attendance drops, missing guardian contact, intake
// waiting to be screened. Absent data reads as absent; nothing here fakes a
// number (the spec's second failure mode). Reads only; every row links the
// screen that owns the workflow.
export const dynamic = "force-dynamic";

const NEXT_SESSIONS = 5;
const LAST_MARKS = 3; // a "drop" = mostly absent across the last three marks

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default async function ProgramsOverviewPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <h1 className={TYPE.pageTitle}>Overview</h1>
        <p className="text-ink-2 mt-1">Sign in to view the program overview.</p>
      </div>
    );
  }
  const orgId = ctx.orgId;
  const supabase = getSupabaseAdmin();

  // Org fence: the service-role client bypasses RLS, so every read below is
  // scoped to the active org (the house trap).
  const [
    { data: cohortsData },
    { data: sessionsData },
    { data: membersData },
    { data: marksData },
    { data: studentsData },
    { data: appsData },
    terms,
  ] = await Promise.all([
    supabase.from("cohorts").select("id, name, status").eq("org_id", orgId).neq("status", "archived"),
    supabase
      .from("cohort_sessions")
      .select("id, cohort_id, session_date, title, status")
      .eq("org_id", orgId)
      .order("session_date", { ascending: true }),
    supabase.from("cohort_members").select("cohort_id, student_id, status").eq("org_id", orgId),
    supabase
      .from("attendance")
      .select("student_id, session_id, status, recorded_at")
      .eq("org_id", orgId)
      .order("recorded_at", { ascending: true }),
    supabase.from("students").select("*").eq("org_id", orgId),
    supabase.from("applications").select("id, status").eq("org_id", orgId),
    getProgramTerms(),
  ]);

  const cohorts = cohortsData ?? [];
  const cohortName = new Map(cohorts.map((c) => [c.id, c.name as string]));
  const students = (studentsData ?? []) as Student[];
  const studentById = new Map(students.map((s) => [s.id, s]));

  // ── The headline band (the Groups page's own rollup language) ─────────────
  const enrolled = (membersData ?? []).filter(
    (m) => m.status === "enrolled" && cohortName.has(m.cohort_id),
  );
  const enrolledIds = new Set(enrolled.map((m) => m.student_id));
  let attendedAll = 0;
  let markedAll = 0;
  for (const m of marksData ?? []) {
    if (m.status === "excused") continue;
    markedAll++;
    if (m.status === "present" || m.status === "late") attendedAll++;
  }
  const overallRate = markedAll > 0 ? attendedAll / markedAll : null;

  // ── Next sessions ─────────────────────────────────────────────────────────
  const todayISO = todayInTZ();
  const nextSessions = (sessionsData ?? [])
    .filter((s) => s.status !== "canceled" && s.session_date >= todayISO && cohortName.has(s.cohort_id))
    .slice(0, NEXT_SESSIONS);

  // ── Needs attention: attendance drops ─────────────────────────────────────
  // A drop = mostly absent across the student's last three marks (excused
  // marks don't count against anyone). Marks arrive ordered by recorded_at,
  // so the tail of each list IS the recent history.
  const marksByStudent = new Map<string, string[]>();
  for (const m of marksData ?? []) {
    if (m.status === "excused") continue;
    const list = marksByStudent.get(m.student_id) ?? [];
    list.push(m.status);
    marksByStudent.set(m.student_id, list);
  }
  const drops: { student: Student; absences: number }[] = [];
  marksByStudent.forEach((statuses, studentId) => {
    if (!enrolledIds.has(studentId)) return;
    const recent = statuses.slice(-LAST_MARKS);
    if (recent.length < LAST_MARKS) return; // too little history to call it
    const absences = recent.filter((s) => s === "absent").length;
    const student = studentById.get(studentId);
    if (absences >= 2 && student) drops.push({ student, absences });
  });
  drops.sort((a, b) => b.absences - a.absences);

  // ── Needs attention: missing guardian contact ─────────────────────────────
  // The roster's own contact rule (StudentControls): reachable = student
  // email OR guardian email; a name alone can't be contacted.
  const noGuardian = students.filter(
    (s) => enrolledIds.has(s.id) && !s.email && !cf(s, "guardian_email") && !cf(s, "guardian_phone"),
  );

  // ── Needs attention: intake waiting ───────────────────────────────────────
  const toScreen = (appsData ?? []).filter((a) => a.status === "new").length;

  const attentionCount = drops.length + noGuardian.length + (toScreen > 0 ? 1 : 0);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px] space-y-8">
      <PageHeader
        title="Overview"
        subtitle={`${terms.programs}, ${terms.students.toLowerCase()}, outcomes. The near-term schedule and what needs a human.`}
      />

      {/* ── Headline band ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: `active ${terms.cohorts.toLowerCase()}`, value: String(cohorts.filter((c) => c.status === "active").length) },
          { label: `enrolled ${terms.students.toLowerCase()}`, value: String(enrolledIds.size) },
          { label: "attendance to date", value: overallRate === null ? "—" : pct(overallRate) },
        ].map((s) => (
          <div key={s.label} className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel px-4 py-3">
            <div className="font-display font-black text-ink-1 text-2xl leading-none">{s.value}</div>
            <div className="text-[11px] uppercase tracking-wider text-ink-3 mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Next sessions ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className={TYPE.sectionHeader}>
            Next {terms.sessions.toLowerCase()} <span className="text-ink-3 font-normal">({nextSessions.length})</span>
          </h2>
          <Link href="/admin/programs/attendance" className="text-[12px] font-semibold text-orange hover:text-orange-dark">
            Open Attendance →
          </Link>
        </div>
        {nextSessions.length === 0 ? (
          <EmptyState
            label={terms.sessions.toLowerCase()}
            title="Nothing scheduled"
            hint={`${terms.sessions} are planned on each ${terms.cohort.toLowerCase()}'s page. Schedule one and the near-term calendar fills in.`}
            action={
              <Link href="/admin/programs/cohorts" className="text-xs font-semibold text-orange hover:text-orange-dark">
                Open {terms.cohorts} →
              </Link>
            }
          />
        ) : (
          <div className="space-y-1.5">
            {nextSessions.map((s) => (
              <Link
                key={s.id}
                href={`/admin/programs/cohorts/${s.cohort_id}/sessions/${s.id}`}
                className="group flex items-center gap-3 px-4 py-2.5 rounded-card border border-outline bg-surface shadow-panel transition-colors hover:bg-[#EFE6D4]"
              >
                <span className="text-[12px] text-ink-2 font-mono [font-variant-numeric:tabular-nums] w-24 shrink-0">
                  {s.session_date === todayISO ? "Today" : fmtDate(s.session_date)}
                </span>
                <span className="flex-1 min-w-0 truncate text-[14px] text-ink-1 group-hover:text-orange transition-colors">
                  {cohortName.get(s.cohort_id)}
                  {s.title && <span className="text-[13px] text-ink-2"> · {s.title}</span>}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Needs attention ───────────────────────────────────────────── */}
      <section>
        <h2 className={`${TYPE.sectionHeader} mb-2`}>
          Needs attention <span className="text-ink-3 font-normal">({attentionCount})</span>
        </h2>
        {attentionCount === 0 ? (
          <p className="text-sm text-ink-3 italic px-1">
            Nothing flagged: attendance steady, rosters reachable, intake clear.
          </p>
        ) : (
          <div className="space-y-1.5">
            {drops.map(({ student, absences }) => (
              <Link
                key={`drop-${student.id}`}
                href={`/admin/programs/people/${student.id}`}
                className="group flex items-center gap-3 px-4 py-2.5 rounded-card border border-outline bg-surface shadow-panel transition-colors hover:bg-[#EFE6D4]"
              >
                <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border border-expense/30 bg-expense-bg text-expense">
                  attendance
                </span>
                <span className="flex-1 min-w-0 truncate text-[14px] text-ink-1 group-hover:text-orange transition-colors">
                  {fullName(student)}
                </span>
                <span className="shrink-0 text-[12px] text-ink-2">
                  absent {absences} of last {LAST_MARKS}
                </span>
              </Link>
            ))}
            {noGuardian.map((s) => (
              <Link
                key={`guardian-${s.id}`}
                href={`/admin/programs/people/${s.id}`}
                className="group flex items-center gap-3 px-4 py-2.5 rounded-card border border-outline bg-surface shadow-panel transition-colors hover:bg-[#EFE6D4]"
              >
                <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border border-[#A56A1B]/30 bg-[#FBF3E4] text-[#A56A1B]">
                  no contact
                </span>
                <span className="flex-1 min-w-0 truncate text-[14px] text-ink-1 group-hover:text-orange transition-colors">
                  {fullName(s)}
                </span>
                <span className="shrink-0 text-[12px] text-ink-2">no email or guardian on file</span>
              </Link>
            ))}
            {toScreen > 0 && (
              <Link
                href="/admin/programs/intake"
                className="group flex items-center gap-3 px-4 py-2.5 rounded-card border border-outline bg-surface shadow-panel transition-colors hover:bg-[#EFE6D4]"
              >
                <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border border-outline bg-tile text-ink-2">
                  intake
                </span>
                <span className="flex-1 min-w-0 text-[14px] text-ink-1 group-hover:text-orange transition-colors">
                  {toScreen} application{toScreen === 1 ? "" : "s"} waiting to be screened
                </span>
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
