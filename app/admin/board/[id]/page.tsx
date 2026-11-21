import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntityHistory } from "@/lib/admin/history";
import PageHeader, { IdentityChip } from "../../_components/PageHeader";
import NextStepBar from "../../_components/ui/NextStepBar";
import Figure, { SummaryStrip } from "../../_components/ui/Figure";
import { memberNextStep } from "@/lib/admin/board/roster";
import { EntityTasks } from "../../_components/EntityTasks";
import { EntityDocuments } from "../../_components/EntityDocuments";
import { CommentThread } from "../../_components/CommentThread";
import { EntityHistory } from "../../_components/EntityHistory";
import { TYPE } from "@/lib/admin/typeScale";
import {
  EditMemberProfile,
  MemberQuickActions,
  OnboardingChecklist,
  type BoardMemberFull,
} from "./_components/MemberProfileControls";
import { ROLE_LABELS } from "./_components/labels";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

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
  const roleGate = await requirePagePermission("board.read", "Board");
  if (!roleGate.ok) return roleGate.page;
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
  const step = memberNextStep(member, year, today);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        breadcrumb={[{ label: "Board", href: "/admin/organization/board" }]}
        title={member.name}
        chips={
          <>
            <IdentityChip>{ROLE_LABELS[member.officer_role] ?? member.officer_role}</IdentityChip>
            {member.status !== "active" ? <IdentityChip>{member.status}</IdentityChip> : null}
            {member.affiliation ? <IdentityChip>{member.affiliation}</IdentityChip> : null}
          </>
        }
        secondaryActions={<MemberQuickActions member={member} coiYear={year} />}
        primaryAction={<EditMemberProfile member={member} />}
        moreActions={[
          { label: "All board members", href: "/admin/organization/board" },
          ...(member.constituent_id ? [{ label: "Open donor record", href: `/admin/fundraising/donors-funders/${member.constituent_id}` }] : []),
        ]}
      />

      <NextStepBar
        title={step.tone === "quiet" && step.text === "Nothing due" ? null : step.text}
        due={termPast ? { text: "Term has ended.", late: true } : undefined}
        meta={step.text === "Nothing due" ? "COI is current and the term is not ending soon." : `Term ${member.term_number}${member.term_end ? `, ends ${fmtDate(member.term_end)}` : ""}.`}
      />

      <SummaryStrip label="Member summary">
        <Figure
          label="Term ends"
          value={member.term_end ? fmtDate(member.term_end) : "No end date"}
          source={`Term ${member.term_number}, from the roster${termPast ? " (ended)" : ""}`}
        />
        <Figure
          label="Conflict of interest"
          value={coiCurrent ? "Current" : member.coi_signed_at ? "Out of date" : "Not on file"}
          source={member.coi_signed_at ? `Signed ${fmtDate(member.coi_signed_at)} (990 Part VI Q12)` : "990 Part VI Q12"}
        />
        <Figure
          label={`Given in ${year}`}
          value={member.constituent_id ? fmtUsd(ytd) : null}
          source={member.constituent_id ? `${fmtUsd(lifetime)} lifetime, from the linked donor record` : "Not linked to a donor record"}
        />
        <Figure
          label="Attendance"
          value={recorded.length > 0 ? `${attended.length} of ${recorded.length}` : null}
          source="Meetings where attendance was taken"
        />
      </SummaryStrip>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-5 bg-tile border-hairline rounded-panel-lg p-5 space-y-3 self-start">
          <h2 className={`${TYPE.cardTitle} mb-1`}>Profile</h2>
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
                  href={`/admin/fundraising/donors-funders/${member.constituent_id}`}
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
            <p className="text-xs text-ink-2 border-t border-hairline pt-3 whitespace-pre-wrap">{member.bio}</p>
          )}
          {member.notes && (
            <p className="text-xs text-ink-2 border-t border-hairline pt-3 whitespace-pre-wrap">{member.notes}</p>
          )}
          <div className="border-t border-hairline pt-3">
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

          <section className="bg-tile border-hairline rounded-panel-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-hairline">
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
                        className={`text-xs font-semibold ${
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
            <section className="bg-tile border-hairline rounded-panel-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-hairline">
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
