import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import StatCard from "../../_components/StatCard";
import {
  CohortHeaderControls,
  MemberRow,
  AddMemberForm,
  SessionRow,
  NewSessionForm,
  type MemberView,
  type SessionView,
} from "./_components/CohortDetailControls";
import {
  dosageFor,
  pct,
  REGULAR_ATTENDEE_THRESHOLD,
  type SessionLite,
  type MarkLite,
} from "../_lib/rollups";

// Cohort dashboard: enrollment vs capacity, sessions, per-member dosage
// (modules/02-program.md "Cohorts" + "Attendance & dosage").
export const dynamic = "force-dynamic";

export default async function CohortPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = getSupabaseAdmin();

  const { data: cohort } = await supabase
    .from("cohorts").select("*").eq("id", params.id).maybeSingle();
  if (!cohort) notFound();

  const [{ data: membersData }, { data: sessionsData }, { data: studentsData }] =
    await Promise.all([
      supabase
        .from("cohort_members")
        .select("id, student_id, status, students(first_name, last_name, grade)")
        .eq("cohort_id", params.id),
      supabase
        .from("cohort_sessions")
        .select("*")
        .eq("cohort_id", params.id)
        .order("session_date"),
      supabase
        .from("students")
        .select("id, first_name, last_name, grade, stage")
        .order("first_name"),
    ]);
  const members = membersData ?? [];
  const sessions = (sessionsData ?? []) as (SessionLite & SessionView)[];
  const sessionIds = sessions.map((s) => s.id);

  const { data: marksData } = sessionIds.length
    ? await supabase
        .from("attendance")
        .select("session_id, student_id, status")
        .in("session_id", sessionIds)
    : { data: [] };
  const marks = (marksData ?? []) as MarkLite[];

  const memberViews: MemberView[] = members
    .map((m) => {
      const s = m.students as unknown as
        { first_name: string; last_name: string | null; grade: string | null } | null;
      const d = dosageFor(m.student_id, sessions, marks);
      return {
        memberId: m.id,
        studentId: m.student_id,
        name: s ? [s.first_name, s.last_name].filter(Boolean).join(" ") : "Unknown",
        grade: s?.grade ?? null,
        status: m.status,
        attended: d.attended,
        absent: d.absent,
        rateText: pct(d.rate),
        consecutiveAbsences: d.consecutiveAbsences,
        regular: d.rate !== null && d.rate >= REGULAR_ATTENDEE_THRESHOLD,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const enrolled = memberViews.filter((m) => m.status === "enrolled");
  const memberIds = new Set(members.map((m) => m.student_id));
  const candidates = (studentsData ?? [])
    .filter((s) => !memberIds.has(s.id) && s.stage !== "withdrawn")
    .map((s) => ({
      id: s.id,
      label:
        [s.first_name, s.last_name].filter(Boolean).join(" ") +
        (s.grade ? ` (Grade ${s.grade})` : ""),
    }));

  const sessionViews: SessionView[] = sessions.map((s) => {
    const sessionMarks = marks.filter((m) => m.session_id === s.id);
    return {
      id: s.id,
      session_date: s.session_date,
      title: s.title,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      status: s.status,
      attended: sessionMarks.filter((m) => m.status === "present" || m.status === "late").length,
      marked: sessionMarks.length,
    };
  });

  const held = sessions.filter((s) => s.status === "held").length;
  let attendedAll = 0, absentAll = 0;
  for (const m of marks) {
    if (m.status === "present" || m.status === "late") attendedAll++;
    else if (m.status === "absent") absentAll++;
  }
  const rate = attendedAll + absentAll > 0 ? attendedAll / (attendedAll + absentAll) : null;
  const regulars = memberViews.filter((m) => m.regular).length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-8 max-w-[1100px]">
      <Link href="/admin/cohorts" className="text-[11px] text-gray-mid hover:text-cream">
        ← All cohorts
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-1">
        <h1 className="font-heading font-bold text-2xl text-cream">{cohort.name}</h1>
        <CohortHeaderControls cohortId={cohort.id} status={cohort.status} name={cohort.name} />
      </div>
      <p className="text-gray-mid text-sm mb-6">
        {[cohort.program, cohort.term, cohort.location].filter(Boolean).join(" · ") || "—"}
        {cohort.start_date && (
          <span className="ml-1.5">
            · {cohort.start_date}{cohort.end_date ? ` → ${cohort.end_date}` : ""}
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Enrolled"
          value={enrolled.length}
          sub={cohort.capacity ? `of ${cohort.capacity} capacity` : undefined}
        />
        <StatCard label="Sessions held" value={held} sub={`${sessionViews.length} scheduled`} muted={held === 0} />
        <StatCard label="Attendance rate" value={pct(rate)} sub="present + late / marked" muted={rate === null} />
        <StatCard
          label="Regular attendees"
          value={regulars}
          sub={`≥ ${Math.round(REGULAR_ATTENDEE_THRESHOLD * 100)}% rate`}
          muted={regulars === 0}
        />
      </div>

      <section className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70">
            Sessions ({sessionViews.length})
          </h2>
          <NewSessionForm cohortId={cohort.id} />
        </div>
        <div className="space-y-2">
          {sessionViews.map((s) => (
            <SessionRow key={s.id} cohortId={cohort.id} session={s} enrolled={enrolled.length} />
          ))}
          {sessionViews.length === 0 && (
            <p className="text-sm text-gray-mid">No sessions scheduled yet.</p>
          )}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70">
            Members ({memberViews.length})
          </h2>
          <AddMemberForm cohortId={cohort.id} candidates={candidates} />
        </div>
        <div className="space-y-2">
          {memberViews.map((m) => (
            <MemberRow key={m.memberId} cohortId={cohort.id} member={m} />
          ))}
          {memberViews.length === 0 && (
            <p className="text-sm text-gray-mid">
              No students enrolled yet — pick one from the roster above.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
