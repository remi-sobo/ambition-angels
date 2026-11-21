import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { constituentName } from "@/lib/fundraising/display";
import { CHANNEL_PAST } from "@/lib/fundraising/ack-channels";
import { analyzeDonor, FLAG_LABELS, FLAG_HELP, type RetentionFlag } from "@/lib/fundraising/retention";
import { scoreDonor, BAND_LABEL, type EngagementBand } from "@/lib/fundraising/engagement";
import {
  deriveLifecycleStage,
  LIFECYCLE_LABELS,
  LIFECYCLE_HELP,
} from "@/lib/fundraising/lifecycle";
import { todayISO } from "../../../ops/_types/ops";
import { todayInTZ } from "@/lib/admin/ops/week";
import { GiftRowActions } from "../_components/GiftControls";
import { EditDonorButton, LogInteractionForm } from "../_components/ConstituentControls";
import RecordButton from "@/app/admin/capture/_components/RecordButton";
import FiledNoteLine from "@/app/admin/capture/_components/FiledNoteLine";
import { loadFixTargets } from "@/app/admin/capture/_lib/fixTargets";
import LogThankYou from "../_components/LogThankYou";
import AckChannelPref from "../_components/AckChannelPref";
import { type AckChannel } from "@/lib/fundraising/ack-channels";
import { HouseholdControls } from "../_components/HouseholdControls";
import { AddSoftCredit, SoftCreditChip } from "../_components/SoftCreditControls";
import { SC_TYPE_LABEL } from "../_components/softCreditTypes";
import EmailActions from "../_components/EmailActions";
import { EnrollInJourney, CancelEnrollment } from "../_components/JourneyControls";
import NextMovePanel from "../../_components/NextMovePanel";
import { hasEntitlement } from "@/lib/admin/entitlements";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getActiveOrgMembers } from "@/lib/admin/owners-server";
import OwnerChip from "../../../_components/OwnerChip";
import { EntityTasks } from "../../../_components/EntityTasks";
import { EntityDocuments } from "../../../_components/EntityDocuments";
import { CommentThread } from "../../../_components/CommentThread";
import { RailEntity } from "../../../_components/rail/RailEntityContext";
import ConstituentDangerZone from "../_components/ConstituentDangerZone";
import { mapStage, type HubSpotPledgeStatus } from "@/lib/finance/hubspot-pledges";
import { TYPE } from "@/lib/admin/typeScale";
import PageHeader, { IdentityChip } from "../../../_components/PageHeader";
import Figure, { SummaryStrip } from "../../../_components/ui/Figure";
import Timeline, { TimelineChip, type TimelineEntry } from "../../../_components/ui/Timeline";
import Notice from "../../../_components/ui/Notice";
import { ButtonLink } from "../../../_components/ui/Button";
import { RecordGiftButton, EditGiftButton } from "../../_components/gift/GiftButtons";
import NextStepActions from "../../donors-funders/_components/NextStepActions";
import { asSentence, dueText, givingSummary, shortDay, usd as money, yearOverYear } from "@/lib/fundraising/donorRecord";
import { METHOD_LABEL, receiptWasSent } from "@/lib/fundraising/giftEdit";
import { cardUrgency } from "@/lib/fundraising/pipelineBoard";
import { isOpenStage } from "@/lib/fundraising/stage-sets";
import { emailTimelineItems, type DonorSendRow } from "@/lib/comms/timeline";

// Donor profile + giving timeline (Ring 2 Donors v1), extracted at Spec
// Fundraising F2 so ONE component serves two routes: the V1 page at
// /admin/fundraising/donors/[id] (v2=false — output byte-identical to the
// pre-F2 page, per the spec's DoD 7) and the Donor 360 at
// /admin/fundraising/donors-funders/[id] (v2=true — same profile plus the
// 360-only panels: Why they matter, giving by year, reporting owed,
// connected). Recomposition, not a fork: 1,000 lines of working profile
// exist once.
import Donor360Extras from "../../donors-funders/_components/Donor360Extras";
import CompanyPanel from "../../donors-funders/_components/CompanyPanel";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Handles both calendar-day strings (gift_date, length 10) and full
// timestamps (occurred_at / acknowledged_at).
const fmtWhen = (s: string) =>
  new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// V4 Stage B1 rebuilt the render on the Detail archetype (Donor.dc.html,
