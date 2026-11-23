import Link from "next/link";
import EmptyState from "../_components/EmptyState";
import PageHeader from "../_components/PageHeader";
import DataTable, { type DataTableColumn } from "../_components/ui/DataTable";
import SavedViews from "../_components/ui/SavedViews";
import Figure, { SummaryStrip } from "../_components/ui/Figure";
import Notice from "../_components/ui/Notice";
import { NewStudentForm } from "./_components/StudentControls";
import RosterFilterRow from "./_components/RosterFilterRow";
import { ProgramsFirstRun } from "../programs/_components/ProgramsFirstRun";
import { getParticipantStages } from "@/lib/admin/program/stages";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getFieldDefs } from "@/lib/admin/customFields";
import { getProgramTerms, getTermLabel } from "@/lib/admin/terminology";
import { todayInTZ } from "@/lib/admin/ops/week";
import { parseTableState, type DataTableBulkAction } from "@/lib/admin/dataTable";
import {
  ROSTER_TABLE,
  ROSTER_VIEWS,
  filterRoster,
  pageRoster,
  parseRosterFilters,
  pctText,
  rosterFilterParams,
  rosterHref,
  rosterSummary,
  shortDate,
  type RosterRow,
} from "@/lib/admin/program/roster";
import { loadRoster } from "@/lib/admin/program/roster-server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

// The participant roster (V4 Stage E, Roster.dc.html; the List archetype on
// DataTable v2). One list of everyone in the org's programs: cohort,
// attendance rate, last attended, next step. Views, search and the cohort
// filter live in the URL; "My cohorts" is everyone enrolled in a cohort I
// own. Bulk "Enroll in cohort…" goes through /api/admin/programs/enroll.
// The person record (/admin/programs/people/[id]) keeps stage and field
// edits. Served at /admin/programs/people (the B2 host re-exports this file).
export const dynamic = "force-dynamic";

