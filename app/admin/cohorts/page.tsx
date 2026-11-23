import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import StatCard from "../_components/StatCard";
import SectionSummary from "../_components/SectionSummary";
import { NewCohortForm } from "./_components/CohortControls";
import PageHeader from "../_components/PageHeader";
import { ProgramsFirstRun } from "../programs/_components/ProgramsFirstRun";
import { COHORT_STATUS_LABELS } from "./_lib/constants";
import { pct } from "./_lib/rollups";
import { getSessionPrograms } from "@/lib/admin/program/programs";
import { getProgramTerms } from "@/lib/admin/terminology";
import { getOrgContext } from "@/lib/admin/auth";
import { TYPE } from "@/lib/admin/typeScale";
import Alert from "../_components/ui/Alert";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

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
  planning: "bg-tile text-ink-2",
  active: "bg-orange/15 text-orange",
  completed: "bg-revenue-bg text-revenue",
  archived: "bg-tile text-ink-3",
};

export default async function CohortsPage() {
  const roleGate = await requirePagePermission("program.read", "Programs");
  if (!roleGate.ok) return roleGate.page;
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS, so every read is scoped to
  // the active org. No session → empty.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <h1 className={TYPE.pageTitle}>Groups</h1>
        <p className="text-ink-2 mt-1">Sign in to view your organization&apos;s groups.</p>
      </div>
    );
  }
  const orgId = ctx.orgId;
  const [
    { data: cohortsData },
    { data: membersData, truncated: membersCapped },
    { data: sessionsData, truncated: sessionsCapped },
    { data: marksData, truncated: marksCapped },
    programs,
    terms,
  ] = await Promise.all([
      supabase.from("cohorts").select("*")
        .eq("org_id", orgId)
        .order("start_date", { ascending: false, nullsFirst: false }),
      // Paged past PostgREST's 1,000-row cap: every stat card and per-group
      // rate below is rolled up from these rows.
      fetchAll<{ cohort_id: string; student_id: string; status: string }>(
        () => supabase.from("cohort_members").select("cohort_id, student_id, status").eq("org_id", orgId),
        { order: ["id"] },
      ),
      fetchAll<{ id: string; cohort_id: string; session_date: string; status: string }>(
        () => supabase.from("cohort_sessions").select("id, cohort_id, session_date, status").eq("org_id", orgId),
        { order: ["id"] },
      ),
      fetchAll<{ session_id: string; status: string }>(
        () => supabase.from("attendance").select("session_id, status").eq("org_id", orgId),
        { order: ["id"] },
      ),
      getSessionPrograms(),
      getProgramTerms(),
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
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        title={terms.cohorts}
        subtitle={`${terms.program} × term groups · ${terms.sessions.toLowerCase()}, phone attendance, dosage`}
        primaryAction={<NewCohortForm programs={programs.map((p) => p.name)} />}
        moreActions={[
          { label: `Add people to a ${terms.cohort.toLowerCase()}`, href: "/admin/programs/people?view=unenrolled" },
          { label: "Import a roster file", href: "/admin/settings/imports/csv" },
          { label: "Take attendance", href: "/admin/programs/attendance" },
        ]}
      />

      {/* An empty org has nothing to summarize; "attendance is current" would be a false all-clear. */}
      {cohorts.length > 0 ? <SectionSummary section="cohorts" /> : null}

      {(membersCapped || sessionsCapped || marksCapped) && (
        <Alert tone="warning" title="Partial data" className="mb-6">
          This org has more records than one page load reads, so the counts and attendance rates below cover only part
          of them.
        </Alert>
      )}

      {cohorts.length === 0 ? (
        // V4 Stage E (SetupEmpty.dc.html): an org with no cohorts yet.
        <ProgramsFirstRun
          kind="cohorts"
          terms={terms}
          addOne={<NewCohortForm programs={programs.map((p) => p.name)} />}
          orgName={ctx.orgName}
          headers={[terms.cohort, "Enrolled", `${terms.sessions} held`, "Attendance"]}
        />
      ) : null}

      {cohorts.length > 0 ? (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label={`Active ${terms.cohorts.toLowerCase()}`} value={active.length} sub={`${cohorts.length} total`} />
        <StatCard label={`${terms.students} enrolled`} value={enrolledStudents.size} sub={`across ${terms.cohorts.toLowerCase()}`} />
        <StatCard label="Sessions held" value={heldTotal} muted={heldTotal === 0} />
        <StatCard
          label="Attendance rate"
          value={pct(overallRate)}
          sub="present + late / marked"
          muted={overallRate === null}
        />
      </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {cohorts.map((c) => {
          const r = perCohort(c.id);
          const fill = c.capacity ? Math.min(100, (r.enrolled / c.capacity) * 100) : null;
          return (
            <Link
              key={c.id}
              href={`/admin/programs/cohorts/${c.id}`}
              className="block bg-surface border-hairline rounded-panel p-4 hover:border-orange/30 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading font-semibold text-ink-1">{c.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_CHIP[c.status] ?? "bg-tile text-ink-2"}`}>
                  {COHORT_STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              <p className="text-xs text-ink-2 mt-1">
                {[c.program, c.term].filter(Boolean).join(" · ") || "—"}
                {c.start_date && (
                  <span className="ml-1.5">
                    · {c.start_date}{c.end_date ? ` → ${c.end_date}` : ""}
                  </span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-xs text-ink-2 tabular-nums">
                <span>
                  <span className="font-semibold text-ink-1">{r.enrolled}</span>
                  {c.capacity ? ` / ${c.capacity}` : ""} enrolled
                </span>
                <span>
                  <span className="font-semibold text-ink-1">{r.heldCount}</span>
                  {" / "}{r.sessionCount} sessions held
                </span>
                <span>
                  <span className="font-semibold text-ink-1">{pct(r.rate)}</span> attendance
                </span>
              </div>
              {fill !== null && (
                <div className="mt-2 h-1.5 rounded-full bg-tile overflow-hidden">
                  <div className="h-full rounded-full bg-orange/70" style={{ width: `${fill}%` }} />
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
