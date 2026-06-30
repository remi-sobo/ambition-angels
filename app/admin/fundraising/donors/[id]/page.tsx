import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../../finance/_components/charts";
import StatCard from "../../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import { CHANNEL_PAST } from "@/lib/fundraising/ack-channels";
import { analyzeDonor, FLAG_LABELS, FLAG_HELP } from "@/lib/fundraising/retention";
import { scoreDonor, BAND_LABEL, type EngagementBand } from "@/lib/fundraising/engagement";
import { todayISO } from "../../../ops/_types/ops";
import { GiftEntryForm, GiftRowActions } from "../_components/GiftControls";
import { EditDonorButton, LogInteractionForm } from "../_components/ConstituentControls";
import LogThankYou from "../_components/LogThankYou";
import AckChannelPref from "../_components/AckChannelPref";
import { type AckChannel } from "@/lib/fundraising/ack-channels";
import { HouseholdControls } from "../_components/HouseholdControls";
import { AddSoftCredit, SoftCreditChip, SC_TYPE_LABEL } from "../_components/SoftCreditControls";
import EmailActions from "../_components/EmailActions";
import { EntityTasks } from "../../../_components/EntityTasks";
import { CommentThread } from "../../../_components/CommentThread";
import { RailEntity } from "../../../_components/rail/RailEntityContext";
import ConstituentDangerZone from "../_components/ConstituentDangerZone";

