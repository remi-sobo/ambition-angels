import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { rankObligations, whyFallback, type ObligationRow } from "@/lib/admin/todayRank";
import { SOURCE_FALLBACK_HREF } from "@/lib/admin/actionQueue";

/**
 * Spec Home, stage H1 — Today's data spine. Every panel binds to something
 * that already exists (spec §Architecture); this module only composes.
 *
 * Reads:
 *  - Needs you: public.v_obligations through the SESSION client — the
 *    Contract 3 read, security_invoker, so RLS scopes it per caller and this
 *    loader can never see another org's obligations.
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
  /** Deep link to the obligation's source screen (the B2-piped map). */
  href: string;
  /** Snoozable/resolvable per the A3 dispatch rules. */
  snoozable: boolean;
  resolvable: boolean;
};

const SNOOZABLE = new Set(["ops_task", "grant_requirement", "compliance_item"]);
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
  const todayISO = new Date().toISOString().slice(0, 10);
  const dayStart = `${todayISO}T00:00:00`;
  const dayEnd = `${todayISO}T23:59:59`;

  const [obRes, narrativeRes, eventsRes, draftsRes] = await Promise.all([
    supabase
      .from("v_obligations")
      .select("id, type, title, why_it_matters, due_date, state, module")
      .eq("org_id", ctx.orgId)
      .limit(500),
    admin
      .from("bloomos_briefing_narrative")
      .select("headline")
      .eq("org_id", ctx.orgId)
      .eq("brief_date", todayISO)
      .maybeSingle(),
    // Org + owner fence: service-role read, scoped like the agenda reads.
    admin
      .from("calendar_events")
      .select("id, title, start_time, end_time, all_day")
      .eq("org_id", ctx.orgId)
      .eq("owner_user_id", ctx.userId)
      .neq("status", "cancelled")
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd)
      .order("start_time", { ascending: true })
      .limit(8),
    supabase
      .from("reed_drafts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("status", "drafted"),
  ]);

  const rows = (obRes.data ?? []) as (ObligationRow & { id: string })[];
  const ranked = rankObligations(rows, todayISO).map((r): TodayObligation => {
    const sourceId = r.id.slice(r.id.indexOf(":") + 1);
    const why = r.why_it_matters?.trim() || whyFallback(r, todayISO);
    return {
      ...r,
      source_id: sourceId,
      why,
      whyRecorded: Boolean(r.why_it_matters?.trim()),
      href: SOURCE_FALLBACK_HREF[r.type as keyof typeof SOURCE_FALLBACK_HREF] ?? "/admin",
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
