import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import SectionHeading from "../_components/SectionHeading";
import PageHeader from "../_components/PageHeader";
import { EntityDocuments } from "../_components/EntityDocuments";
import StatCard from "../_components/StatCard";
import {
  MemberRow,
  NewMemberForm,
  MeetingCard,
  NewMeetingForm,
  type BoardMember,
  type BoardMeeting,
} from "./_components/BoardControls";

// Board governance (Ring 4, modules/07-governance.md): the lifecycle pieces
// affordable portals skip — terms with expiry alerts, annual COI status
// (Form 990 Part VI Q12), board giving via real gifts, and meetings with
// quorum-checked attendance and approve-then-freeze minutes.
export const dynamic = "force-dynamic";

export default async function BoardPage() {
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
    const { data: gifts } = await supabase
      .from("gifts")
      .select("constituent_id")
      .eq("org_id", orgId)
      .in("constituent_id", linked)
      .gte("gift_date", `${year}-01-01`)
      .limit(2000);
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

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Board"
        subtitle="Terms, conflict-of-interest, board giving, meetings & minutes"
        actions={<NewMemberForm />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Active members" value={active.length} />
        <StatCard
          label="Board giving"
          value={`${gaveCount}/${active.length}`}
          sub={
            active.length > 0 && gaveCount === active.length
              ? "100% participation ✓"
              : `gave in ${year}`
          }
        />
        <StatCard
          label="COI current"
          value={`${coiCurrent}/${active.length}`}
          sub="990 Part VI Q12"
          muted={coiCurrent === active.length}
        />
        <StatCard
          label="Terms expiring"
          value={expiring}
          sub="next 180 days"
          muted={expiring === 0}
        />
      </div>

      <section className="mb-10">
        <SectionHeading className="mb-2">
          Members
        </SectionHeading>
        <div className="space-y-2">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              gaveThisYear={!!m.constituent_id && gaveSet.has(m.constituent_id)}
              coiYear={year}
            />
          ))}
          {members.length === 0 && (
            <p className="text-sm text-ink-2">
              No board members yet — add your directors with their terms and emails (an email that
              matches a donor record links giving status automatically).
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <SectionHeading>
            Meetings
          </SectionHeading>
          <NewMeetingForm />
        </div>
        <div className="space-y-3">
          {meetings.map((mt) => (
            <MeetingCard key={mt.id} meeting={mt} members={active} />
          ))}
          {meetings.length === 0 && (
            <p className="text-sm text-ink-2">
              No meetings yet — create one to build the agenda, take attendance with a quorum
              check, and keep minutes that freeze on approval.
            </p>
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
            {`Documents — ${meetings[0].title || "latest meeting"} (${meetings[0].meeting_date})`}
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