const BASE = "/admin/programs/people";
const num = "[font-variant-numeric:tabular-nums]";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const roleGate = await requirePagePermission("program.read", "Students");
  if (!roleGate.ok) return roleGate.page;
  const ctx = await getOrgContext();
  const terms = await getProgramTerms();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title={terms.students} subtitle="Sign in to view the roster." />
      </div>
    );
  }
  const raw = searchParams ?? {};
  const filters = parseRosterFilters(raw);
  const state = parseTableState(raw, ROSTER_TABLE);
  const today = todayInTZ();
  const supabase = getSupabaseAdmin();
  const [data, stages, customFieldDefs, volunteerTerm, canWrite, { data: leaderRows }] = await Promise.all([
    loadRoster(ctx.orgId, today),
    getParticipantStages(),
    getFieldDefs(ctx.orgId, "student"),
    getTermLabel("volunteer", "Volunteer"),
    ctxHasPermission(ctx, "program.write"),
    // Volunteer-flagged constituents feed the add form's leader picker.
    supabase
      .from("constituents")
      .select("id, first_name, last_name, org_name")
      .eq("org_id", ctx.orgId)
      .eq("is_volunteer", true)
      .is("archived_at", null)
      .order("last_name", { ascending: true, nullsFirst: false })
      .limit(200),
  ]);
  const leaders = ((leaderRows ?? []) as { id: string; first_name: string | null; last_name: string | null; org_name: string | null }[]).map(
    (l) => ({ id: l.id, name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.org_name || "(no name)" }),
  );
  const stageOptions = stages.map((s) => ({ stage_key: s.stage_key, label: s.label, terminal: s.terminal, description: s.description }));
  const addForm = (
    <NewStudentForm customFieldDefs={customFieldDefs} stages={stageOptions} term={terms.student} leaders={leaders} volunteerTerm={volunteerTerm} />
  );

  const liveCohorts = data.cohorts
    .filter((c) => c.status === "planning" || c.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
  const myCohortIds = new Set(data.cohorts.filter((c) => c.owner_id === ctx.userId).map((c) => c.id));
  const inView = filterRoster(data.rows, filters, myCohortIds);
  const page = pageRoster(inView, state, ROSTER_TABLE, data.error);
  const summary = rosterSummary(inView);
  const linkFilters = rosterFilterParams(filters);
  const firstRun = data.rows.length === 0 && !data.error;
  const peopleWord = terms.students.toLowerCase();
  const cohortWord = terms.cohort.toLowerCase();

  const bulkActions: DataTableBulkAction[] =
    canWrite && liveCohorts.length > 0
      ? [
          {
            kind: "choose",
            key: "enroll",
            label: `Enroll in ${cohortWord}…`,
            url: "/api/admin/programs/enroll",
            field: "cohort_id",
            options: liveCohorts.map((c) => ({ value: c.id, label: c.name })),
            success: "Enrolled in {label}",
          },
        ]
      : [];

  const columns: DataTableColumn<RosterRow>[] = [
    {
      key: "name",
      header: terms.student,
      card: "title",
      render: (r) => (
        <>
          <Link href={`${BASE}/${r.id}`} className="font-semibold text-ink-1 hover:text-orange transition-colors">
            {r.name}
          </Link>
          <span className="block text-xs text-ink-2">
            {r.grade ? `Grade ${r.grade}` : "No grade"} ·{" "}
            <span className={r.hasGuardian ? "" : "text-status-watch-text font-semibold"}>
              {r.hasGuardian ? "Guardian on file" : "No guardian on file"}
            </span>
          </span>
        </>
      ),
    },
    {
      key: "cohort",
      header: terms.cohort,
      className: "text-ink-2",
      render: (r) =>
        r.cohorts.length === 0 ? (
          <span className="text-ink-3">Not in a {cohortWord}</span>
        ) : (
          r.cohorts.map((c, i) => (
            <span key={c.id}>
              {i > 0 ? ", " : ""}
              <Link href={`/admin/programs/cohorts/${c.id}`} className="hover:text-orange">
                {c.name}
              </Link>
            </span>
          ))
        ),
    },
    {
      key: "rate",
      header: "Attendance",
      align: "right",
      className: num,
      render: (r) =>
        r.rate === null ? (
          <span className="text-ink-3">No marks yet</span>
        ) : (
          <>
            <span className="font-semibold text-ink-1">{pctText(r.rate)}</span>
            <span className="block text-xs text-ink-2">
              {r.attended} of {r.counted}
            </span>
          </>
        ),
    },
    {
      key: "last",
      header: "Last attended",
      className: `text-ink-2 ${num}`,
      render: (r) => (r.lastAttended ? shortDate(r.lastAttended) : <span className="text-ink-3">Not yet</span>),
    },
  ];

  const views = ROSTER_VIEWS.map((v) => ({
    key: v.key,
    label: v.label,
    mine: v.mine,
    href: rosterHref(BASE, { ...filters, view: v.key }),
  }));

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        title={terms.students}
        subtitle={`Everyone in your ${terms.programs.toLowerCase()}: ${terms.cohort.toLowerCase()}, attendance and what to do next`}
        primaryAction={canWrite ? addForm : undefined}
        moreActions={[
          { label: "Import a roster file", href: "/admin/settings/imports/csv" },
          { label: `See all ${terms.cohorts.toLowerCase()}`, href: "/admin/programs/cohorts" },
          { label: "Take attendance", href: "/admin/programs/attendance" },
        ]}
      />

      {!firstRun ? <SavedViews views={views} activeKey={filters.view} label="Saved views" /> : null}
      <div className="mt-3">
        <RosterFilterRow
          q={filters.q}
          cohort={filters.cohort}
          view={filters.view}
          cohorts={liveCohorts.map((c) => ({ id: c.id, name: c.name }))}
          disabled={firstRun}
          disabledNote={`Search, filters and saved views turn on once you have ${peopleWord}.`}
        />
      </div>

      {data.partial ? (
        <Notice tone="warning" title="Partial data">
          This organization has more records than one page load reads, so some rates below are incomplete.
        </Notice>
      ) : null}

      <SummaryStrip label="Summary for this view">
        <Figure
          label={terms.students}
          value={firstRun ? "None yet" : summary.people}
          source={firstRun ? "Import or add your first" : `In this view, as of now`}
        />
        <Figure
          label="Attendance rate"
          value={firstRun ? "No sessions yet" : pctText(summary.rate)}
          source={
            summary.counted > 0
              ? `${summary.attended} of ${summary.counted} check-ins, from session records`
              : "Shows once a session is marked"
          }
        />
        <Figure
          label="Missed twice in a row"
          value={firstRun ? "Nothing to follow up" : summary.missedTwice}
          source="Last two held sessions, absent both times"
          compareTone="danger"
        />
        <Figure
          label={`Not in a ${cohortWord}`}
          value={firstRun ? "None yet" : summary.unenrolled}
          source={liveCohorts.length === 0 ? `Create a ${cohortWord} to enroll people` : `Select them below to enroll`}
          href={!firstRun && summary.unenrolled > 0 ? rosterHref(BASE, { ...filters, view: "unenrolled" }) : undefined}
        />
      </SummaryStrip>

      {!firstRun && liveCohorts.length === 0 ? (
        <div className="mb-4">
          <Notice tone="info" title={`No ${terms.cohorts.toLowerCase()} yet`}>
            Create your first {cohortWord} on the{" "}
            <Link href="/admin/programs/cohorts" className="font-semibold underline underline-offset-2">
              {terms.cohorts} tab
            </Link>
            , then select people here and choose Enroll in {cohortWord}.
          </Notice>
        </div>
      ) : null}

      {firstRun ? (
        <ProgramsFirstRun
          kind="people"
          terms={terms}
          addOne={canWrite ? addForm : null}
          orgName={ctx.orgName}
          headers={[terms.student, terms.cohort, "Attendance", "Last attended", "Next step"]}
        />
      ) : filters.view === "mine" && inView.length === 0 && !filters.q && !filters.cohort ? (
        <EmptyState
          label={`${peopleWord} in your ${terms.cohorts.toLowerCase()}`}
          hint={`People enrolled in ${terms.cohorts.toLowerCase()} you own show up here. Open a ${cohortWord} and set yourself as owner, or see everyone.`}
          action={
            <Link href={BASE} className="text-xs font-semibold text-orange hover:text-orange-dark">
              See everyone →
            </Link>
          }
        />
      ) : (
        <DataTable
          label={`${terms.students} roster`}
          noun={{ one: terms.student.toLowerCase(), many: peopleWord }}
          columns={columns}
          nextStep={{
            header: "Next step",
            render: (r) => (
              <span
                className={
                  r.next.tone === "late" ? "text-status-critical-text font-semibold" : r.next.tone === "due" ? "text-ink-1" : "text-ink-2"
                }
              >
                {r.next.text}
              </span>
            ),
          }}
          data={page}
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.name}
          spec={ROSTER_TABLE}
          state={state}
          baseHref={BASE}
          filters={linkFilters}
          bulkActions={bulkActions}
          emptyMessage={`No ${peopleWord} match this view.`}
        />
      )}

      <p className="text-xs text-ink-3 px-1 mt-4 leading-relaxed max-w-4xl">
        <span className="font-semibold text-ink-2">Where this comes from:</span> attendance is present plus late out of
        every marked check-in at held sessions of the {terms.cohorts.toLowerCase()} a person is in now. Excused and
        unmarked days count against no one. Missing is shown as &quot;No marks yet&quot;, never 0%. Have a list?{" "}
        <Link href="/admin/settings/imports/csv" className="font-semibold text-orange hover:text-orange-dark">
          Import a roster file
        </Link>{" "}
        with a {cohortWord} column.
      </p>
    </div>
  );
}
