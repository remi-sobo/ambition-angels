import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PageHeader from "../_components/PageHeader";
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
  const [membersRes, meetingsRes] = await Promise.all([
    supabase
      .from("board_members")
      .select("*")
      .order("status")
      .order("name")
      .limit(100),
    supabase
      .from("board_meetings")
      .select("*")
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
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-2">
          Members
        </h2>
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
            <p className="text-sm text-gray-mid">
              No board members yet — add your directors with their terms and emails (an email that
              matches a donor record links giving status automatically).
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70">
            Meetings
          </h2>
          <NewMeetingForm />
        </div>
        <div className="space-y-3">
          {meetings.map((mt) => (
            <MeetingCard key={mt.id} meeting={mt} members={active} />
          ))}
          {meetings.length === 0 && (
            <p className="text-sm text-gray-mid">
              No meetings yet — create one to build the agenda, take attendance with a quorum
              check, and keep minutes that freeze on approval.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
