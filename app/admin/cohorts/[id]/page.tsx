import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PageHeader, { IdentityChip } from "../../_components/PageHeader";
import DataTable, { type DataTableColumn } from "../../_components/ui/DataTable";
import Figure, { SummaryStrip } from "../../_components/ui/Figure";
import NextStepBar from "../../_components/ui/NextStepBar";
import Timeline, { TimelineChip, type TimelineEntry } from "../../_components/ui/Timeline";
import Notice from "../../_components/ui/Notice";
import { ButtonLink } from "../../_components/ui/Button";
import {
  CohortHeaderControls,
  MemberRow,
  AddMemberForm,
  NewSessionForm,
  SessionActions,
  type MemberView,
} from "./_components/CohortDetailControls";
import { dosageFor, pct, REGULAR_ATTENDEE_THRESHOLD, type MarkLite } from "../_lib/rollups";
import { COHORT_STATUS_LABELS } from "../_lib/constants";
import { EntityTasks } from "../../_components/EntityTasks";
import { EntityDocuments } from "../../_components/EntityDocuments";
import { getProgramTerms } from "@/lib/admin/terminology";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getActiveOrgMembers } from "@/lib/admin/owners-server";
import OwnerChip from "../../_components/OwnerChip";
import { todayInTZ } from "@/lib/admin/ops/week";
import { parseTableState } from "@/lib/admin/dataTable";
import {
  ROSTER_TABLE,
  buildRosterRows,
  pageRoster,
  pctText,
  rosterSummary,
  shortDate,
  type ParticipantLite,
  type RosterRow,
  type SessionLite,
} from "@/lib/admin/program/roster";
import { cohortNextStep, sessionWaiting } from "@/lib/admin/program/cohortDetail";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

// Cohort record (V4 Stage E, the Detail archetype; Roster.dc.html): a
// breadcrumb, a header with the owner chip and one primary action (take
// attendance), a next-step bar, a summary strip whose rate says where it came
// from, the roster on DataTable v2, and the sessions as one timeline.
// Served at /admin/programs/cohorts/[id] (the B2 host re-exports this file).
export const dynamic = "force-dynamic";

const num = "[font-variant-numeric:tabular-nums]";

const CAL = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="2" y="3" width="12" height="11" rx="2" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </svg>
);