// DonorPhone.dc.html): breadcrumb, identity chips and ONE primary action
// (Record a gift), More actions, a next-step bar on the soonest open ask, a
// summary strip whose figures say where they come from, one timeline on the
// left and compact context panels on the right. The V1 route 308s here, so
// there is one layout; `v2` is kept for the route's call site.
export default async function DonorProfile({
  id,
  showAll = false,
}: {
  id: string;
  v2?: boolean;
  /** Show the whole timeline instead of the latest entries. */
  showAll?: boolean;
}) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Reed's next-move panel is a Grow-tier feature (the route 402s without ai.reed).
  const reedEnabled = await hasEntitlement("ai.reed");
  // Capture C5: Record from this page, with this donor as the context prior.
  const captureEnabled = await hasEntitlement("ai.capture");
  // Active-org fence for the org-wide list reads below (RLS alone spans every
  // org the user belongs to); the by-constituent reads inherit the scope from
  // the constituent row itself.
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const supabase = createServerSupabase();
  // V4 B2: the owner chip's names and who may change it.
  const [members, canAssign] = await Promise.all([getActiveOrgMembers(), ctxHasPermission(ctx, "fundraising.write")]);
  const [cRes, giftsRes, plansRes, allDatesRes, interactionsRes, campaignsRes, fundsRes, appealsRes, scReceivedRes, oppsRes, enrollRes, activeJourneysRes] = await Promise.all([
    supabase.from("constituents").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("gifts")
      .select("id, amount, gift_date, method, acknowledgment_status, acknowledged_at, recurring_plan_id, external_source, fund_id, campaign_id, appeal_id, notes")
      .eq("constituent_id", id)
      .order("gift_date", { ascending: false })
      .limit(500),
    supabase
      .from("recurring_plans")
      .select("id, amount, frequency, status, external_source, last_charged_at, last_payment_failed_at")
      .eq("constituent_id", id)
      .order("status")
      .order("amount", { ascending: false }),
    // Full gift history (dates + amounts, cheap) — drives the first-gift
    // stat, retention flags, and the lifecycle stage, independent of the
    // timeline's 500-row display cap.
    supabase
      .from("gifts")
      .select("gift_date, amount")
      .eq("constituent_id", id)
      .order("gift_date", { ascending: true })
      .limit(5000),
    supabase
      .from("interactions")
      .select("id, kind, occurred_at, notes, logged_by, direction, subject, thread_id, body_preview, is_private, external_source, external_id, edited_at")
      .eq("constituent_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    // Attribution options for manual gift entry (Epic A).
    supabase.from("campaigns").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(100),
    supabase.from("funds").select("id, name").eq("org_id", ctx.orgId).order("name").limit(100),
    supabase.from("appeals").select("id, name").eq("org_id", ctx.orgId).order("name").limit(200),
    // Soft credits this donor *received* (recognition only) — Epic D3.
    supabase.from("soft_credits").select("amount").eq("constituent_id", id).limit(5000),
    // Open asks → the "next move" block (Constituent 360 v1).
    supabase
      .from("opportunities")
      .select("id, name, stage, next_step, next_step_due, ask_amount, expected_close, owner")
      .eq("constituent_id", id)
      .order("next_step_due", { ascending: true, nullsFirst: false })
      .limit(20),
    // Journey enrollments (Epic J, spec Phase 2 — read-only): which
    // sequences this donor is in and where. Joined to the journey for
    // name/status/trigger; step totals come from a follow-up query.
    supabase
      .from("journey_enrollments")
      .select("id, journey_id, status, current_step, next_run_at, last_step_at, enrolled_at, journey:journeys ( name, status, trigger )")
      .eq("constituent_id", id)
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
        <div className="bg-tile border border-orange/30 rounded-panel-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
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
    fund_id: string | null; campaign_id: string | null; appeal_id: string | null; notes: string | null;
  }>).map((g) => ({ ...g, amount: Number(g.amount) }));
  const plans = (plansRes.data ?? []) as Array<{
    id: string; amount: number; frequency: string; status: string;
    external_source: string | null; last_charged_at: string | null; last_payment_failed_at: string | null;
  }>;
  const interactions = (interactionsRes.data ?? []) as Array<{
    id: string; kind: string; occurred_at: string; notes: string | null; logged_by: string | null;
    direction: string | null; subject: string | null; thread_id: string | null;
    body_preview: string | null; is_private: boolean | null;
    external_source: string | null; external_id: string | null; edited_at: string | null;
  }>;
  // Capture C6: the viewer's own capture-filed rows get Fix (session client, creator-only cards).
  const fixTargets = captureEnabled ? await loadFixTargets(interactions) : {};
  const opps = (oppsRes.data ?? []) as Array<{
    id: string; name: string | null; stage: string; next_step: string | null;
    next_step_due: string | null; ask_amount: number | null; expected_close: string | null;
    owner: string | null;
  }>;
  // Next move: soonest-due open ask with a next step (Constituent 360 v1).
  const openOpps = opps.filter((o) => isOpenStage(o.stage));
  const nextMove =
    openOpps
      .filter((o) => o.next_step)
      .sort((a, b) => (a.next_step_due ?? "9999").localeCompare(b.next_step_due ?? "9999"))[0] ?? null;
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
  const ackEvents: Array<{ channel: string; sent_at: string; amount: number | null; template: string | null }> = [];
  // Per gift: the sent acknowledgments, so a gift can say "Receipt sent".
  const acksByGift = new Map<string, Array<{ template: string | null; channel: string | null; sent_at: string | null }>>();
  if (giftIds.length > 0) {
    const { data: giftAcks } = await supabase
      .from("acknowledgments")
      .select("gift_id, channel, sent_at, template")
      .in("gift_id", giftIds)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(500);
    for (const a of (giftAcks ?? []) as Array<{ gift_id: string | null; channel: string | null; sent_at: string | null; template: string | null }>) {
      if (a.gift_id && a.sent_at) {
        ackEvents.push({ channel: a.channel ?? "other", sent_at: a.sent_at, amount: amountByGift.get(a.gift_id) ?? null, template: a.template });
        const list = acksByGift.get(a.gift_id) ?? [];
        list.push(a);
        acksByGift.set(a.gift_id, list);
      }
    }
  }
  const { data: subjectAcks } = await supabase
    .from("acknowledgments")
    .select("channel, sent_at")
    .eq("subject_type", "constituent")
    .eq("subject_id", id)
    .is("gift_id", null)
    .not("sent_at", "is", null)
    .limit(200);
  for (const a of (subjectAcks ?? []) as Array<{ channel: string | null; sent_at: string | null }>) {
    if (a.sent_at) ackEvents.push({ channel: a.channel ?? "other", sent_at: a.sent_at, amount: null, template: null });
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
    steady: "bg-tile text-ink-2",
    at_risk: "bg-status-watch-bg text-status-watch-text",
    none: "bg-tile text-ink-3 border border-hairline",
  };
  const FLAG_STYLES: Record<RetentionFlag, string> = {
    lybunt: "bg-status-watch-bg text-status-watch-text",
    sybunt: "bg-tile text-ink-2",
    cadence_lapsed: "bg-expense-bg text-expense",
    second_gift_watch: "bg-tile text-ink-2",
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

  // ── One timeline (Epic C, V4 Detail): gifts, logged touches, emails,
  // thank-yous and, for HubSpot-linked donors, the mirror's comms, newest
  // first. gift_date is a calendar day (anchored at noon so it sorts sanely
  // against the timestamped events); the rest are timestamptz.
  const ms = (s: string) => {
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
  };
  // The org's calendar day (Pacific), the same "today" the Pipeline board
  // and the gift drawer use, so "2 days late" reads the same everywhere.
  const today = todayInTZ();
  const nameOf = (list: Array<{ id: string; name: string }>, id: string | null) =>
    id ? list.find((o) => o.id === id)?.name ?? null : null;
  const dayOf = (s: string) => (s.length === 10 ? s : s.slice(0, 10));

  const ICON = {
    gift: <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C10 3 6 4 7.5 6.5M12 7c2-4 6-3 4.5-0.5" />,
    talk: <path d="M4 5h16v11H9l-5 4z" />,
    email: <path d="M3 6h18v12H3zM3 7l9 7 9-7" />,
    thanks: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
    hidden: <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM4 4l16 16" />,
  };
  const svg = (d: JSX.Element) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );

  type Sorted = { sort: number; entry: TimelineEntry };
  const sorted: Sorted[] = [];

  for (const g of gifts) {
    const scList = scByGift.get(g.id) ?? [];
    const acks = acksByGift.get(g.id) ?? [];
    const receipted = receiptWasSent(acks);
    const attribution = [nameOf(fundOpts, g.fund_id), nameOf(campaignOpts, g.campaign_id), nameOf(appealOpts, g.appeal_id)]
      .filter(Boolean)
      .join(", ");
    const source =
      g.external_source === "stripe"
        ? "Online through Stripe. Imported automatically."
        : g.external_source && g.external_source !== "manual"
          ? `From ${({ hubspot_deal: "HubSpot", hubspot: "HubSpot", givebutter: "Givebutter", import: "an import" } as Record<string, string>)[g.external_source] ?? g.external_source}.`
          : "Entered by hand.";
    sorted.push({
      sort: ms(g.gift_date + "T12:00:00"),
      entry: {
        id: `g-${g.id}`,
        kind: "gifts",
        icon: svg(ICON.gift),
        title: <>Gift: {money(g.amount)}</>,
        chips: (
          <>
            {g.acknowledgment_status === "sent" ? (
              <TimelineChip tone="success">
                {g.acknowledged_at ? `Thanked ${shortDay(dayOf(g.acknowledged_at), today)}` : "Thanked"}
              </TimelineChip>
            ) : g.acknowledgment_status === "pending" ? (
              <TimelineChip>Thank-you pending</TimelineChip>
            ) : null}
            {receipted ? <TimelineChip>Receipt sent</TimelineChip> : null}
            {g.recurring_plan_id ? <TimelineChip>Monthly</TimelineChip> : null}
          </>
        ),
        meta: (
          <>
            {METHOD_LABEL[g.method] ?? g.method}. {attribution ? `${attribution}. ` : ""}
            {source}
            {g.notes ? ` ${g.notes}` : ""}
          </>
        ),
        body: (
            <span className="flex flex-wrap items-center gap-1.5">
              {scList.map((sc) => (
                <SoftCreditChip
                  key={sc.id}
                  giftId={g.id}
                  id={sc.id}
                  label={`${sc.name} · ${SC_TYPE_LABEL[sc.type] ?? sc.type}`}
                />
              ))}
              <AddSoftCredit giftId={g.id} />
            </span>
        ),
        actions: (
          <>
            <EditGiftButton giftId={g.id} amountLabel={money(g.amount)} />
            <GiftRowActions id={g.id} amountLabel={money(g.amount)} externalSource={g.external_source} />
          </>
        ),
        date: shortDay(g.gift_date, today),
        dateTime: g.gift_date,
      },
    });
  }

  for (const i of interactions) {
    const isEmail = i.kind === "email";
    const gmailUrl = i.thread_id ? `https://mail.google.com/mail/u/0/#all/${i.thread_id}` : null;
    const when = shortDay(dayOf(i.occurred_at), today);
    if (i.is_private) {
      sorted.push({
        sort: ms(i.occurred_at),
        entry: {
          id: `i-${i.id}`,
          kind: isEmail ? "emails" : "conversations",
          icon: svg(ICON.hidden),
          title: <span className="text-ink-2 font-normal italic">Hidden {isEmail ? "email" : i.kind}</span>,
          actions: <EmailActions interactionId={i.id} isPrivate />,
          date: when,
          dateTime: i.occurred_at,
        },
      });
      continue;
    }
    sorted.push({
      sort: ms(i.occurred_at),
      entry: isEmail
        ? {
            id: `i-${i.id}`,
            kind: "emails",
            icon: svg(ICON.email),
            title: <>Email: {i.subject ? i.subject : <span className="italic font-normal">(no subject)</span>}</>,
            chips: i.direction ? <TimelineChip>{i.direction === "outbound" ? "Sent" : "Received"}</TimelineChip> : null,
            meta: i.body_preview ? <span className="line-clamp-2">{i.body_preview}</span> : undefined,
            actions: (
              <>
                {gmailUrl ? (
                  <ButtonLink href={gmailUrl} variant="quiet" size="sm" target="_blank" rel="noreferrer">
                    Open in Gmail
                  </ButtonLink>
                ) : null}
                <EmailActions interactionId={i.id} isPrivate={false} />
              </>
            ),
            date: when,
            dateTime: i.occurred_at,
          }
        : {
            id: `i-${i.id}`,
            kind: "conversations",
            icon: svg(ICON.talk),
            title: <span className="capitalize">{i.kind}</span>,
            meta: i.logged_by ? `Logged by ${i.logged_by}` : undefined,
            body: (
              <>
                {i.notes && <p>{i.notes}</p>}
                {i.external_source === "capture" && (
                  <FiledNoteLine
                    editedAt={i.edited_at}
                    target={(i.external_id && fixTargets[i.external_id]) || null}
                    note={{ kind: i.kind, occurredAt: i.occurred_at, notes: i.notes, entityType: "constituent", entityName: name }}
                  />
                )}
              </>
            ),
            date: when,
            dateTime: i.occurred_at,
          },
    });
  }

  ackEvents.forEach((a, n) => {
    sorted.push({
      sort: ms(a.sent_at),
      entry: {
        id: `a-${n}-${a.sent_at}`,
        kind: "thanks",
        icon: svg(ICON.thanks),
        title: a.amount != null ? <>Thank-you for the {money(a.amount)} gift</> : <>Thank-you</>,
        chips: a.template === "receipt-v1" || a.template === "auto-receipt" ? <TimelineChip>Receipt attached</TimelineChip> : null,
        meta: CHANNEL_PAST[a.channel] ?? "Thanked",
        date: shortDay(dayOf(a.sent_at), today),
        dateTime: a.sent_at,
      },
    });
  });

  // HubSpot comms (X6) join the same timeline, labelled with their source.
  const COMM_TYPE_LABEL: Record<string, string> = {
    email: "Email", call: "Call", meeting: "Meeting", note: "Note", task: "Task",
  };
  for (const e of hsComms) {
    sorted.push({
      sort: e.at ? ms(e.at) : 0,
      entry: {
        id: `h-${e.id}`,
        kind: e.type === "email" ? "emails" : "conversations",
        icon: svg(e.type === "email" ? ICON.email : ICON.talk),
        title: (
          <>
            {COMM_TYPE_LABEL[e.type] ?? e.type}: {e.subject ? e.subject : <span className="italic font-normal">(no subject)</span>}
          </>
        ),
        chips: <TimelineChip>HubSpot</TimelineChip>,
        meta: e.preview ? <span className="line-clamp-2">{e.preview}</span> : undefined,
        date: e.at ? shortDay(dayOf(e.at), today) : "No date",
        dateTime: e.at ?? undefined,
      },
    });
  }

  // V4 Stage D: Comms sends and opens from the Gmail sender (email_sends),
  // pinned to the active org. One entry per email that reached (or may have
  // reached) this donor, linked to the email's results.
  const { data: sendRows } = await supabase
    .from("email_sends")
    .select("id, status, sent_at, claimed_at, created_at, first_opened_at, open_count, first_clicked_at, click_count, campaign_id, campaign:email_campaigns ( name, subject )")
    .eq("org_id", ctx.orgId)
    .eq("constituent_id", id)
    .in("status", ["sent", "unknown"])
    .order("created_at", { ascending: false })
    .limit(200);
  for (const e of emailTimelineItems((sendRows ?? []) as unknown as DonorSendRow[])) {
    sorted.push({
      sort: ms(e.at),
      entry: {
        id: e.id,
        kind: "emails",
        icon: svg(ICON.email),
        title: (
          <Link href={`/admin/comms/emails/${e.campaignId}`} className="hover:text-orange">
            {e.title}
          </Link>
        ),
        chips: e.chips.length ? (
          <>
            <TimelineChip>Comms</TimelineChip>
            {e.chips.map((c) => (
              <TimelineChip key={c} tone={c.startsWith("Opened") || c.startsWith("Clicked") ? "success" : "neutral"}>
                {c}
              </TimelineChip>
            ))}
          </>
        ) : (
          <TimelineChip>Comms</TimelineChip>
        ),
        meta: e.meta,
        date: shortDay(dayOf(e.at), today),
        dateTime: e.at,
      },
    });
  }

  sorted.sort((a, b) => b.sort - a.sort);
  const allEntries = sorted.map((x) => x.entry);
  const TIMELINE_CAP = 25;
  const entries = showAll ? allEntries : allEntries.slice(0, TIMELINE_CAP);
  const countKind = (k: string) => allEntries.filter((e) => e.kind === k).length;
  const timelineFilters = [
    { key: "all", label: "All", count: allEntries.length },
    { key: "gifts", label: "Gifts", count: countKind("gifts") },
    { key: "conversations", label: "Conversations", count: countKind("conversations") },
    { key: "emails", label: "Emails", count: countKind("emails") },
    { key: "thanks", label: "Thank-yous", count: countKind("thanks") },
  ].filter((f) => f.key === "all" || f.count > 0);

  const TRIGGER_LABEL: Record<string, string> = {
    first_gift: "First gift", lapsed: "Lapsed", manual: "Manual",
  };
  const PLEDGE_STATUS_LABEL: Record<Exclude<HubSpotPledgeStatus, "ignore">, string> = {
    received: "Received", secured: "Secured", projected: "Projected",
  };

  // ── Summary strip and next step ──
  const summary = givingSummary(fullHistory, today);
  const openAskTotal = openOpps.reduce((s, o) => s + Number(o.ask_amount ?? 0), 0);
  const lastGiftRow = gifts[0] ?? null;
  const yoy = yearOverYear(summary.thisYear.total, summary.lastYear.total, money);
  const sinceYear = summary.firstDate ? summary.firstDate.slice(0, 4) : null;
  const stepOpp = nextMove ?? openOpps[0] ?? null;
  const stepDue = nextMove?.next_step_due ? dueText(nextMove.next_step_due, today) : null;
  const stepMeta = stepOpp ? (
    <>
      {nextMove?.next_step_due && stepDue?.late ? `Was due ${shortDay(nextMove.next_step_due, today)}. ` : ""}
      {stepOpp.owner ? `Owner: ${stepOpp.owner}. ` : ""}
      For {stepOpp.name ? `the ${stepOpp.name}` : "the open ask"}
      {stepOpp.ask_amount ? `, ${money(Number(stepOpp.ask_amount))}` : ""}.
      {openOpps.length > 1 ? ` ${openOpps.length} open asks.` : ""}
    </>
  ) : (
    "No open ask for this donor. Add one in Pipeline to plan the next step."
  );
  const email = ((c.emails as string[] | null) ?? [])[0] ?? null;
  const phone = ((c.phones as string[] | null) ?? [])[0] ?? null;

  const panel = "bg-surface border border-hairline rounded-panel";
  const panelHead = "flex items-center justify-between gap-2 px-4 pt-4 pb-2";
  const row = "flex gap-3 text-sm py-1";
  const dt = `${TYPE.cardLabel} w-20 shrink-0 pt-px`;

  return (
    <div className="max-w-workspace px-4 lg:px-8 py-6 lg:py-8">
      <RailEntity type="constituent" id={c.id} label={name} />
      <PageHeader
        title={name}
        breadcrumb={[{ label: "Donors & Funders", href: "/admin/fundraising/donors-funders" }]}
        chips={
          <>
            <IdentityChip>{c.type === "organization" ? "Organization" : "Person"}</IdentityChip>
            <IdentityChip>
              <span title={LIFECYCLE_HELP[stage]}>{LIFECYCLE_LABELS[stage]} donor</span>
            </IdentityChip>
            {sinceYear ? <IdentityChip>Donor since {sinceYear}</IdentityChip> : null}
            {activePlan ? <IdentityChip>Monthly {money(Number(activePlan.amount))}</IdentityChip> : null}
            <OwnerChip
              entity="constituents"
              id={c.id}
              ownerId={(c.owner_id as string | null | undefined) ?? null}
              members={members}
              meId={ctx.userId}
              canEdit={canAssign}
            />
            {c.do_not_contact ? (
              <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-expense-bg text-expense text-[13px] font-semibold">Do not contact</span>
            ) : null}
            {c.archived_at ? (
              <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-tile border border-hairline text-ink-2 text-[13px] font-semibold">Archived</span>
            ) : null}
          </>
        }
        secondaryActions={
          // Phone (DonorPhone.dc.html): Call and Email sit by the name.
          !c.do_not_contact && (phone || email) ? (
            <span className="flex gap-2 sm:hidden">
              {phone ? (
                <ButtonLink href={`tel:${phone}`} variant="secondary" size="lg">
                  Call
                </ButtonLink>
              ) : null}
              {email ? (
                <ButtonLink href={`mailto:${email}`} variant="secondary" size="lg">
                  Email
                </ButtonLink>
              ) : null}
            </span>
          ) : null
        }
        moreActions={[
          { label: "Edit contact details", href: "#contact" },
          { label: "Open asks in Pipeline", href: "/admin/fundraising/pipeline" },
          ...(hubspotId
            ? [{ label: hasBrief ? "Research brief" : "Run research", href: `/admin/fundraising/prospects/by-hubspot/${hubspotId}` }]
            : []),
          { label: "Journeys", href: "#journeys" },
          { label: "Tasks for this donor", href: "#tasks" },
          { label: "Documents", href: "#documents" },
          { label: "Household", href: "#household" },
          { label: "Thank-yous waiting", href: "/admin/fundraising/acknowledgments" },
          { label: "Archive, merge or delete", href: "#record" },
        ]}
        primaryAction={<RecordGiftButton constituentId={c.id} />}
      />

      <NextStepActions
        oppId={stepOpp?.id ?? null}
        title={nextMove?.next_step ? asSentence(nextMove.next_step) : null}
        due={stepDue ? { text: stepDue.text, late: stepDue.late } : undefined}
        dueISO={nextMove?.next_step_due ?? null}
        meta={stepMeta}
        today={today}
        emptyAction={
          <ButtonLink key="pipe" href="/admin/fundraising/pipeline" variant="secondary" size="lg">
            Open Pipeline
          </ButtonLink>
        }
      />

      <SummaryStrip label="Giving summary">
        <Figure
          label="Lifetime giving"
          value={money(summary.lifetime)}
          compare={recognitionReceived > 0 ? `${money(recognition)} with soft credits` : undefined}
          source={
            summary.count > 0
              ? `From ${summary.count} gift${summary.count === 1 ? "" : "s"} since ${sinceYear}, as of now`
              : "No gifts recorded yet, as of now"
          }
        />
        <Figure
          label="Last gift"
          value={lastGiftRow ? money(lastGiftRow.amount) : null}
          source={
            lastGiftRow
              ? `${shortDay(lastGiftRow.gift_date, today)} by ${(METHOD_LABEL[lastGiftRow.method] ?? lastGiftRow.method).toLowerCase()}. ${
                  lastGiftRow.acknowledgment_status === "sent"
                    ? "Thanked"
                    : lastGiftRow.acknowledgment_status === "pending"
                      ? "Thank-you pending"
                      : "No thank-you needed"
                }`
              : "Shows here after the first gift"
          }
        />
        <Figure
          label="Given this year"
          value={money(summary.thisYear.total)}
          compare={`vs ${money(summary.lastYear.total)} last year`}
          source={`${summary.thisYear.count} gift${summary.thisYear.count === 1 ? "" : "s"}, Jan 1 to today${yoy ? `. ${yoy}` : ""}`}
        />
        <Figure
          label="Open asks"
          value={money(openAskTotal)}
          source={`${openOpps.length} ask${openOpps.length === 1 ? "" : "s"}. From Pipeline, as of now`}
          href="#asks"
        />
      </SummaryStrip>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        {/* ── Left: the one timeline, then the record's tasks and comments ── */}
        <div className="grid gap-4 min-w-0">
          {hsCommsError ? (
            <Notice tone="partial" title="HubSpot emails and calls are missing from this timeline.">
              The mirror could not be read. Try a sync, then reload.
            </Notice>
          ) : null}
          <Timeline
            title="Activity"
            entries={entries}
            filters={timelineFilters}
            emptyText="No activity yet. Gifts, logged calls, emails, meetings and thank-yous appear here."
            composer={
              <div className="flex flex-wrap items-center gap-2">
                <LogInteractionForm constituentId={c.id} />
                <LogThankYou
                  subjectType="constituent"
                  subjectId={c.id}
                  subjectLabel={name}
                  defaultChannel={(c.preferred_ack_channel as AckChannel | null) ?? null}
                />
                {captureEnabled && <RecordButton context={{ type: "constituent", id: c.id, name }} />}
              </div>
            }
            footer={
              allEntries.length > TIMELINE_CAP ? (
                <>
                  <span className={TYPE.bodyMuted}>
                    {showAll
                      ? `Showing all ${allEntries.length}`
                      : `Showing the latest ${TIMELINE_CAP} of ${allEntries.length}${sinceYear ? ` since ${sinceYear}` : ""}`}
                  </span>
                  <ButtonLink
                    href={showAll ? `/admin/fundraising/donors-funders/${c.id}` : `/admin/fundraising/donors-funders/${c.id}?activity=all`}
                    variant="secondary"
                    size="md"
                  >
                    {showAll ? "Show the latest" : "Show older"}
                  </ButtonLink>
                </>
              ) : undefined
            }
          />
          <div id="tasks" className="scroll-mt-24">
            <EntityTasks entityType="constituent" entityId={c.id} entityLabel={name} defaultCategory="fundraising" />
          </div>
          <CommentThread entityType="constituent" entityId={c.id} entityLabel={name} />
        </div>

        {/* ── Right: compact context panels ── */}
        <div className="grid gap-4 min-w-0">
          <section id="contact" aria-label="Contact" className={`${panel} scroll-mt-24`}>
            <div className={panelHead}>
              <h2 className={TYPE.subsectionTitle}>Contact</h2>
            </div>
            <dl className="px-4 pb-2">
              <div className={row}>
                <dt className={dt}>Email</dt>
                <dd className="min-w-0 break-words">{email ? <a href={`mailto:${email}`} className="underline underline-offset-2">{email}</a> : <span className="text-ink-2">None on file</span>}</dd>
              </div>
              <div className={row}>
                <dt className={dt}>Phone</dt>
                <dd>{phone ?? <span className="text-ink-2">None on file</span>}</dd>
              </div>
              <div className={row}>
                <dt className={dt}>Address</dt>
                <dd className="min-w-0 break-words">
                  {[c.street, c.city, c.state, c.postal_code].filter(Boolean).join(", ") || <span className="text-ink-2">None on file</span>}
                </dd>
              </div>
              {c.do_not_contact ? (
                <div className={row}>
                  <dt className={dt}>Prefers</dt>
                  <dd className="font-semibold text-expense">Do not contact.</dd>
                </div>
              ) : null}
              <div className={row}>
                <dt className={dt}>Source</dt>
                <dd className="capitalize">{c.source}</dd>
              </div>
              {((c.tags as string[]) ?? []).length > 0 ? (
                <div className={row}>
                  <dt className={dt}>Tags</dt>
                  <dd className="min-w-0 break-words">{(c.tags as string[]).join(", ")}</dd>
                </div>
              ) : null}
            </dl>
            {c.notes ? <p className={`${TYPE.bodyMuted} px-4 pb-2`}>{c.notes}</p> : null}
            <div className="px-4 pb-4 grid gap-2">
              <AckChannelPref constituentId={c.id} current={(c.preferred_ack_channel as string | null) ?? null} />
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
          </section>

          <section id="asks" aria-label="Open asks" className={`${panel} scroll-mt-24`}>
            <div className={panelHead}>
              <h2 className={TYPE.subsectionTitle}>Open asks</h2>
            </div>
            {openOpps.length === 0 ? (
              <p className={`${TYPE.bodyMuted} px-4 pb-4`}>No open asks.</p>
            ) : (
              <ul className="px-4 pb-2 divide-y divide-hairline">
                {openOpps.map((o) => {
                  const u = cardUrgency(
                    { id: o.id, label: o.name ?? name, constituentName: name, stage: o.stage, askAmount: o.ask_amount, expectedClose: o.expected_close, nextStep: o.next_step, nextStepDue: o.next_step_due, owner: o.owner },
                    "open",
                    today,
                  );
                  return (
                    <li key={o.id} className="py-2">
                      <Link href={`/admin/fundraising/pipeline/${o.id}`} className="flex flex-col gap-0.5 hover:underline underline-offset-2">
                        <span className="flex justify-between gap-2 text-sm font-semibold text-ink-1">
                          <span className="truncate">{o.name ?? "Ask"}</span>
                          <span className="tabular-nums">{o.ask_amount ? money(Number(o.ask_amount)) : "No amount"}</span>
                        </span>
                        <span className={TYPE.metadata}>
                          <span className="capitalize">{o.stage.replace(/_/g, " ")}</span>
                          {o.expected_close ? `. Expected by ${shortDay(o.expected_close, today)}` : ""}
                        </span>
                        <span className={`text-xs ${u.tone === "late" || u.tone === "missing" ? "text-status-critical-text font-semibold" : "text-ink-2"}`}>
                          {u.tone === "late" ? `Next step ${u.text}` : u.text}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="px-4 pb-4">
              <ButtonLink href="/admin/fundraising/pipeline" variant="secondary" size="md">
                Open in Pipeline
              </ButtonLink>
            </div>
          </section>

          {reedEnabled && (
            <NextMovePanel
              entityType="constituent"
              entityId={c.id}
              entityLabel={name}
              email={email}
            />
          )}

          <section aria-label="Giving" className={panel}>
            <div className={panelHead}>
              <h2 className={TYPE.subsectionTitle}>Giving</h2>
            </div>
            <div className="px-4 pb-4 grid gap-2 text-sm">
              <p>
                <span className="font-semibold">{LIFECYCLE_LABELS[stage]}.</span>{" "}
                <span className="text-ink-2">{LIFECYCLE_HELP[stage]}</span>
              </p>
              {engagement.band !== "none" ? (
                <p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ENG_STYLES[engagement.band]}`}>
                    Engagement {engagement.score} of 100, {BAND_LABEL[engagement.band].toLowerCase()}
                  </span>
                </p>
              ) : null}
              {flags.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {flags.map((f) => (
                    <li key={f} title={FLAG_HELP[f]} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${FLAG_STYLES[f]}`}>
                      {FLAG_LABELS[f]}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-ink-2">
                {summary.firstDate ? `First gift ${fmtDate(summary.firstDate)}. ` : ""}
                {pendingAcks > 0 ? (
                  <Link href="/admin/fundraising/acknowledgments" className="font-semibold text-ink-1 underline underline-offset-2">
                    {pendingAcks} gift{pendingAcks === 1 ? "" : "s"} waiting for a thank-you
                  </Link>
                ) : (
                  "Every gift is thanked."
                )}
              </p>
            </div>
          </section>

          {c.type === "organization" && (
            <CompanyPanel
              constituentId={c.id}
              orgId={ctx.orgId}
              companyStage={(c.company_stage as string | null) ?? null}
              domains={(c.domains as string[] | null) ?? []}
              hubspotCompanyId={typeof extIds["hubspot_company"] === "string" ? (extIds["hubspot_company"] as string) : null}
            />
          )}

          <Donor360Extras
            compact
            constituentId={c.id}
            name={name}
            whyMatters={(c.why_matters as string | null) ?? null}
            history={fullHistory.map((g) => ({ gift_date: g.gift_date, amount: Number(g.amount) }))}
          />

          <section id="household" aria-label="Household" className={`${panel} scroll-mt-24`}>
            <div className={panelHead}>
              <h2 className={TYPE.subsectionTitle}>Household{household ? `: ${household.name}` : ""}</h2>
            </div>
            <div className="px-4 pb-4 grid gap-3">
              {!household && (
                <p className={TYPE.bodyMuted}>
                  Not in a household. Create one to roll up giving for spouses or family, or join an existing household.
                </p>
              )}
              {recognitionReceived > 0 ? (
                <p className={TYPE.bodyMuted}>Soft credits received: {money(recognitionReceived)}.</p>
              ) : null}
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

          <section aria-label="Recurring" className={panel}>
            <div className={panelHead}>
              <h2 className={TYPE.subsectionTitle}>Recurring</h2>
            </div>
            {plans.length === 0 ? (
              <p className={`${TYPE.bodyMuted} px-4 pb-4`}>
                No recurring plans. Stripe monthly donations create plans automatically; add a manual plan on the
                Recurring page for offline standing gifts.
              </p>
            ) : (
              <ul className="px-4 pb-3 divide-y divide-hairline">
                {plans.map((p) => (
                  <li key={p.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold tabular-nums">
                      {money(Number(p.amount))}
                      <span className="text-ink-2 font-normal">/{p.frequency.slice(0, 2)}</span>
                    </span>
                    <span className="text-ink-2 capitalize">{p.status}</span>
                    {p.external_source === "manual" && <span className="text-ink-2">manual</span>}
                    {p.last_payment_failed_at && p.status === "active" && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense">Payment failed</span>
                    )}
                    <span className={`ml-auto ${TYPE.metadata}`}>{p.last_charged_at ? `Last ${fmtWhen(p.last_charged_at)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {hubspotId && (
            <section aria-label="Pledges from HubSpot" className={panel}>
              <div className={panelHead}>
                <h2 className={TYPE.subsectionTitle}>Pledges</h2>
                <span className={TYPE.metadata}>From HubSpot</span>
              </div>
              {hsPledgesError ? (
                <p className={`${TYPE.bodyMuted} px-4 pb-4`}>HubSpot deals are unavailable right now. Try a sync, then reload.</p>
              ) : hsPledges.length === 0 ? (
                <p className={`${TYPE.bodyMuted} px-4 pb-4`}>No HubSpot deals linked to this donor.</p>
              ) : (
                <ul className="px-4 pb-3 divide-y divide-hairline">
                  {hsPledges.map((p) => (
                    <li key={p.id} className="py-2 flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-ink-2">{PLEDGE_STATUS_LABEL[p.status]}</span>
                      <span className="font-semibold tabular-nums">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Journeys (spec Phase 2/3): which sequences this donor is in. */}
          <section id="journeys" aria-label="Journeys" className={`${panel} scroll-mt-24`}>
            <div className={panelHead}>
              <h2 className={TYPE.subsectionTitle}>Journeys</h2>
              <Link href="/admin/fundraising/journeys" className="text-xs font-semibold text-ink-2 hover:text-ink-1 underline underline-offset-2">
                Manage
              </Link>
            </div>
            <div className="px-4 pb-4 grid gap-2">
              {enrollments.length === 0 ? (
                <p className={TYPE.bodyMuted}>Not enrolled in any journey. Journeys are triggered, multi-step email sequences.</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {activeEnrollments.map((e) => {
                    const totalSteps = stepTotals.get(e.journey_id) ?? 0;
                    const upcoming = Math.min(e.current_step + 1, Math.max(totalSteps, 1));
                    const journeyPaused = e.journey?.status === "paused";
                    return (
                      <li key={e.id} className="py-2 grid gap-1 text-sm">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{e.journey?.name ?? "(journey removed)"}</span>
                          <CancelEnrollment enrollmentId={e.id} journeyName={e.journey?.name ?? "This journey"} />
                        </span>
                        <span className={TYPE.metadata}>
                          Active{e.journey ? `, ${TRIGGER_LABEL[e.journey.trigger] ?? e.journey.trigger}` : ""}. Step {upcoming} of {totalSteps || "?"}.{" "}
                          {journeyPaused ? "Sends held while the journey is paused." : e.next_run_at ? `Next send ${fmtWhen(e.next_run_at)}.` : ""}
                        </span>
                      </li>
                    );
                  })}
                  {pastEnrollments.map((e) => {
                    const totalSteps = stepTotals.get(e.journey_id) ?? 0;
                    const done = e.status === "completed";
                    return (
                      <li key={e.id} className="py-2 grid gap-1 text-sm">
                        <span className="text-ink-2">{e.journey?.name ?? "(journey removed)"}</span>
                        <span className={TYPE.metadata}>
                          {done
                            ? `Completed, ${totalSteps || e.current_step} step${(totalSteps || e.current_step) === 1 ? "" : "s"}${e.last_step_at ? `, finished ${fmtWhen(e.last_step_at)}` : ""}`
                            : `Cancelled, ${e.current_step} of ${totalSteps || "?"} steps sent, enrolled ${fmtWhen(e.enrolled_at)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <EnrollInJourney
                constituentId={c.id}
                journeys={activeJourneys}
                enrolledJourneyIds={activeEnrollments.map((e) => e.journey_id)}
                disabledReason={enrollBlockedReason}
              />
            </div>
          </section>

          <div id="documents" className="scroll-mt-24">
            <EntityDocuments entityType="constituent" entityId={c.id} entityLabel={name} />
          </div>

          <section id="record" aria-label="Record" className={`${panel} scroll-mt-24`}>
            <div className={panelHead}>
              <h2 className={TYPE.subsectionTitle}>Record</h2>
            </div>
            <div className="px-4 pb-4">
              <ConstituentDangerZone id={c.id} name={name} archived={!!c.archived_at} hasGifts={allDates.length > 0} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
