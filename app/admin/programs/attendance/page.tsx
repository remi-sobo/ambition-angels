import Link from "next/link";
import EmptyState from "../../_components/EmptyState";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getProgramTerms } from "@/lib/admin/terminology";
import { todayInTZ } from "@/lib/admin/ops/week";
import { pct } from "@/app/admin/cohorts/_lib/rollups";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";
import Alert from "@/app/admin/_components/ui/Alert";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";
import { ProgramsFirstRun } from "@/app/admin/programs/_components/ProgramsFirstRun";
import { NewCohortForm } from "@/app/admin/cohorts/_components/CohortControls";

// Spec Programs P1 — Attendance, the model's one seatless screen (recon §G:
// cohort_sessions + attendance, "bindable"). One surface across every
// cohort: today's sessions, what's coming, what was just held — each row
// opening the session's existing check-in sheet at its cohorts seat. READS
// ONLY: the sheet keeps owning every attendance write (the spec's first
// failure mode is a second write path forking the truth), and the offline
// queue is deferred by ruling (decision 2). Counts are rollups over
// attendance rows, not new stores (Contract 2's spirit: no invented number).
export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  cohort_id: string;
  session_date: string;
  title: string | null;
  status: "scheduled" | "held" | "canceled";
};

const UPCOMING_LIMIT = 20;
const RECENT_LIMIT = 20;

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default async function AttendancePage() {
  const roleGate = await requirePagePermission("program.read", "Programs");
  if (!roleGate.ok) return roleGate.page;
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <h1 className={TYPE.pageTitle}>Attendance</h1>
        <p className="text-ink-2 mt-1">Sign in to view attendance.</p>
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
    { data: membersData, truncated: membersCapped },
    { data: marksData, truncated: marksCapped },
    terms,
  ] = await Promise.all([
      supabase.from("cohorts").select("id, name, status").eq("org_id", orgId).neq("status", "archived"),
      supabase
        .from("cohort_sessions")
        .select("id, cohort_id, session_date, title, status")
        .eq("org_id", orgId)
        .order("session_date", { ascending: true }),
      // Paged past PostgREST's 1,000-row cap: per-session rates and expected
      // counts are rolled up from these, so a capped read is a wrong number.
      fetchAll<{ cohort_id: string; status: string }>(
        () => supabase.from("cohort_members").select("cohort_id, status").eq("org_id", orgId),
        { order: ["id"] },
      ),
      fetchAll<{ session_id: string; status: string }>(
        () => supabase.from("attendance").select("session_id, status").eq("org_id", orgId),
        { order: ["id"] },
      ),
      getProgramTerms(),
    ]);

  const cohortName = new Map((cohortsData ?? []).map((c) => [c.id, c.name as string]));
  const sessions = ((sessionsData ?? []) as SessionRow[]).filter((s) => cohortName.has(s.cohort_id));

  // Expected = enrolled members of the session's cohort; taken/attended from
  // the marks — the same aggregation the Groups page rolls up, per session.
  const enrolledByCohort = new Map<string, number>();
  for (const m of membersData ?? []) {
    if (m.status !== "enrolled") continue;
    enrolledByCohort.set(m.cohort_id, (enrolledByCohort.get(m.cohort_id) ?? 0) + 1);
  }
  const marksBySession = new Map<string, { taken: number; attended: number }>();
  for (const m of marksData ?? []) {
    const agg = marksBySession.get(m.session_id) ?? { taken: 0, attended: 0 };
    agg.taken++;
    if (m.status === "present" || m.status === "late") agg.attended++;
    marksBySession.set(m.session_id, agg);
  }

  const todayISO = todayInTZ();
  const live = sessions.filter((s) => s.status !== "canceled");
  const today = live.filter((s) => s.session_date === todayISO);
  const upcoming = live.filter((s) => s.session_date > todayISO).slice(0, UPCOMING_LIMIT);
  const recent = live
    .filter((s) => s.session_date < todayISO)
    .slice(-RECENT_LIMIT)
    .reverse();

  const Row = ({ s, showRate, cta }: { s: SessionRow; showRate?: boolean; cta?: boolean }) => {
    const expected = enrolledByCohort.get(s.cohort_id) ?? 0;
    const agg = marksBySession.get(s.id);
    const taken = agg?.taken ?? 0;
    const rate = agg && agg.taken > 0 ? agg.attended / agg.taken : null;
    return (
      <Link
        href={`/admin/programs/cohorts/${s.cohort_id}/sessions/${s.id}`}
        className={`group flex flex-wrap items-center gap-3 px-4 ${cta ? "py-3.5 min-h-[56px]" : "py-2.5"} rounded-panel border border-hairline bg-surface transition-colors hover:bg-tile`}
      >
        <span className="text-xs text-ink-2 font-mono [font-variant-numeric:tabular-nums] w-24 shrink-0">
          {fmtDate(s.session_date)}
        </span>
        <span className="flex-1 min-w-0 truncate">
          <span className="text-[14px] text-ink-1 group-hover:text-orange transition-colors">
            {cohortName.get(s.cohort_id)}
          </span>
          {s.title && <span className="text-sm text-ink-2"> · {s.title}</span>}
        </span>
        {s.status === "held" || taken > 0 ? (
          <span className="shrink-0 text-xs text-ink-2">
            {showRate && rate !== null ? (
              <>
                <span className="font-semibold text-ink-1">{pct(rate)}</span> · {taken}/{expected || "?"} marked
              </>
            ) : (
              <>{taken}/{expected || "?"} marked</>
            )}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-ink-3">
            {expected} expected · not taken
          </span>
        )}
        {/* V4 Stage E: today's rows say what the tap does (it opens the phone roster). */}
        {cta ? (
          <span className="shrink-0 text-xs font-semibold text-orange">Take attendance →</span>
        ) : null}
      </Link>
    );
  };

  const Section = ({
    label,
    rows,
    empty,
    emptyHint,
    emptyAction,
    showRate,
    cta,
  }: {
    label: string;
    rows: SessionRow[];
    empty: string;
    emptyHint?: string;
    emptyAction?: React.ReactNode;
    showRate?: boolean;
    cta?: boolean;
  }) => (
    <section>
      <h2 className={`${TYPE.sectionHeader} mb-2`}>
        {label} <span className="text-ink-3 font-normal">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <EmptyState label={sessionsWord} title={empty} hint={emptyHint} action={emptyAction} />
      ) : (
        <div className="space-y-1.5">
          {rows.map((s) => (
            <Row key={s.id} s={s} showRate={showRate} cta={cta} />
          ))}
        </div>
      )}
    </section>
  );

  const sessionsWord = terms.sessions.toLowerCase();
  // V4 Stage E (SetupEmpty.dc.html): an org with no cohorts yet gets the
  // first-run panel instead of three empty sections.
  if ((cohortsData ?? []).length === 0) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace space-y-6">
        <PageHeader title="Attendance" subtitle={`Take attendance for every ${terms.cohort.toLowerCase()} from one place.`} />
        <ProgramsFirstRun
          kind="cohorts"
          terms={terms}
          addOne={<NewCohortForm />}
          headers={["Date", terms.cohort, terms.session, "Marked"]}
        />
      </div>
    );
  }
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace space-y-8">
      <PageHeader
        title="Attendance"
        subtitle={`Every ${terms.cohort.toLowerCase()}'s ${sessionsWord} on one surface. Open a ${terms.session.toLowerCase()} to take roll on its check-in sheet.`}
      />
      {(membersCapped || marksCapped) && (
        <Alert tone="warning" title="Partial data">
          This org has more attendance records than one page load reads, so some marked counts and rates below are
          incomplete.
        </Alert>
      )}
      <Section
        label="Today"
        rows={today}
        cta
        empty={`No ${sessionsWord} scheduled today`}
      />
      <Section
        label="Upcoming"
        rows={upcoming}
        empty="Nothing scheduled ahead"
        emptyHint={`${terms.sessions} are planned on each ${terms.cohort.toLowerCase()}'s page. Schedule the next one and it shows here.`}
        emptyAction={
          <Link href="/admin/programs/cohorts" className="text-xs font-semibold text-orange hover:text-orange-dark">
            Open {terms.cohorts} →
          </Link>
        }
      />
      <Section
        label="Recent"
        rows={recent}
        empty={`No past ${sessionsWord} yet`}
        showRate
      />
    </div>
  );
}