export default async function CohortPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const roleGate = await requirePagePermission("program.read", "Programs");
  if (!roleGate.ok) return roleGate.page;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS. Scope the cohort read to
  // the caller's org so a foreign cohort id reads as not-found (was an IDOR),
  // and every child read is org-scoped so no other tenant's rows leak in.
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const orgId = ctx.orgId;
  const [orgMembers, canWrite, terms] = await Promise.all([
    getActiveOrgMembers(),
    ctxHasPermission(ctx, "program.write"),
    getProgramTerms(),
  ]);

  const { data: cohort } = await supabase.from("cohorts").select("*").eq("org_id", orgId).eq("id", params.id).maybeSingle();
  if (!cohort) notFound();

  const [{ data: membersData }, { data: sessionsData }, { data: studentsData }] = await Promise.all([
    supabase
      .from("cohort_members")
      .select("id, student_id, status, students(id, first_name, last_name, email, custom_fields)")
      .eq("org_id", orgId)
      .eq("cohort_id", params.id),
    supabase.from("cohort_sessions").select("*").eq("org_id", orgId).eq("cohort_id", params.id).order("session_date"),
    supabase.from("students").select("id, first_name, last_name, custom_fields, stage").eq("org_id", orgId).order("first_name"),
  ]);
  const members = membersData ?? [];
  const sessions = (sessionsData ?? []) as (SessionLite & {
    title: string | null;
    starts_at: string | null;
    ends_at: string | null;
    location: string | null;
  })[];
  const sessionIds = sessions.map((s) => s.id);

  // Paged past PostgREST's 1,000-row cap: a long cohort passes 1,000 marks.
  const { data: marksData, truncated: marksCapped } = sessionIds.length
    ? await fetchAll<MarkLite>(
        () => supabase.from("attendance").select("session_id, student_id, status").eq("org_id", orgId).in("session_id", sessionIds),
        { order: ["id"] },
      )
    : { data: [], truncated: false };
  const marks = (marksData ?? []) as MarkLite[];
  const today = todayInTZ();

  // The roster: enrolled members, with this cohort's rates only.
  const participants = members
    .filter((m) => m.status === "enrolled")
    .map((m) => m.students as unknown as ParticipantLite | null)
    .filter((p): p is ParticipantLite => !!p);
  const rows = buildRosterRows(
    {
      participants,
      memberships: members.map((m) => ({ cohort_id: params.id, student_id: m.student_id, status: m.status })),
      cohorts: [{ id: cohort.id, name: cohort.name, status: cohort.status === "archived" ? "active" : cohort.status === "completed" ? "active" : cohort.status }],
      sessions: sessions.map((s) => ({ id: s.id, cohort_id: params.id, session_date: s.session_date, status: s.status })),
      marks,
    },
    today,
  );
  const state = parseTableState(searchParams ?? {}, ROSTER_TABLE);
  const page = pageRoster(rows, state, ROSTER_TABLE);
  const summary = rosterSummary(rows);
  const held = sessions.filter((s) => s.status === "held");

  // Member management (status changes, remove) keeps the existing controls.
  const memberViews: MemberView[] = members
    .map((m) => {
      const s = m.students as unknown as { first_name: string; last_name: string | null; custom_fields: Record<string, unknown> | null } | null;
      const d = dosageFor(m.student_id, sessions, marks);
      return {
        memberId: m.id,
        studentId: m.student_id,
        name: s ? [s.first_name, s.last_name].filter(Boolean).join(" ") : "Unknown",
        grade: (s?.custom_fields?.grade as string | undefined) ?? null,
        status: m.status,
        attended: d.attended,
        absent: d.absent,
        rateText: pct(d.rate),
        consecutiveAbsences: d.consecutiveAbsences,
        regular: d.rate !== null && d.rate >= REGULAR_ATTENDEE_THRESHOLD,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const memberIds = new Set(members.map((m) => m.student_id));
  const candidates = (studentsData ?? [])
    .filter((s) => !memberIds.has(s.id) && s.stage !== "withdrawn")
    .map((s) => {
      const grade = (s.custom_fields as Record<string, unknown> | null)?.grade as string | undefined;
      return { id: s.id, label: [s.first_name, s.last_name].filter(Boolean).join(" ") + (grade ? ` (Grade ${grade})` : "") };
    });

  const markCount = (sid: string) => {
    const ms = marks.filter((m) => m.session_id === sid);
    return { marked: ms.length, here: ms.filter((m) => m.status === "present" || m.status === "late").length };
  };
  const step = cohortNextStep({
    enrolled: rows.length,
    sessions: sessions.map((s) => ({ ...s, ...markCount(s.id) })),
    today,
  });
  const takeHref = step.sessionId ? `/admin/programs/cohorts/${cohort.id}/sessions/${step.sessionId}` : null;
  const sessionWord = terms.session.toLowerCase();

  const columns: DataTableColumn<RosterRow>[] = [
    {
      key: "name",
      header: terms.student,
      card: "title",
      render: (r) => (
        <>
          <Link href={`/admin/programs/people/${r.id}`} className="font-semibold text-ink-1 hover:text-orange">
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
            <span className={`block text-xs ${r.consecutiveAbsences >= 2 ? "text-status-critical-text font-semibold" : "text-ink-2"}`}>
              {r.consecutiveAbsences >= 2 ? `Missed last ${r.consecutiveAbsences}` : `${r.attended} of ${r.counted} attended`}
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

  const entries: TimelineEntry[] = [...sessions]
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .map((s) => {
      const mc = markCount(s.id);
      const waiting = sessionWaiting(s, today);
      const href = `/admin/programs/cohorts/${cohort.id}/sessions/${s.id}`;
      const time = s.starts_at ? `${String(s.starts_at).slice(0, 5)}–${String(s.ends_at ?? "").slice(0, 5)}` : null;
      return {
        id: s.id,
        kind: s.status,
        icon: CAL,
        title: s.title || terms.session,
        chips: (
          <TimelineChip tone={s.status === "held" ? "success" : "neutral"}>
            {s.status === "held" ? "Held" : s.status === "canceled" ? "Canceled" : s.session_date === today ? "Today" : "Scheduled"}
          </TimelineChip>
        ),
        meta: (
          <>
            {[time, s.location].filter(Boolean).join(" · ")}
            {mc.marked > 0 ? (
              <span>
                {time || s.location ? " · " : ""}
                {mc.here} of {mc.marked} here
              </span>
            ) : waiting ? (
              <span className="text-status-critical-text font-semibold">{time || s.location ? " · " : ""}Attendance not taken</span>
            ) : null}
          </>
        ),
        actions:
          s.status === "canceled" ? (
            canWrite ? <SessionActions session={s} /> : undefined
          ) : (
            <>
              <Link href={href} className="px-2 py-1 rounded-control text-xs font-semibold text-orange hover:bg-tile">
                {mc.marked > 0 ? "Attendance" : "Take attendance"}
              </Link>
              {canWrite ? <SessionActions session={s} /> : null}
            </>
          ),
        date: shortDate(s.session_date).replace(/^\w+, /, ""),
        dateTime: s.session_date,
      };
    });

  const owner = (cohort.owner_id as string | null | undefined) ?? null;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        breadcrumb={[{ label: terms.cohorts, href: "/admin/programs/cohorts" }, { label: cohort.name }]}
        title={cohort.name}
        subtitle={
          [cohort.program, cohort.term, cohort.location].filter(Boolean).join(" · ") +
          (cohort.start_date ? ` · ${cohort.start_date}${cohort.end_date ? ` to ${cohort.end_date}` : ""}` : "")
        }
        chips={
          <>
            <IdentityChip>{COHORT_STATUS_LABELS[cohort.status] ?? cohort.status}</IdentityChip>
            <OwnerChip entity="cohorts" id={cohort.id} ownerId={owner} members={orgMembers} meId={ctx.userId} canEdit={canWrite} />
          </>
        }
        primaryAction={takeHref ? <ButtonLink href={takeHref} variant="primary">Take attendance</ButtonLink> : undefined}
        secondaryActions={
          canWrite ? (
            <CohortHeaderControls
              cohortId={cohort.id}
              status={cohort.status}
              name={cohort.name}
              acceptingApplications={Boolean(cohort.accepting_applications)}
            />
          ) : undefined
        }
        moreActions={[
          { label: `Add people from the roster`, href: "/admin/programs/people?view=unenrolled" },
          { label: "Import a roster file into this cohort", href: `/admin/settings/imports/csv?cohort=${cohort.id}` },
        ]}
      />

      {marksCapped ? (
        <Notice tone="warning" title="Partial data">
          This {terms.cohort.toLowerCase()} has more attendance marks than one page load reads, so rates below are incomplete.
        </Notice>
      ) : null}

      <NextStepBar
        title={step.title}
        due={step.due}
        meta={step.meta}
        actions={
          step.action === "attendance" && takeHref
            ? [<ButtonLink key="go" href={takeHref} variant="strong">Open roster</ButtonLink>]
            : step.action === "people"
              ? [<ButtonLink key="go" href="/admin/programs/people?view=unenrolled" variant="strong">Add people</ButtonLink>]
              : undefined
        }
      />

      <SummaryStrip label={`Summary for this ${terms.cohort.toLowerCase()}`}>
        <Figure
          label="Enrolled"
          value={rows.length}
          compare={cohort.capacity ? `of ${cohort.capacity}` : undefined}
          source={`${rows.length} on the roster, as of now`}
        />
        <Figure
          label="Attendance rate"
          value={pctText(summary.rate)}
          source={
            summary.counted > 0
              ? `${summary.attended} of ${summary.counted} check-ins at ${held.length} held ${held.length === 1 ? sessionWord : terms.sessions.toLowerCase()}, from session records`
              : `Shows once a ${sessionWord} is marked`
          }
        />
        <Figure
          label="Missed twice in a row"
          value={summary.missedTwice}
          source="Absent at both of the last two held sessions"
        />
        <Figure
          label={`Next ${sessionWord}`}
          value={step.nextDate ? shortDate(step.nextDate) : null}
          source={step.nextDate ? (rows.length > 0 ? "Roster ready" : "No one enrolled yet") : `None scheduled. Add one below.`}
        />
      </SummaryStrip>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
        <div className="min-w-0 space-y-4">
          <DataTable
            label={`${cohort.name} roster`}
            noun={{ one: terms.student.toLowerCase(), many: terms.students.toLowerCase() }}
            columns={columns}
            nextStep={{
              header: "Next step",
              render: (r) => (
                <span className={r.next.tone === "late" ? "text-status-critical-text font-semibold" : "text-ink-1"}>{r.next.text}</span>
              ),
            }}
            data={page}
            getRowId={(r) => r.id}
            getRowLabel={(r) => r.name}
            spec={ROSTER_TABLE}
            state={state}
            baseHref={`/admin/programs/cohorts/${cohort.id}`}
            empty={
              <p className="p-8 text-sm text-ink-2">
                No one is enrolled yet.{" "}
                <Link href="/admin/programs/people?view=unenrolled" className="font-semibold text-orange hover:text-orange-dark">
                  Select people on the roster
                </Link>{" "}
                and choose Enroll in {terms.cohort.toLowerCase()}, or add one below.
              </p>
            }
          />
          {canWrite ? (
            <details className="bg-surface border border-hairline rounded-panel px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink-1 min-h-[32px] flex items-center">
                Manage members ({memberViews.length}): add one, mark finished or dropped, remove
              </summary>
              <div className="mt-3 space-y-2">
                <AddMemberForm cohortId={cohort.id} candidates={candidates} />
                {memberViews.map((m) => (
                  <MemberRow key={m.memberId} cohortId={cohort.id} member={m} />
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          <Timeline
            title={terms.sessions}
            entries={entries}
            filters={[
              { key: "all", label: "All" },
              { key: "scheduled", label: "Scheduled" },
              { key: "held", label: "Held" },
            ]}
            composer={canWrite ? <NewSessionForm cohortId={cohort.id} /> : undefined}
            emptyText={`No ${terms.sessions.toLowerCase()} scheduled yet.`}
          />
          <EntityTasks entityType="cohort" entityId={cohort.id} entityLabel={cohort.name} defaultCategory="program" />
          <EntityDocuments entityType="cohort" entityId={cohort.id} entityLabel={cohort.name} />
        </div>
      </div>
    </div>
  );
}
