import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../../finance/_components/charts";
import StatCard from "../../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import { CHANNEL_PAST } from "@/lib/fundraising/ack-channels";
import { analyzeDonor, FLAG_LABELS, FLAG_HELP, type RetentionFlag } from "@/lib/fundraising/retention";
import { scoreDonor, BAND_LABEL, type EngagementBand } from "@/lib/fundraising/engagement";
import {
  deriveLifecycleStage,
  LIFECYCLE_STAGES,
  LIFECYCLE_LABELS,
  LIFECYCLE_HELP,
  type LifecycleStage,
} from "@/lib/fundraising/lifecycle";
import StageStrip from "../../../_components/StageStrip";
import { todayISO } from "../../../ops/_types/ops";
import { GiftEntryForm, GiftRowActions } from "../_components/GiftControls";
import { EditDonorButton, LogInteractionForm } from "../_components/ConstituentControls";
import LogThankYou from "../_components/LogThankYou";
import AckChannelPref from "../_components/AckChannelPref";
import { type AckChannel } from "@/lib/fundraising/ack-channels";
import { HouseholdControls } from "../_components/HouseholdControls";
import { AddSoftCredit, SoftCreditChip, SC_TYPE_LABEL } from "../_components/SoftCreditControls";
import EmailActions from "../_components/EmailActions";
import { EnrollInJourney, CancelEnrollment } from "../_components/JourneyControls";
import NextMovePanel from "../../_components/NextMovePanel";
import { hasEntitlement } from "@/lib/admin/entitlements";
import { getOrgContext } from "@/lib/admin/auth";
import { EntityTasks } from "../../../_components/EntityTasks";
import { EntityDocuments } from "../../../_components/EntityDocuments";
import { CommentThread } from "../../../_components/CommentThread";
import { RailEntity } from "../../../_components/rail/RailEntityContext";
import ConstituentDangerZone from "../_components/ConstituentDangerZone";
import ExpandableList from "../_components/ExpandableList";
import { mapStage, type HubSpotPledgeStatus } from "@/lib/finance/hubspot-pledges";
import { TYPE } from "@/lib/admin/typeScale";
import { isOpenStage } from "@/lib/fundraising/stage-sets";

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

  // Reed's next-move panel is a Grow-tier feature (the route 402s without ai.reed).
  const reedEnabled = await hasEntitlement("ai.reed");
  // Active-org fence for the org-wide list reads below (RLS alone spans every
  // org the user belongs to); the by-constituent reads inherit the scope from
  // the constituent row itself.
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const supabase = createServerSupabase();
  const [cRes, giftsRes, plansRes, allDatesRes, interactionsRes, campaignsRes, fundsRes, appealsRes, scReceivedRes, oppsRes, enrollRes, activeJourneysRes] = await Promise.all([
    supabase.from("constituents").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("gifts")
      .select("id, amount, gift_date, method, acknowledgment_status, acknowledged_at, recurring_plan_id, external_source")
      .eq("constituent_id", params.id)
      .order("gift_date", { ascending: false })
      .limit(500),
    supabase
      .from("recurring_plans")
      .select("id, amount, frequency, status, external_source, last_charged_at, last_payment_failed_at")
      .eq("constituent_id", params.id)
      .order("status")
      .order("amount", { ascending: false }),
    // Full gift history (dates + amounts, cheap) — drives the first-gift
    // stat, retention flags, and the lifecycle stage, independent of the
    // timeline's 500-row display cap.
    supabase
      .from("gifts")
      .select("gift_date, amount")
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
    supabase.from("campaigns").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(100),
    supabase.from("funds").select("id, name").eq("org_id", ctx.orgId).order("name").limit(100),
    supabase.from("appeals").select("id, name").eq("org_id", ctx.orgId).order("name").limit(200),
    // Soft credits this donor *received* (recognition only) — Epic D3.
    supabase.from("soft_credits").select("amount").eq("constituent_id", params.id).limit(5000),
    // Open asks → the "next move" block (Constituent 360 v1).
    supabase
      .from("opportunities")
      .select("id, name, stage, next_step, next_step_due, ask_amount, expected_close")
      .eq("constituent_id", params.id)
      .order("next_step_due", { ascending: true, nullsFirst: false })
      .limit(20),
    // Journey enrollments (Epic J, spec Phase 2 — read-only): which
    // sequences this donor is in and where. Joined to the journey for
    // name/status/trigger; step totals come from a follow-up query.
    supabase
      .from("journey_enrollments")
      .select("id, journey_id, status, current_step, next_run_at, last_step_at, enrolled_at, journey:journeys ( name, status, trigger )")
      .eq("constituent_id", params.id)
      .order("enrolled_at", { ascending: false })
      .limit(100),
    // The active org's active journeys — the manual-enroll picker
    // lists any active journey, not just manual-trigger ones (open
    // decision 2 as amended).
    supabase.from("journeys").select("id, name").eq("org_id", ctx.orgId).eq("status", "active").order("name").limit(200),
  ]);

  // Query error = tables not applied yet (same grace state as the list
  // page); a clean miss = real 404.
  if (cRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Donors</h1>
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
  const plans = (plansRes.data ?? []) as Array<{
    id: string; amount: number; frequency: string; status: string;
    external_source: string | null; last_charged_at: string | null; last_payment_failed_at: string | null;
  }>;
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
  const openOpps = opps.filter((o) => isOpenStage(o.stage));
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

  const name = constituentName(c);
  const activePlan = plans.find((p) => p.status === "active");
  const fullHistory = (allDatesRes.data ?? []) as Array<{ gift_date: string; amount: number }>;
  const allDates = fullHistory.map((g) => g.gift_date);
  // One source of truth: the displayed lifetime total and the lifecycle
  // stage sum the same full-history amounts — never the 500-row timeline,
  // whose capped sum would understate a long-history donor.
  const total = fullHistory.reduce((s, g) => s + Number(g.amount), 0);
  const stage = deriveLifecycleStage({
    giftCount: fullHistory.length,
    lifetimeAmount: total,
    hasActiveRecurringPlan: Boolean(activePlan),
  });
  const recognition = total + recognitionReceived;
  const { flags } = analyzeDonor(allDates, todayISO(), Boolean(activePlan));
  const engagement = scoreDonor(allDates, total, Boolean(activePlan), todayISO());

  // ── Journey enrollments (spec Phase 2, read-only) ──
  // Step totals come from a follow-up query keyed by the enrolled journey
  // ids (same pattern as the soft-credit join). current_step counts steps
  // already sent, so the upcoming step is current_step + 1.
  type Enrollment = {
    id: string; journey_id: string; status: string; current_step: number;
    next_run_at: string | null; last_step_at: string | null; enrolled_at: string;
    journey: { name: string; status: string; trigger: string } | null;
  };
  const enrollments = ((enrollRes.data ?? []) as unknown as Enrollment[]);
  const stepTotals = new Map<string, number>();
  if (enrollments.length > 0) {
    const { data: stepRows } = await supabase
      .from("journey_steps")
      .select("journey_id")
      .in("journey_id", Array.from(new Set(enrollments.map((e) => e.journey_id))))
      .limit(2000);
    for (const s of (stepRows ?? []) as Array<{ journey_id: string }>) {
      stepTotals.set(s.journey_id, (stepTotals.get(s.journey_id) ?? 0) + 1);
    }
  }
  const activeEnrollments = enrollments.filter((e) => e.status === "active");
  const pastEnrollments = enrollments.filter((e) => e.status !== "active");
  const activeJourneys = (activeJourneysRes.data ?? []) as Array<{ id: string; name: string }>;
  // Why manual enrollment is blocked for this donor (mirrors the enroll
  // route's guards so the UI can say so instead of failing on submit).
  const enrollBlockedReason = c.do_not_contact
    ? "this donor is marked do-not-contact"
    : !(((c.emails as string[] | null) ?? [])[0])
    ? "no email on file"
    : null;
  const ENG_STYLES: Record<EngagementBand, string> = {
    strong: "bg-revenue/15 text-revenue",
    steady: "bg-blue-500/15 text-blue-400",
    at_risk: "bg-[#F4E8D0] text-[#A56A1B]",
    none: "bg-tile text-ink-3 border border-outline",
  };
  const STAGE_STYLES: Record<LifecycleStage, string> = {
    prospect: "bg-tile text-ink-3 border-[1.5px] border-outline",
    first_time: "bg-tile text-ink-2 border-[1.5px] border-outline",
    repeat: "bg-blue-500/15 text-blue-400",
    recurring: "bg-revenue/15 text-revenue",
    major: "bg-orange/20 text-orange",
  };
  const FLAG_STYLES: Record<RetentionFlag, string> = {
    lybunt: "bg-[#F4E8D0] text-[#A56A1B]",
    sybunt: "bg-tile text-ink-2",
    cadence_lapsed: "bg-expense-bg text-expense",
    second_gift_watch: "bg-blue-500/15 text-blue-400",
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

  // ── HubSpot mirror for this donor (X6) ──────────────────────────────────
  // Comms (engagements) + Pledges (deals) live in the read-only hs_* mirror,
  // keyed by the linked HubSpot contact id. The donor page surfaces them for
  // contacts that came from / are matched to HubSpot; recurring stays native
  // (BloomOS is the system of record for gifts/revenue). Best-effort: if the
  // mirror tables aren't applied, render an unavailable note rather than 500.
  type HsComm = { id: string; type: string; subject: string | null; preview: string | null; at: string | null };
  type HsPledge = { id: string; name: string; amount: number; stage: string | null; close_date: string | null; status: Exclude<HubSpotPledgeStatus, "ignore"> };
  let hsComms: HsComm[] = [];
  let hsPledges: HsPledge[] = [];
  let hsCommsError = false;
  let hsPledgesError = false;
  if (hubspotId) {
    const [commsRes, dealsRes] = await Promise.all([
      supabase
        .from("hs_engagements")
        .select("hubspot_id, engagement_type, subject, body_preview, occurred_at")
        .contains("contact_ids", [hubspotId])
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from("hs_deals")
        .select("hubspot_id, name, amount, stage, close_date")
        .eq("primary_contact_id", hubspotId)
        .order("close_date", { ascending: false, nullsFirst: false })
        .limit(100),
    ]);
    hsCommsError = !!commsRes.error;
    hsPledgesError = !!dealsRes.error;
    hsComms = ((commsRes.data ?? []) as Array<{
      hubspot_id: string; engagement_type: string | null; subject: string | null; body_preview: string | null; occurred_at: string | null;
    }>).map((e) => ({
      id: e.hubspot_id,
      type: e.engagement_type ?? "note",
      subject: e.subject,
      preview: e.body_preview,
      at: e.occurred_at,
    }));
    hsPledges = ((dealsRes.data ?? []) as Array<{
      hubspot_id: string; name: string | null; amount: number | null; stage: string | null; close_date: string | null;
    }>)
      .map((d) => ({ d, m: mapStage(d.stage) }))
      .filter(({ m }) => m.status !== "ignore")
      .map(({ d, m }) => ({
        id: d.hubspot_id,
        name: d.name ?? "(unnamed deal)",
        amount: Number(d.amount ?? 0),
        stage: d.stage,
        close_date: d.close_date,
        status: m.status as Exclude<HubSpotPledgeStatus, "ignore">,
      }));
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

  const COMM_TYPE_LABEL: Record<string, string> = {
    email: "Email", call: "Call", meeting: "Meeting", note: "Note", task: "Task",
  };
  const TRIGGER_LABEL: Record<string, string> = {
    first_gift: "First gift", lapsed: "Lapsed", manual: "Manual",
  };
  const PLEDGE_STATUS_STYLE: Record<Exclude<HubSpotPledgeStatus, "ignore">, string> = {
    received: "bg-revenue/15 text-revenue",
    secured: "bg-orange/20 text-orange",
    projected: "bg-blue-500/15 text-blue-400",
  };
  const PLEDGE_STATUS_LABEL: Record<Exclude<HubSpotPledgeStatus, "ignore">, string> = {
    received: "Received", secured: "Secured", projected: "Projected",
  };

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3">
        <Link href="/admin/fundraising/donors" className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors">
          ← Donors
        </Link>
        <span className={`${TYPE.cardTitle} sm:text-base truncate`}>{name}</span>
        <span
          title={LIFECYCLE_HELP[stage]}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_STYLES[stage]}`}
        >
          {LIFECYCLE_LABELS[stage]}
        </span>
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
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${FLAG_STYLES[f]}`}
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

        {/* Lifecycle stage strip — stage is derived at read time, never
            stored. Lapsed overlays as retention-flag badges, not a stage:
            a lapsed major donor is still Major, visibly flagged. */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg px-5 py-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h2 className={TYPE.cardTitle}>Lifecycle Stage</h2>
            {flags.map((f) => (
              <span
                key={f}
                title={FLAG_HELP[f]}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${FLAG_STYLES[f]}`}
              >
                {FLAG_LABELS[f]}
              </span>
            ))}
          </div>
          <StageStrip
            cells={LIFECYCLE_STAGES.map((s) => ({
              key: s,
              label: LIFECYCLE_LABELS[s],
              value: s === stage ? "●" : "·",
              active: s === stage,
              title: LIFECYCLE_HELP[s],
            }))}
          />
        </section>

        {/* Journeys panel (spec Phase 2, read-only): which sequences this
            donor is in and where they stand. Enrollment actions are Phase 3. */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3">
            <h2 className={TYPE.cardTitle}>Journeys</h2>
            <div className="ml-auto flex items-center gap-3">
              <EnrollInJourney
                constituentId={c.id}
                journeys={activeJourneys}
                enrolledJourneyIds={activeEnrollments.map((e) => e.journey_id)}
                disabledReason={enrollBlockedReason}
              />
              <Link
                href="/admin/fundraising/journeys"
                className="text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors whitespace-nowrap"
              >
                Manage journeys →
              </Link>
            </div>
          </div>
          {enrollments.length === 0 ? (
            <p className={`px-5 py-5 ${TYPE.bodyMuted}`}>
              Not enrolled in any journey. Journeys are triggered, multi-step email sequences —
              build them in{" "}
              <Link
                href="/admin/fundraising/journeys"
                className="font-semibold text-orange hover:text-orange-dark"
              >
                Fundraising → Journeys
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {activeEnrollments.map((e) => {
                const totalSteps = stepTotals.get(e.journey_id) ?? 0;
                const upcoming = Math.min(e.current_step + 1, Math.max(totalSteps, 1));
                const journeyPaused = e.journey?.status === "paused";
                return (
                  <li key={e.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-ink-1">{e.journey?.name ?? "(journey removed)"}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-revenue/15 text-revenue">
                      Active
                    </span>
                    {e.journey && (
                      <span className="text-[11px] text-ink-3">{TRIGGER_LABEL[e.journey.trigger] ?? e.journey.trigger}</span>
                    )}
                    <span className="ml-auto text-xs text-ink-2 [font-variant-numeric:tabular-nums]">
                      Step {upcoming} of {totalSteps || "?"}
                    </span>
                    {journeyPaused ? (
                      <span className="text-xs text-ink-3 whitespace-nowrap">sends held — journey paused</span>
                    ) : (
                      e.next_run_at && (
                        <span className="text-xs text-ink-2 whitespace-nowrap">next send {fmtWhen(e.next_run_at)}</span>
                      )
                    )}
                    <CancelEnrollment enrollmentId={e.id} journeyName={e.journey?.name ?? "This journey"} />
                  </li>
                );
              })}
              {pastEnrollments.map((e) => {
                const totalSteps = stepTotals.get(e.journey_id) ?? 0;
                const done = e.status === "completed";
                return (
                  <li key={e.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-ink-2">{e.journey?.name ?? "(journey removed)"}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        done ? "bg-tile text-ink-2 border-[1.5px] border-outline" : "bg-expense-bg text-expense"
                      }`}
                    >
                      {done ? "Completed" : "Cancelled"}
                    </span>
                    <span className="ml-auto text-xs text-ink-3 [font-variant-numeric:tabular-nums]">
                      {done
                        ? `${totalSteps || e.current_step} step${(totalSteps || e.current_step) === 1 ? "" : "s"}${
                            e.last_step_at ? ` · finished ${fmtWhen(e.last_step_at)}` : ""
                          }`
                        : `${e.current_step} of ${totalSteps || "?"} steps sent · enrolled ${fmtWhen(e.enrolled_at)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {reedEnabled && (
          <NextMovePanel
            entityType="constituent"
            entityId={c.id}
            entityLabel={name}
            email={((c.emails as string[]) ?? [])[0] ?? null}
          />
        )}

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
              <h2 className={TYPE.cardTitle}>Profile</h2>
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
              <h2 className={TYPE.cardTitle}>Activity</h2>
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
              <p className={`p-6 ${TYPE.bodyMuted}`}>
                No activity yet. Gifts, logged calls/emails/meetings, and thank-yous appear here.
              </p>
            ) : (
              <ExpandableList limit={5}>
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
                              {i.notes && <p className={`${TYPE.body} mt-0.5`}>{i.notes}</p>}
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
              </ExpandableList>
            )}
          </section>
        </div>

        {/* ── Recurring (native plans) + HubSpot Comms / Pledges ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline flex items-center gap-3 flex-wrap">
              <h2 className={TYPE.cardTitle}>Recurring</h2>
              {activePlan && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/20 text-orange">
                  {money(Number(activePlan.amount))}/{activePlan.frequency.slice(0, 2)} active
                </span>
              )}
            </div>
            {plans.length === 0 ? (
              <p className={`p-6 ${TYPE.bodyMuted}`}>
                No recurring plans. Stripe monthly donations create plans automatically; add a manual
                plan on the Recurring page for offline standing gifts.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {plans.map((p) => (
                  <li key={p.id} className="px-5 py-3 flex items-center gap-3">
                    <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums]">
                      {money(Number(p.amount))}
                      <span className="text-ink-3 font-normal">/{p.frequency.slice(0, 2)}</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-ink-3">{p.status}</span>
                    {p.external_source === "manual" && (
                      <span className="text-[10px] uppercase tracking-wider text-ink-3">manual</span>
                    )}
                    {p.last_payment_failed_at && p.status === "active" && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense">payment failed</span>
                    )}
                    <span className="ml-auto text-xs text-ink-2 [font-variant-numeric:tabular-nums]">
                      {p.last_charged_at ? `last ${fmtWhen(p.last_charged_at)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {hubspotId && (
            <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-outline flex items-center gap-3 flex-wrap">
                <h2 className={TYPE.cardTitle}>Pledges</h2>
                <span className="text-[10px] uppercase tracking-wider text-ink-3">from HubSpot</span>
              </div>
              {hsPledgesError ? (
                <p className={`p-6 ${TYPE.bodyMuted}`}>HubSpot deals are unavailable right now. Try a sync, then reload.</p>
              ) : hsPledges.length === 0 ? (
                <p className={`p-6 ${TYPE.bodyMuted}`}>No HubSpot deals linked to this donor.</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {hsPledges.map((p) => (
                    <li key={p.id} className="px-5 py-3 flex items-center gap-3">
                      <span className="text-sm text-ink-1 flex-1 truncate">{p.name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PLEDGE_STATUS_STYLE[p.status]}`}>
                        {PLEDGE_STATUS_LABEL[p.status]}
                      </span>
                      {p.close_date && (
                        <span className="text-xs text-ink-3 w-24 text-right [font-variant-numeric:tabular-nums]">{fmtWhen(p.close_date)}</span>
                      )}
                      <span className="font-bold text-ink-1 w-24 text-right [font-variant-numeric:tabular-nums]">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {hubspotId && (
          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline flex items-center gap-3 flex-wrap">
              <h2 className={TYPE.cardTitle}>Comms</h2>
              <span className="text-[10px] uppercase tracking-wider text-ink-3">from HubSpot</span>
            </div>
            {hsCommsError ? (
              <p className={`p-6 ${TYPE.bodyMuted}`}>HubSpot communications are unavailable right now. Try a sync, then reload.</p>
            ) : hsComms.length === 0 ? (
              <p className={`p-6 ${TYPE.bodyMuted}`}>No HubSpot emails, calls, meetings, or notes linked to this donor.</p>
            ) : (
              <ExpandableList limit={5}>
                {hsComms.map((e) => (
                  <li key={e.id} className="px-5 py-3 flex items-start gap-4">
                    <span className="text-xs text-ink-2 w-24 flex-shrink-0 pt-px">{e.at ? fmtWhen(e.at) : "—"}</span>
                    <span className="text-[10px] uppercase tracking-wider text-orange font-semibold w-16 flex-shrink-0 pt-1">
                      {COMM_TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      {e.subject ? (
                        <span className="text-ink-1 font-medium break-words">{e.subject}</span>
                      ) : (
                        <span className="text-ink-3 italic">(no subject)</span>
                      )}
                      {e.preview && <p className="text-ink-2 text-xs mt-0.5 line-clamp-2">{e.preview}</p>}
                    </div>
                  </li>
                ))}
              </ExpandableList>
            )}
          </section>
        )}

        <RailEntity type="constituent" id={c.id} label={name} />
        <EntityTasks entityType="constituent" entityId={c.id} entityLabel={name} defaultCategory="fundraising" />
        <EntityDocuments entityType="constituent" entityId={c.id} entityLabel={name} />
        <CommentThread entityType="constituent" entityId={c.id} entityLabel={name} />

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline flex items-center gap-3 flex-wrap">
            <h2 className={TYPE.cardTitle}>
              Household{household ? ` · ${household.name}` : ""}
            </h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {!household && (
              <p className={`${TYPE.bodyMuted}`}>
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
