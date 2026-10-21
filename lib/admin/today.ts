import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { rankObligations, whyFallback, type ObligationRow } from "@/lib/admin/todayRank";
import { SOURCE_FALLBACK_HREF } from "@/lib/admin/actionQueue";
import { calendarDayFilter, todayInTZ } from "@/lib/admin/ops/week";
import { loadStewardshipRules } from "@/lib/fundraising/stewardship";
import { recordHref } from "@/lib/admin/needsYou";
import { ackTitle, buildAckFacts, orderAckSlots, type AckFacts, type AckGift } from "@/lib/admin/todayAck";

/**
 * Spec Home, stage H1 — Today's data spine. Every panel binds to something
 * that already exists (spec §Architecture); this module only composes.
 *
 * Reads:
 *  - Needs you: public.v_obligations through the SESSION client — the
 *    Contract 3 read, security_invoker, so RLS scopes it per caller and this
 *    loader can never see another org's obligations. Acknowledgment rows are
 *    then named from their gift + donor (session client, org-fenced) and
 *    re-dated from the stewardship matrix (lib/admin/todayAck.ts).
 *  - Orientation: today's CACHED briefing narrative row (service-role, org
 *    fence). A cache miss composes a deterministic line from the obligation
 *    data instead of paying an LLM call on page load — the cron pre-warms
 *    the real narrative.
 *  - My day: calendar_events for the signed-in user (service-role, org +
 *    owner fence — the house pattern) plus pending Reed drafts (session
 *    client; status='drafted' means awaiting a human).
 *
 * The Money and Mission tiles read their canonical loaders directly from the
 * page (getFinanceSnapshot / the <Metric> primitive) — one function per
 * number, per Contract 1.
 */

export type TodayObligation = ObligationRow & {
  source_id: string;
  /** why_it_matters, or the honest type-specific fallback. */
  why: string;
  /** True when `why` is the real recorded sentence, not the fallback. */
  whyRecorded: boolean;
  /** Deep link to the obligation's record when it has one (the popout's
   *  "Open full record"), else its source screen (the B2-piped map). */
  href: string;
  /** What the row points at (view columns), for the popout's panels. */
  related_entity_type: string | null;
  related_entity_id: string | null;
  /** Snoozable/resolvable per the A3 dispatch rules. */
  snoozable: boolean;
  resolvable: boolean;
  /** Acknowledgment rows only: the gift + donor behind the thank-you. */
  gift?: AckFacts;
  amount?: number;
};

type ViewRow = ObligationRow & { related_entity_type: string | null; related_entity_id: string | null };

// capture (C5) snoozes from Today but is never "Done" here: resolving a
// capture discards the cards still waiting, which belongs on its own page
// where you can see them, not behind a one-tap button.
const SNOOZABLE = new Set(["ops_task", "grant_requirement", "compliance_item", "capture"]);
const RESOLVABLE = new Set(["ops_task", "grant_requirement", "compliance_item", "acknowledgment"]);

export type TodayEvent = { id: string; title: string; start: string; end: string; allDay: boolean };

export type TodayData = {
  todayISO: string;
  /** Ranked, FULL list — the page slices to SHOW_CAP and offers "show all N"
   *  (open decision 1, resolved: expand-in-place). */
  obligations: TodayObligation[];
  orientation: { line: string; source: "briefing" | "composed" };
  myDay: { events: TodayEvent[]; pendingDrafts: number };
};

