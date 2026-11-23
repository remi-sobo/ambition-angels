import { getSupabaseAdmin } from "@/lib/supabase/admin";
import EmptyState from "../_components/EmptyState";
import { getOrgContext } from "@/lib/admin/auth";
import SectionHeading from "../_components/SectionHeading";
import PageHeader from "../_components/PageHeader";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { EntityDocuments } from "../_components/EntityDocuments";
import Link from "next/link";
import DataTable, { type DataTableColumn } from "../_components/ui/DataTable";
import Figure, { SummaryStrip } from "../_components/ui/Figure";
import Badge from "../_components/ui/Badge";
import { ROLE_LABELS, memberNextStep } from "@/lib/admin/board/roster";
import {
  MemberActions,
  NewMemberForm,
  MeetingCard,
  NewMeetingForm,
  type BoardMember,
  type BoardMeeting,
} from "./_components/BoardControls";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

// Board governance (Ring 4, modules/07-governance.md): the lifecycle pieces
// affordable portals skip — terms with expiry alerts, annual COI status
// (Form 990 Part VI Q12), board giving via real gifts, and meetings with
// quorum-checked attendance and approve-then-freeze minutes.
export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const roleGate = await requirePagePermission("board.read", "Board");
  if (!roleGate.ok) return roleGate.page;
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS, so every read is scoped to
  // the active org. No session → empty.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Board" subtitle="Sign in to view your organization's board." />
      </div>
    );
  }
  const orgId = ctx.orgId;
  const [membersRes, meetingsRes] = await Promise.all([
    supabase
      .from("board_members")
      .select("*")
      .eq("org_id", orgId)
      .order("status")
      .order("name")
      .limit(100),
    supabase
      .from("board_meetings")
      .select("*")
      .eq("org_id", orgId)
      .order("meeting_date", { ascending: false })
      .limit(50),
  ]);
  const members = (membersRes.data ?? []) as BoardMember[];
  const meetings = (meetingsRes.data ?? []) as BoardMeeting[];
  const active = members.filter((m) => m.status === "active");

  // Board giving: a member "gave this fiscal year" when their linked
  // constituent has a gift dated in the current calendar year.
  const year = new Date().getUTCFullYear();
  const linked = active.filter((m) => m.constituent_id).map((m) => m.constituent_id as string);
  const gaveSet = new Set<string>();
  if (linked.length > 0) {
    // Paged: `.limit(2000)` is still capped at PostgREST's 1,000 rows, and a
    // member whose gifts fell past the cap would read as not having given.
    const { data: gifts } = await fetchAll<{ constituent_id: string | null }>(
      () =>
        supabase
          .from("gifts")
          .select("constituent_id")
          .eq("org_id", orgId)
          .in("constituent_id", linked)
          .gte("gift_date", `${year}-01-01`),
      { order: ["id"] }
    );
    for (const g of gifts ?? []) if (g.constituent_id) gaveSet.add(g.constituent_id);
  }
  const gaveCount = active.filter(
    (m) => m.constituent_id && gaveSet.has(m.constituent_id)
  ).length;

  const today = new Date().toISOString().slice(0, 10);
  const in180 = new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10);
  const coiCurrent = active.filter(
    (m) => m.coi_signed_at && m.coi_signed_at >= `${year}-01-01`
  ).length;
  const expiring = active.filter(
    (m) => m.term_end && m.term_end >= today && m.term_end <= in180
  ).length;

  const columns: DataTableColumn<BoardMember>[] = [
    {
      key: "name",
      header: "Member",
      card: "title",
      render: (m) => (
        <>
          <Link href={`/admin/organization/board/${m.id}`} className="font-semibold text-ink-1 hover:text-orange transition-colors">
            {m.name}
          </Link>
          <span className="block text-xs text-ink-2">
            {ROLE_LABELS[m.officer_role] ?? m.officer_role}
            {m.status !== "active" ? ` · ${m.status}` : ""}
          </span>
        </>
      ),
    },
    {
      key: "term",
      header: "Term ends",
      className: "tabular-nums",
      render: (m) => {
        if (!m.term_end) return <span className="text-ink-3">No end date</span>;
        const past = m.term_end < today;
        const soon = !past && m.term_end <= in180;
        return (
          <span className={past ? "text-status-critical-text font-semibold" : soon ? "text-status-watch-text" : "text-ink-2"}>
            {m.term_end}
            {past ? " (ended)" : soon ? " (soon)" : ""}
          </span>
        );
      },
    },
    {
      key: "coi",
      header: `COI ${year}`,
      render: (m) =>
        m.coi_signed_at && m.coi_signed_at >= `${year}-01-01` ? (
          <Badge tone="success">Signed</Badge>
        ) : (
          <Badge tone="danger">Not on file</Badge>
        ),
    },
    {
      key: "gave",
      header: `Gave in ${year}`,
      render: (m) =>
        !m.constituent_id ? (
          <span className="text-ink-3">Not linked</span>
        ) : gaveSet.has(m.constituent_id) ? (
          <Badge tone="success">Gave</Badge>
        ) : (
          <span className="text-ink-2">Not yet</span>
        ),
    },
    { key: "actions", header: "Actions", align: "right", render: (m) => <MemberActions member={m} coiYear={year} /> },
  ];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        title="Board"
        subtitle="Terms, conflict of interest, board giving, meetings and minutes"
        primaryAction={<NewMemberForm />}
        moreActions={[
          { label: "Compliance calendar", href: "/admin/organization/compliance" },
          { label: "Board documents", href: "/admin/work/documents?type=board_packet" },
        ]}
      />

      <SummaryStrip label="Board summary">
        <Figure label="Active members" value={membersRes.error ? null : active.length} source="Status active on the roster" />
        <Figure
          label="Board giving"
          value={linked.length === 0 ? null : `${gaveCount} of ${active.length}`}
          source={
            linked.length === 0
              ? "No active member is linked to a donor record yet"
              : `Linked donor records with a gift dated in ${year}${linked.length < active.length ? `; ${active.length - linked.length} not linked` : ""}`
          }
          compare={active.length > 0 && gaveCount === active.length ? "Full participation" : undefined}
          compareTone="default"
        />
        <Figure
          label="Conflict of interest current"
          value={active.length === 0 ? null : `${coiCurrent} of ${active.length}`}
          source={`Signed on or after Jan 1, ${year} (Form 990 Part VI Q12)`}
        />
        <Figure label="Terms ending" value={membersRes.error ? null : expiring} source="Active members, in the next 180 days" />
      </SummaryStrip>

      <section className="mb-10">
        <SectionHeading className="mb-2">Members</SectionHeading>
        {members.length === 0 ? (
          <EmptyState
            label="board members"
            title="No board members yet"
            purpose="Your directors, with their terms, conflict-of-interest forms and board giving in one roster."
            primaryAction={<NewMemberForm />}
            next="An email that matches a donor record links their giving automatically."
          />
        ) : (
          <DataTable
            label="Board members"
            noun={{ one: "member", many: "members" }}
            columns={columns}
            nextStep={{
              header: "Next step",
              render: (m) => {
                const n = memberNextStep(m, year, today);
                return (
                  <span className={n.tone === "late" ? "text-status-critical-text font-semibold" : n.tone === "due" ? "text-ink-1" : "text-ink-2"}>
                    {n.text}
                  </span>
                );
              },
            }}
            data={{ rows: members, total: members.length, page: 0, pageSize: 100, error: membersRes.error ? "The roster could not be read." : null }}
            getRowId={(m) => m.id}
            getRowLabel={(m) => m.name}
            spec={{ sortable: [], defaultSort: null, pageSize: 100 }}
            state={{ page: 0, sort: null }}
            baseHref="/admin/organization/board"
          />
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <SectionHeading>Meetings</SectionHeading>
          <NewMeetingForm />
        </div>
        <div className="space-y-3">
          {meetings.map((mt) => (
            <MeetingCard key={mt.id} meeting={mt} members={active} />
          ))}
          {meetings.length === 0 && (
            <EmptyState
              label="meetings"
              hint="Create one with New meeting to build the agenda, take attendance with a quorum check, and keep minutes that freeze on approval."
            />
          )}
        </div>
      </section>

      {/* Board packet & minutes files for the latest meeting. Documents linked
          to a board_meeting are the ONLY documents a board_viewer can read —
          access is link-scoped by the documents RLS carve-out, never a blanket
          documents.read. */}
      {meetings.length > 0 && (
        <section className="mt-8">
          <SectionHeading className="mb-2">
            {`Documents: ${meetings[0].title || "latest meeting"} (${meetings[0].meeting_date})`}
          </SectionHeading>
          <EntityDocuments
            entityType="board_meeting"
            entityId={meetings[0].id}
            entityLabel={meetings[0].title || "Board meeting"}
          />
        </section>
      )}
    </div>
  );
}
