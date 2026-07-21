import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntityHistory } from "@/lib/admin/history";
import StatCard from "../../_components/StatCard";
import { EntityTasks } from "../../_components/EntityTasks";
import { EntityDocuments } from "../../_components/EntityDocuments";
import { CommentThread } from "../../_components/CommentThread";
import { EntityHistory } from "../../_components/EntityHistory";
import { TYPE } from "@/lib/admin/typeScale";
import {
  EditMemberProfile,
  MemberQuickActions,
  OnboardingChecklist,
  ROLE_LABELS,
  type BoardMemberFull,
} from "./_components/MemberProfileControls";

// Board member profile (governance profile views): the full record behind a
// roster row — identity + terms + COI, attendance derived from meeting
// records, giving through the constituent link, onboarding checklist, and
// the standard record panels (tasks, documents, comments, history).
export const dynamic = "force-dynamic";

const fmtDate = (s: string) =>
  new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function BoardMemberPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS — scope every read to the
  // caller's org (a foreign id must 404, not leak).
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const orgId = ctx.orgId;

  const [memberRes, meetingsRes, history] = await Promise.all([
    supabase.from("board_members").select("*").eq("org_id", orgId).eq("id", params.id).maybeSingle(),
    supabase
      .from("board_meetings")
      .select("id, meeting_date, title, attendance")
      .eq("org_id", orgId)
      .order("meeting_date", { ascending: false })
      .limit(50),
    getEntityHistory(orgId, "board_member", params.id),
  ]);
  if (!memberRes.data) notFound();
  const member = memberRes.data as BoardMemberFull;
  const meetings = (meetingsRes.data ?? []) as Array<{
    id: string;
    meeting_date: string;
    title: string;
    attendance: Array<{ member_id: string; present: boolean }>;
  }>;

  // Attendance, derived from meeting records: only meetings that took
  // attendance count; a member missing from a recorded roster reads absent.
  const recorded = meetings.filter((m) => m.attendance.length > 0);
  const attended = recorded.filter((m) =>
    m.attendance.some((a) => a.member_id === member.id && a.present)
  );

  // Giving through the constituent link — real gifts, same source as the
  // board page's participation stat.
  let gifts: Array<{ amount: number; gift_date: string }> = [];
  if (member.constituent_id) {
    const { data } = await supabase
      .from("gifts")
      .select("amount, gift_date")
      .eq("org_id", orgId)
      .eq("constituent_id", member.constituent_id)
      .order("gift_date", { ascending: false })
      .limit(500);
    gifts = ((data ?? []) as Array<{ amount: unknown; gift_date: string }>).map((g) => ({
      amount: Number(g.amount) || 0,
      gift_date: g.gift_date,
    }));
  }
  const year = new Date().getUTCFullYear();
  const ytd = gifts.filter((g) => g.gift_date >= `${year}-01-01`).reduce((s, g) => s + g.amount, 0);
  const lifetime = gifts.reduce((s, g) => s + g.amount, 0);

  const today = new Date().toISOString().slice(0, 10);
  const coiCurrent = !!member.coi_signed_at && member.coi_signed_at >= `${year}-01-01`;
  const termPast = !!member.term_end && member.term_end < today;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <Link href="/admin/board" className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors">
          ← Board
        </Link>
        <h1 className={`${TYPE.pageTitle} !text-lg`}>{member.name}</h1>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 uppercase tracking-wider">
          {ROLE_LABELS[member.officer_role] ?? member.officer_role}
        </span>
        {member.status !== "active" && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-tile text-ink-2">{member.status}</span>
        )}
        <div className="ml-auto">
          <MemberQuickActions member={member} coiYear={year} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Term"
          value={member.term_end ? fmtDate(member.term_end) : "—"}
          sub={`term ${member.term_number}${termPast ? " · expired" : ""}`}
          muted={!member.term_end}
        />
        <StatCard
          label="COI"
          value={coiCurrent ? "Current" : member.coi_signed_at ? "Stale" : "Missing"}
          sub={member.coi_signed_at ? `signed ${fmtDate(member.coi_signed_at)}` : "990 Part VI Q12"}
          muted={coiCurrent}
        />
        <StatCard
          label="Giving"
          value={member.constituent_id ? fmtUsd(ytd) : "—"}
          sub={member.constituent_id ? `this year · ${fmtUsd(lifetime)} lifetime` : "not linked to a donor"}
          muted={!member.constituent_id}
        />
        <StatCard
          label="Attendance"
          value={recorded.length > 0 ? `${attended.length}/${recorded.length}` : "—"}
          sub="meetings with attendance"
          muted={recorded.length === 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-5 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-3 self-start">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h2 className={TYPE.cardTitle}>Profile</h2>
            <EditMemberProfile member={member} />
          </div>
          {[
            ["Email", member.email ?? "—"],
            ["Phone", member.phone ?? "—"],
            ["Affiliation", member.affiliation ?? "—"],
            ["Term starts", member.term_start ? fmtDate(member.term_start) : "—"],
            ["Donor record", member.constituent_id ? "linked" : "not linked"],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-3 text-xs">
              <span className="text-ink-3 w-24 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">
                {label}
              </span>
              {label === "Donor record" && member.constituent_id ? (
                <Link
                  href={`/admin/fundraising/donors/${member.constituent_id}`}
                  className="text-orange/80 hover:text-orange"
                >
                  open donor profile
                </Link>
              ) : (
                <span className="text-ink-1 break-words min-w-0">{String(value)}</span>
              )}
            </div>
          ))}
          {member.bio && (
            <p className="text-xs text-ink-2 border-t border-outline pt-3 whitespace-pre-wrap">{member.bio}</p>
          )}
          {member.notes && (
            <p className="text-xs text-ink-2 border-t border-outline pt-3 whitespace-pre-wrap">{member.notes}</p>
          )}
          <div className="border-t border-outline pt-3">
            <OnboardingChecklist member={member} />
          </div>
        </section>

        <div className="lg:col-span-7 space-y-4">
          <EntityTasks
            entityType="board_member"
            entityId={member.id}
            entityLabel={member.name}
            defaultCategory="board"
          />
          <EntityDocuments entityType="board_member" entityId={member.id} entityLabel={member.name} />

          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline">
              <h2 className={TYPE.cardTitle}>
                Meetings {recorded.length > 0 && (
                  <span className="text-ink-3 font-normal">· attended {attended.length} of {recorded.length}</span>
                )}
              </h2>
            </div>
            {meetings.length === 0 ? (
              <p className={`p-6 ${TYPE.bodyMuted}`}>No board meetings recorded yet.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {meetings.slice(0, 12).map((m) => {
                  const entry = m.attendance.find((a) => a.member_id === member.id);
                  const took = m.attendance.length > 0;
                  return (
                    <li key={m.id} className="px-5 py-3 text-sm flex items-center gap-4">
                      <span className="text-xs text-ink-2 w-24 flex-shrink-0 tabular-nums">
                        {fmtDate(m.meeting_date)}
                      </span>
                      <span className="text-ink-1 flex-1 min-w-0 truncate">{m.title}</span>
                      <span
                        className={`text-[11px] font-semibold ${
                          !took ? "text-ink-3" : entry?.present ? "text-revenue" : "text-expense"
                        }`}
                      >
                        {!took ? "no attendance taken" : entry?.present ? "present" : "absent"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {member.constituent_id && gifts.length > 0 && (
            <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-outline">
                <h2 className={TYPE.cardTitle}>
                  Giving <span className="text-ink-3 font-normal">· {fmtUsd(lifetime)} lifetime</span>
                </h2>
              </div>
              <ul className="divide-y divide-hairline">
                {gifts.slice(0, 8).map((g, i) => (
                  <li key={i} className="px-5 py-3 text-sm flex items-center gap-4">
                    <span className="text-xs text-ink-2 w-24 flex-shrink-0 tabular-nums">
                      {fmtDate(g.gift_date)}
                    </span>
                    <span className="text-ink-1 tabular-nums">{fmtUsd(g.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <CommentThread entityType="board_member" entityId={member.id} entityLabel={member.name} />
          <EntityHistory events={history} />
        </div>
      </div>
    </div>
  );
}
