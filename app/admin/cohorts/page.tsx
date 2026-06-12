import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import StatCard from "../_components/StatCard";
import { NewCohortForm, COHORT_STATUS_LABELS } from "./_components/CohortControls";
import { pct } from "./_lib/rollups";

// Cohorts & attendance (Ring 3, modules/02-program.md "Cohorts"):
// program × term × site groupings with capacity, sessions, and dosage
// rollups. YGB Creators Camp is folded in by create_cohorts_attendance.
export const dynamic = "force-dynamic";

type Cohort = {
  id: string;
  name: string;
  program: string | null;
  term: string | null;
  location: string | null;
  capacity: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
};

const STATUS_CHIP: Record<string, string> = {
  planning: "bg-white/10 text-gray-mid",
  active: "bg-orange/15 text-orange",
  completed: "bg-green-500/15 text-green-400",
  archived: "bg-white/5 text-white/30",
};

export default async function CohortsPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: cohortsData }, { data: membersData }, { data: sessionsData }, { data: marksData }] =
    await Promise.all([
      supabase.from("cohorts").select("*")
        .order("start_date", { ascending: false, nullsFirst: false }),
      supabase.from("cohort_members").select("cohort_id, student_id, status"),
      supabase.from("cohort_sessions").select("id, cohort_id, session_date, status"),
      supabase.from("attendance").select("session_id, status"),
    ]);
  const cohorts = (cohortsData ?? []) as Cohort[];
  const members = membersData ?? [];
  const sessions = sessionsData ?? [];
  const marks = marksData ?? [];

  const marksBySession = new Map<string, { attended: number; absent: number }>();
  for (const m of marks) {
    const agg = marksBySession.get(m.session_id) ?? { attended: 0, absent: 0 };
    if (m.status === "present" || m.status === "late") agg.attended++;
    else if (m.status === "absent") agg.absent++;
    marksBySession.set(m.session_id, agg);
  }

  const perCohort = (id: string) => {
    const enrolled = members.filter((m) => m.cohort_id === id && m.status === "enrolled").length;
    const cohortSessions = sessions.filter((s) => s.cohort_id === id);
    const held = cohortSessions.filter((s) => s.status === "held");
    let attended = 0, absent = 0;
    for (const s of held) {
      const agg = marksBySession.get(s.id);
      if (agg) { attended += agg.attended; absent += agg.absent; }
    }
    return {
      enrolled,
      sessionCount: cohortSessions.filter((s) => s.status !== "canceled").length,
      heldCount: held.length,
      rate: attended + absent > 0 ? attended / (attended + absent) : null,
    };
  };

  const active = cohorts.filter((c) => c.status === "active");
  const enrolledStudents = new Set(
    members
      .filter((m) => m.status === "enrolled" &&
        cohorts.some((c) => c.id === m.cohort_id && c.status !== "archived"))
      .map((m) => m.student_id)
  );
  const heldTotal = sessions.filter((s) => s.status === "held").length;
  let attendedAll = 0, absentAll = 0;
  marksBySession.forEach((agg) => {
    attendedAll += agg.attended;
    absentAll += agg.absent;
  });
  const overallRate = attendedAll + absentAll > 0 ? attendedAll / (attendedAll + absentAll) : null;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-8 max-w-[1100px]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl text-cream">Cohorts</h1>
          <p className="text-gray-mid text-sm mt-0.5">
            Program × term groups · sessions, roster-tap attendance, dosage
          </p>
        </div>
        <NewCohortForm />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active cohorts" value={active.length} sub={`${cohorts.length} total`} />
        <StatCard label="Students enrolled" value={enrolledStudents.size} sub="across cohorts" />
        <StatCard label="Sessions held" value={heldTotal} muted={heldTotal === 0} />
        <StatCard
          label="Attendance rate"
          value={pct(overallRate)}
          sub="present + late / marked"
          muted={overallRate === null}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {cohorts.map((c) => {
          const r = perCohort(c.id);
          const fill = c.capacity ? Math.min(100, (r.enrolled / c.capacity) * 100) : null;
          return (
            <Link
              key={c.id}
              href={`/admin/cohorts/${c.id}`}
              className="block bg-[#161926] border border-white/10 rounded-card p-4 hover:border-orange/30 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading font-semibold text-cream">{c.name}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_CHIP[c.status] ?? "bg-white/10 text-gray-mid"}`}>
                  {COHORT_STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              <p className="text-[12px] text-gray-mid mt-1">
                {[c.program, c.term].filter(Boolean).join(" · ") || "—"}
                {c.start_date && (
                  <span className="ml-1.5">
                    · {c.start_date}{c.end_date ? ` → ${c.end_date}` : ""}
                  </span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[12px] text-cream/70 tabular-nums">
                <span>
                  <span className="font-semibold text-cream">{r.enrolled}</span>
                  {c.capacity ? ` / ${c.capacity}` : ""} enrolled
                </span>
                <span>
                  <span className="font-semibold text-cream">{r.heldCount}</span>
                  {" / "}{r.sessionCount} sessions held
                </span>
                <span>
                  <span className="font-semibold text-cream">{pct(r.rate)}</span> attendance
                </span>
              </div>
              {fill !== null && (
                <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-orange/70" style={{ width: `${fill}%` }} />
                </div>
              )}
            </Link>
          );
        })}
        {cohorts.length === 0 && (
          <p className="text-sm text-gray-mid col-span-full">
            No cohorts yet — create one above, or run the create_cohorts_attendance migration to
            fold in YGB Creators Camp.
          </p>
        )}
      </div>
    </div>
  );
}