// Donor profile + giving timeline (Ring 2 Donors v1).
export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Handles both calendar-day strings (gift_date, length 10) and full
// timestamps (occurred_at / acknowledged_at).
const fmtWhen = (s: string) =>
  new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function DonorProfilePage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const supabase = createServerSupabase();
  const [cRes, giftsRes, plansRes, allDatesRes, interactionsRes, campaignsRes, fundsRes, appealsRes, scReceivedRes, oppsRes] = await Promise.all([
    supabase.from("constituents").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("gifts")
      .select("id, amount, gift_date, method, acknowledgment_status, acknowledged_at, recurring_plan_id, external_source")
      .eq("constituent_id", params.id)
      .order("gift_date", { ascending: false })
      .limit(500),
    supabase
      .from("recurring_plans")
      .select("id, amount, frequency, status")
      .eq("constituent_id", params.id),
    // Full date history (dates only, cheap) — drives the first-gift stat
    // AND retention flags, independent of the timeline's display cap.
    supabase
      .from("gifts")
      .select("gift_date")
      .eq("constituent_id", params.id)
      .order("gift_date", { ascending: true })
      .limit(5000),
    supabase
      .from("interactions")
      .select("id, kind, occurred_at, notes, logged_by, direction, subject, thread_id, body_preview, is_private")
      .eq("constituent_id", params.id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    // Attribution options for manual gift entry (Epic A).
    supabase.from("campaigns").select("id, name").order("created_at", { ascending: false }).limit(100),
    supabase.from("funds").select("id, name").order("name").limit(100),
    supabase.from("appeals").select("id, name").order("name").limit(200),
    // Soft credits this donor *received* (recognition only) — Epic D3.
    supabase.from("soft_credits").select("amount").eq("constituent_id", params.id).limit(5000),
    // Open asks → the "next move" block (Constituent 360 v1).
    supabase
      .from("opportunities")
      .select("id, name, stage, next_step, next_step_due, ask_amount, expected_close")
      .eq("constituent_id", params.id)
      .order("next_step_due", { ascending: true, nullsFirst: false })
      .limit(20),
  ]);

  // Query error = tables not applied yet (same grace state as the list
  // page); a clean miss = real 404.
  if (cRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-ink-1 text-2xl mb-4">Donors</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The fundraising tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_fundraising_core.sql</code> via Actions → Apply DB
          migration, then reload.
        </div>
      </div>
    );
  }
  if (!cRes.data) notFound();
  const c = cRes.data;
  const gifts = ((giftsRes.data ?? []) as Array<{
    id: string; amount: number; gift_date: string; method: string;
    acknowledgment_status: string; acknowledged_at: string | null;
    recurring_plan_id: string | null; external_source: string | null;
  }>).map((g) => ({ ...g, amount: Number(g.amount) }));
  const plans = (plansRes.data ?? []) as Array<{ id: string; amount: number; frequency: string; status: string }>;
  const interactions = (interactionsRes.data ?? []) as Array<{
    id: string; kind: string; occurred_at: string; notes: string | null; logged_by: string | null;
    direction: string | null; subject: string | null; thread_id: string | null;
    body_preview: string | null; is_private: boolean | null;
  }>;
  const opps = (oppsRes.data ?? []) as Array<{
    id: string; name: string | null; stage: string; next_step: string | null;
    next_step_due: string | null; ask_amount: number | null; expected_close: string | null;
  }>;
  // Next move: soonest-due open ask with a next step (Constituent 360 v1).
  const OPEN_STAGES = ["identify", "qualify", "cultivate", "solicit"];
  const openOpps = opps.filter((o) => OPEN_STAGES.includes(o.stage));
  const nextMove =
    openOpps
      .filter((o) => o.next_step)
      .sort((a, b) => (a.next_step_due ?? "9999").localeCompare(b.next_step_due ?? "9999"))[0] ?? null;
  const todayStr = todayISO();
  const campaignOpts = (campaignsRes.data ?? []) as Array<{ id: string; name: string }>;
  const fundOpts = (fundsRes.data ?? []) as Array<{ id: string; name: string }>;
  const appealOpts = (appealsRes.data ?? []) as Array<{ id: string; name: string }>;

  // Soft credits ON this donor's gifts (Epic D2): credited party + type per
  // gift, for the timeline.
  const giftIds = gifts.map((g) => g.id);
  const scByGift = new Map<string, Array<{ id: string; type: string; name: string }>>();
  if (giftIds.length > 0) {
    const { data: scRows } = await supabase
      .from("soft_credits")
      .select("id, gift_id, type, constituent:constituents ( type, first_name, last_name, org_name )")
      .in("gift_id", giftIds)
      .limit(2000);
    for (const sc of (scRows ?? []) as unknown as Array<{
      id: string; gift_id: string; type: string;
      constituent: { type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
    }>) {
      const list = scByGift.get(sc.gift_id) ?? [];
      list.push({ id: sc.id, type: sc.type, name: sc.constituent ? constituentName(sc.constituent) : "Unknown" });
      scByGift.set(sc.gift_id, list);
    }
  }
  // Acknowledgment touches — the stewardship history. Reading the real rows
  // (not just the gift's sent flag) surfaces which channel each thank-you went
  // out on. Two sources: thank-yous for this donor's gifts, and proactive
  // non-gift thank-yous logged straight to the donor (gift_id null).
  const amountByGift = new Map(gifts.map((g) => [g.id, g.amount]));
  const ackEvents: Array<{ channel: string; sent_at: string; amount: number | null }> = [];
  if (giftIds.length > 0) {
    const { data: giftAcks } = await supabase
      .from("acknowledgments")
      .select("gift_id, channel, sent_at")
      .in("gift_id", giftIds)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(500);
    for (const a of (giftAcks ?? []) as Array<{ gift_id: string | null; channel: string | null; sent_at: string | null }>) {
      if (a.gift_id && a.sent_at)
        ackEvents.push({ channel: a.channel ?? "other", sent_at: a.sent_at, amount: amountByGift.get(a.gift_id) ?? null });
    }
  }
  const { data: subjectAcks } = await supabase
    .from("acknowledgments")
    .select("channel, sent_at")
    .eq("subject_type", "constituent")
    .eq("subject_id", params.id)
    .is("gift_id", null)
    .not("sent_at", "is", null)
    .limit(200);
  for (const a of (subjectAcks ?? []) as Array<{ channel: string | null; sent_at: string | null }>) {
    if (a.sent_at) ackEvents.push({ channel: a.channel ?? "other", sent_at: a.sent_at, amount: null });
  }

  // Recognition received = soft credits where this donor is the credited party
  // (Epic D3). Revenue counts only hard-credit gifts; recognition adds these.
  const recognitionReceived = ((scReceivedRes.data ?? []) as Array<{ amount: number }>)
    .reduce((s, r) => s + Number(r.amount), 0);

  const total = gifts.reduce((s, g) => s + g.amount, 0);
  const recognition = total + recognitionReceived;
  const name = constituentName(c);
  const activePlan = plans.find((p) => p.status === "active");
  const allDates = ((allDatesRes.data ?? []) as Array<{ gift_date: string }>).map((g) => g.gift_date);
  const { flags } = analyzeDonor(allDates, todayISO(), Boolean(activePlan));
  const engagement = scoreDonor(allDates, total, Boolean(activePlan), todayISO());
  const ENG_STYLES: Record<EngagementBand, string> = {
    strong: "bg-revenue/15 text-revenue",
    steady: "bg-blue-500/15 text-blue-400",
    at_risk: "bg-[#F4E8D0] text-[#A56A1B]",
    none: "bg-tile text-ink-3 border border-outline",
  };
  const pendingAcks = gifts.filter((g) => g.acknowledgment_status === "pending").length;

  // Funder-research attach: constituents imported from (or matched to)
  // HubSpot carry external_ids.hubspot, which keys the research agent's
  // briefs. Link straight to the brief when one exists; otherwise to the
  // prospect page where the agent can be run.
  const extIds = (c.external_ids ?? {}) as Record<string, unknown>;
  const hubspotId = typeof extIds["hubspot"] === "string" ? (extIds["hubspot"] as string) : null;
  let hasBrief = false;
  if (hubspotId) {
    const { data: brief } = await supabase
      .from("fr_prospect_briefs")
      .select("hubspot_id")
      .eq("hubspot_id", hubspotId)
      .maybeSingle();
    hasBrief = !!brief;
  }

  // ── Household (Epic D1): the donor's household + combined member giving,
  // plus the list of households for the join control. ──
  const { data: householdsList } = await supabase
    .from("households")
    .select("id, name")
    .order("name")
    .limit(500);
  const households = (householdsList ?? []) as Array<{ id: string; name: string }>;
  const householdId = (c.household_id as string | null) ?? null;
  let household:
    | { id: string; name: string; salutation: string | null; total: number; members: Array<{ id: string; name: string; total: number }> }
    | null = null;
  if (householdId) {
    const [hhRes, membersRes] = await Promise.all([
      supabase.from("households").select("name, salutation").eq("id", householdId).maybeSingle(),
      supabase
        .from("constituents")
        .select("id, type, first_name, last_name, org_name")
        .eq("household_id", householdId),
    ]);
    const members = (membersRes.data ?? []) as Array<{
      id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null;
    }>;
    const memberIds = members.map((m) => m.id);
    const totals = new Map<string, number>();
    if (memberIds.length > 0) {
      const { data: hg } = await supabase
        .from("gifts")
        .select("constituent_id, amount")
        .in("constituent_id", memberIds)
        .limit(10000);
      for (const g of (hg ?? []) as Array<{ constituent_id: string | null; amount: number }>) {
        if (g.constituent_id) totals.set(g.constituent_id, (totals.get(g.constituent_id) ?? 0) + Number(g.amount));
      }
    }
    if (hhRes.data) {
      household = {
        id: householdId,
        name: hhRes.data.name as string,
        salutation: (hhRes.data.salutation as string | null) ?? null,
        total: Array.from(totals.values()).reduce((s, v) => s + v, 0),
        members: members.map((m) => ({ id: m.id, name: constituentName(m), total: totals.get(m.id) ?? 0 })),
      };
    }
  }

  // ── Unified activity stream (Epic C): gifts + interactions + thank-yous,
  // newest first. gift_date is a calendar day (anchored at noon so it sorts
  // sanely against the timestamped events); the rest are timestamptz.
  type GiftEv = (typeof gifts)[number];
  type IntEv = (typeof interactions)[number];
  type Activity =
    | { kind: "gift"; sort: number; gift: GiftEv }
    | { kind: "interaction"; sort: number; interaction: IntEv }
    | { kind: "ack"; sort: number; at: string; amount: number | null; channel: string };
  const ms = (s: string) => {
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
  };
  const activity: Activity[] = [
    ...gifts.map((g): Activity => ({ kind: "gift", sort: ms(g.gift_date + "T12:00:00"), gift: g })),
    ...interactions.map((i): Activity => ({ kind: "interaction", sort: ms(i.occurred_at), interaction: i })),
    ...ackEvents.map((a): Activity => ({
      kind: "ack",
      sort: ms(a.sent_at),
      at: a.sent_at,
      amount: a.amount,
      channel: a.channel,
    })),
  ].sort((a, b) => b.sort - a.sort);

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3">
        <Link href="/admin/fundraising/donors" className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors">
          ← Donors
        </Link>
        <span className="font-heading font-bold text-ink-1 text-sm sm:text-base truncate">{name}</span>
        {activePlan && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/20 text-orange">
            Monthly · {money(Number(activePlan.amount))}
          </span>
        )}
        {c.do_not_contact && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense">Do not contact</span>
        )}
        {c.archived_at && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-warm/20 text-ink-2">Archived</span>
        )}
        {engagement.band !== "none" && (
          <span
            title={`Engagement ${engagement.score}/100`}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ENG_STYLES[engagement.band]}`}
          >
            Engagement {engagement.score} · {BAND_LABEL[engagement.band]}
          </span>
        )}
        {flags.map((f) => (
          <span
            key={f}
            title={FLAG_HELP[f]}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              f === "cadence_lapsed"
                ? "bg-expense-bg text-expense"
                : f === "lybunt"
                ? "bg-[#F4E8D0] text-[#A56A1B]"
                : f === "second_gift_watch"
                ? "bg-blue-500/15 text-blue-400"
                : "bg-tile text-ink-2"
            }`}
          >
            {FLAG_LABELS[f]}
          </span>
        ))}
        {hubspotId && (
          <Link
            href={`/admin/fundraising/prospects/by-hubspot/${hubspotId}`}
            className="ml-auto text-[11px] font-semibold px-3 py-1 rounded-full bg-tile border-[1.5px] border-outline text-ink-1 hover:text-ink-1 hover:bg-[#EFE6D4] transition-colors whitespace-nowrap"
          >
            {hasBrief ? "Research brief →" : "Run research →"}
          </Link>
        )}
      </div>

      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Lifetime Giving"
            value={money(total)}
            sub={recognitionReceived > 0 ? `${money(recognition)} recognition incl. soft credits` : undefined}
          />
          <StatCard label="Gifts" value={gifts.length} sub={gifts.length > 0 ? `latest ${fmtDate(gifts[0].gift_date)}` : undefined} />
          <StatCard
            label="First Gift"
            value={allDates[0] ? fmtDate(allDates[0]) : "—"}
          />
          <StatCard
            label="Acknowledgments"
            value={pendingAcks}
            sub={pendingAcks > 0 ? "gifts awaiting a thank-you" : "all caught up"}
          />
        </div>

        {openOpps.length > 0 && (
          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg px-5 py-4 flex items-center gap-4 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-orange font-semibold">Next move</span>
            {nextMove ? (
              <>
                <span className="text-sm text-ink-1 font-medium">{nextMove.next_step}</span>
                {nextMove.next_step_due && (
                  <span
                    className={`text-xs font-semibold ${
                      nextMove.next_step_due < todayStr ? "text-expense" : "text-ink-2"
                    }`}
                  >
                    {nextMove.next_step_due < todayStr ? "Overdue · " : "Due "}
                    {fmtDate(nextMove.next_step_due)}
                  </span>
                )}
                <span className="text-[11px] text-ink-3 capitalize">{nextMove.stage}</span>
                {nextMove.ask_amount ? (
                  <span className="text-[11px] text-ink-3">· ask {money(Number(nextMove.ask_amount))}</span>
                ) : null}
              </>
            ) : (
              <span className="text-sm text-ink-2">
                {openOpps.length} open {openOpps.length === 1 ? "ask" : "asks"} · no next step set
              </span>
            )}
            <Link
              href="/admin/fundraising"
              className="ml-auto text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors"
            >
              Pipeline →
            </Link>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-4 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className="font-heading font-bold text-ink-1 text-sm">Profile</h2>
              <EditDonorButton
                donor={{
                  id: c.id,
                  type: c.type === "organization" ? "organization" : "person",
                  first_name: c.first_name,
                  last_name: c.last_name,
                  org_name: c.org_name,
                  emails: (c.emails as string[]) ?? [],
                  phones: (c.phones as string[]) ?? [],
                  street: c.street,
                  city: c.city,
                  state: c.state,
                  postal_code: c.postal_code,
                  tags: (c.tags as string[]) ?? [],
                  do_not_contact: c.do_not_contact,
                  notes: c.notes,
                }}
              />
            </div>
            {[
              ["Type", c.type],
              ["Email", (c.emails as string[])[0] ?? "—"],
              ["Phone", (c.phones as string[])[0] ?? "—"],
              ["Address", [c.street, c.city, c.state, c.postal_code].filter(Boolean).join(", ") || "—"],
              ["Source", c.source],
              ["Tags", (c.tags as string[]).join(", ") || "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 text-xs">
                <span className="text-ink-3 w-16 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">{label}</span>
                <span className="text-ink-1 break-words min-w-0 capitalize">{String(value)}</span>
              </div>
            ))}
            <AckChannelPref constituentId={c.id} current={(c.preferred_ack_channel as string | null) ?? null} />
            {c.notes && <p className="text-xs text-ink-2 border-t border-outline pt-3">{c.notes}</p>}
            <ConstituentDangerZone
              id={c.id}
              name={name}
              archived={!!c.archived_at}
              hasGifts={allDates.length > 0}
            />
          </section>

          <section className="lg:col-span-8 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-heading font-bold text-ink-1 text-sm">Activity</h2>
              <div className="flex items-center gap-2">
                <LogThankYou
                  subjectType="constituent"
                  subjectId={c.id}
                  subjectLabel={name}
                  defaultChannel={(c.preferred_ack_channel as AckChannel | null) ?? null}
                />
                <LogInteractionForm constituentId={c.id} />
                <GiftEntryForm
                  constituentId={c.id}
                  campaigns={campaignOpts}
                  funds={fundOpts}
                  appeals={appealOpts}
                />
              </div>
            </div>
            {activity.length === 0 ? (
              <p className="p-6 text-ink-2 text-sm">
                No activity yet. Gifts, logged calls/emails/meetings, and thank-yous appear here.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {activity.map((ev) => {
                  if (ev.kind === "gift") {
                    const g = ev.gift;
                    const scList = scByGift.get(g.id) ?? [];
                    return (
                      <li key={`g-${g.id}`} className="px-5 py-3 group">
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-ink-2 w-24 flex-shrink-0">{fmtWhen(g.gift_date)}</span>
                          <span className="text-[10px] uppercase tracking-wider text-revenue font-semibold w-14 flex-shrink-0">Gift</span>
                          <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums]">{money(g.amount)}</span>
                          <span className="text-[10px] uppercase tracking-wider text-ink-3">{g.method}</span>
                          {g.recurring_plan_id && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
                          )}
                          <span className="ml-auto text-[11px] flex items-center gap-3">
                            {g.acknowledgment_status === "sent" ? (
                              <span className="text-revenue">Thanked</span>
                            ) : g.acknowledgment_status === "pending" ? (
                              <span className="text-orange">Thank-you pending</span>
                            ) : (
                              <span className="text-ink-3">—</span>
                            )}
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <GiftRowActions id={g.id} />
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 ml-24 flex flex-wrap items-center gap-1.5">
                          {scList.map((sc) => (
                            <SoftCreditChip
                              key={sc.id}
                              giftId={g.id}
                              id={sc.id}
                              label={`${sc.name} · ${SC_TYPE_LABEL[sc.type] ?? sc.type}`}
                            />
                          ))}
                          <AddSoftCredit giftId={g.id} />
                        </div>
                      </li>
                    );
                  }
                  if (ev.kind === "interaction") {
                    const i = ev.interaction;
                    const isEmail = i.kind === "email";
                    const gmailUrl = i.thread_id
                      ? `https://mail.google.com/mail/u/0/#all/${i.thread_id}`
                      : null;
                    if (i.is_private) {
                      return (
                        <li
                          key={`i-${i.id}`}
                          className="px-5 py-2 text-xs flex items-center gap-4 text-ink-3 group"
                        >
                          <span className="w-24 flex-shrink-0">{fmtWhen(i.occurred_at)}</span>
                          <span className="italic">Hidden {isEmail ? "email" : i.kind}</span>
                          <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            <EmailActions interactionId={i.id} isPrivate />
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li key={`i-${i.id}`} className="px-5 py-3 text-sm flex items-start gap-4 group">
                        <span className="text-xs text-ink-2 w-24 flex-shrink-0 pt-px">{fmtWhen(i.occurred_at)}</span>
                        <span className="text-[10px] uppercase tracking-wider text-orange font-semibold w-14 flex-shrink-0 pt-1">
                          {isEmail ? (i.direction === "outbound" ? "Sent" : "Email") : i.kind}
                        </span>
                        <div className="min-w-0 flex-1">
                          {isEmail ? (
                            <>
                              <div className="flex items-center gap-2">
                                {i.subject ? (
                                  <span className="text-ink-1 font-medium break-words">{i.subject}</span>
                                ) : (
                                  <span className="text-ink-3 italic">(no subject)</span>
                                )}
                                {i.direction && (
                                  <span className="text-[10px] text-ink-3 whitespace-nowrap">
                                    {i.direction === "outbound" ? "→ sent" : "← received"}
                                  </span>
                                )}
                              </div>
                              {i.body_preview && (
                                <p className="text-ink-2 text-xs mt-0.5 line-clamp-2">{i.body_preview}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1">
                                {gmailUrl && (
                                  <a
                                    href={gmailUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-ink-3 hover:text-orange"
                                  >
                                    Open in Gmail ↗
                                  </a>
                                )}
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                  <EmailActions interactionId={i.id} isPrivate={false} />
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              {i.logged_by && <div className="text-xs text-ink-3">{i.logged_by}</div>}
                              {i.notes && <p className="text-ink-1 text-sm mt-0.5">{i.notes}</p>}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li key={`a-${ev.at}-${ev.channel}-${ev.amount ?? "x"}`} className="px-5 py-3 flex items-center gap-4">
                      <span className="text-xs text-ink-2 w-24 flex-shrink-0">{fmtWhen(ev.at)}</span>
                      <span className="text-[10px] uppercase tracking-wider text-revenue font-semibold w-14 flex-shrink-0">Thanked</span>
                      <span className="text-xs text-ink-2">
                        {CHANNEL_PAST[ev.channel] ?? "Thanked"} ·{" "}
                        {ev.amount != null ? `thank-you for a ${money(ev.amount)} gift` : "thank-you"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <RailEntity type="constituent" id={c.id} label={name} />
        <EntityTasks entityType="constituent" entityId={c.id} entityLabel={name} defaultCategory="fundraising" />
        <CommentThread entityType="constituent" entityId={c.id} entityLabel={name} />

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline flex items-center gap-3 flex-wrap">
            <h2 className="font-heading font-bold text-ink-1 text-sm">
              Household{household ? ` · ${household.name}` : ""}
            </h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {!household && (
              <p className="text-ink-2 text-sm">
                Not in a household. Create one to roll up giving for spouses or family, or join an
                existing household.
              </p>
            )}
            <HouseholdControls
              constituentId={c.id}
              households={households}
              household={
                household
                  ? {
                      id: household.id,
                      name: household.name,
                      salutation: household.salutation,
                      total: money(household.total),
                      members: household.members.map((m) => ({
                        id: m.id,
                        name: m.name,
                        total: money(m.total),
                      })),
                    }
                  : null
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}