export const getTodayData = cache(async (): Promise<TodayData | null> => {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();
  const admin = getSupabaseAdmin();
  // The org's calendar day, not UTC's: after 5pm Pacific a UTC "today" is
  // already tomorrow, which flipped due-today rows to overdue a day early.
  const todayISO = todayInTZ();
  // The briefing cron keys its narrative by UTC date (lib/admin/briefing/narrate.ts).
  const briefDate = new Date().toISOString().slice(0, 10);

  const [obRes, narrativeRes, eventsRes, draftsRes] = await Promise.all([
    supabase
      .from("v_obligations")
      .select("id, type, title, why_it_matters, due_date, state, module, related_entity_type, related_entity_id")
      .eq("org_id", ctx.orgId)
      .limit(500),
    admin
      .from("bloomos_briefing_narrative")
      .select("headline")
      .eq("org_id", ctx.orgId)
      .eq("brief_date", briefDate)
      .maybeSingle(),
    // Org + owner fence: service-role read, scoped like the agenda reads.
    admin
      .from("calendar_events")
      .select("id, title, start_time, end_time, all_day")
      .eq("org_id", ctx.orgId)
      .eq("owner_user_id", ctx.userId)
      .neq("status", "cancelled")
      .or(calendarDayFilter(todayISO))
      .order("start_time", { ascending: true })
      .limit(8),
    supabase
      .from("reed_drafts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("status", "drafted"),
  ]);

  const viewRows = (obRes.data ?? []) as ViewRow[];
  const ackFacts = await loadAckFacts(
    supabase,
    ctx.orgId,
    viewRows.filter((r) => r.type === "acknowledgment" && r.related_entity_id).map((r) => r.related_entity_id!),
  );
  const rows = viewRows.map((r): ViewRow & { gift?: AckFacts; amount?: number } => {
    const gift = r.type === "acknowledgment" && r.related_entity_id ? ackFacts.get(r.related_entity_id) : undefined;
    return gift
      ? { ...r, title: ackTitle(gift, todayISO), due_date: gift.dueDate, gift, amount: gift.amount }
      : r;
  });
  const ranked = orderAckSlots(rankObligations(rows, todayISO), todayISO).map((r): TodayObligation => {
    const sourceId = r.id.slice(r.id.indexOf(":") + 1);
    const why = r.why_it_matters?.trim() || whyFallback(r, todayISO);
    return {
      ...r,
      source_id: sourceId,
      why,
      whyRecorded: Boolean(r.why_it_matters?.trim()),
      href:
        recordHref({ ...r, source_id: sourceId, constituent_id: r.gift?.constituentId }) ??
        SOURCE_FALLBACK_HREF[r.type as keyof typeof SOURCE_FALLBACK_HREF] ??
        "/admin",
      snoozable: SNOOZABLE.has(r.type),
      resolvable: RESOLVABLE.has(r.type),
    };
  });

  const overdue = ranked.filter((r) => r.due_date && r.due_date < todayISO).length;
  const dueToday = ranked.filter((r) => r.due_date === todayISO).length;
  const headline = (narrativeRes.data?.headline as string | null | undefined)?.trim();
  const composed =
    ranked.length === 0
      ? "Nothing needs you right now."
      : `${ranked.length} thing${ranked.length === 1 ? "" : "s"} need${ranked.length === 1 ? "s" : ""} you` +
        (overdue ? `: ${overdue} overdue` : "") +
        (dueToday ? `${overdue ? "," : ":"} ${dueToday} due today` : "") +
        ".";

  return {
    todayISO,
    obligations: ranked,
    orientation: headline
      ? { line: headline, source: "briefing" }
      : { line: composed, source: "composed" },
    myDay: {
      events: ((eventsRes.data ?? []) as { id: string; title: string; start_time: string; end_time: string; all_day: boolean }[]).map(
        (e) => ({ id: e.id, title: e.title, start: e.start_time, end: e.end_time, allDay: e.all_day }),
      ),
      pendingDrafts: draftsRes.count ?? 0,
    },
  };
});

/**
 * The gift + donor facts behind each pending acknowledgment. Session client
 * (RLS) AND an explicit org fence: RLS is permission-scoped, so a member of
 * several orgs could otherwise read another of their orgs' gifts here. A
 * failed read degrades to the view's plain "Thank-you due" rows.
 */
async function loadAckFacts(
  supabase: ReturnType<typeof createServerSupabase>,
  orgId: string,
  giftIds: string[],
): Promise<Map<string, AckFacts>> {
  if (giftIds.length === 0) return new Map();
  const { data: giftData, error } = await supabase
    .from("gifts")
    .select(
      "id, amount, gift_date, method, external_source, recurring_plan_id, constituent_id, constituent:constituents(type, first_name, last_name, org_name, emails)",
    )
    .eq("org_id", orgId)
    .in("id", giftIds);
  if (error) {
    console.error("[today] acknowledgment gifts read failed:", error.message);
    return new Map();
  }
  const gifts = ((giftData ?? []) as unknown as AckGift[]).map((g) => ({ ...g, amount: Number(g.amount) }));
  const donorIds = Array.from(new Set(gifts.map((g) => g.constituent_id).filter((id): id is string => Boolean(id))));
  const [historyRes, rules] = await Promise.all([
    donorIds.length
      ? supabase
          .from("gifts")
          .select("id, constituent_id, gift_date")
          .eq("org_id", orgId)
          .in("constituent_id", donorIds)
      : Promise.resolve({ data: [], error: null }),
    loadStewardshipRules(supabase, orgId),
  ]);
  if (historyRes.error) console.error("[today] gift history read failed:", historyRes.error.message);
  const history = (historyRes.data ?? []) as { id: string; constituent_id: string | null; gift_date: string }[];
  return buildAckFacts(gifts, history, rules);
}
