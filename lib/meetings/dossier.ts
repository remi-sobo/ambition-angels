import type { SupabaseClient } from "@supabase/supabase-js";
import { constituentName } from "@/lib/fundraising/display";
import { externalEmails, matchAttendees, orgEmailDomain } from "./match";
import type { MatchedEntity } from "./types";

/**
 * Meeting-prep dossiers (Reed meeting-agenda flow).
 *
 * One implementation, two callers: Reed's read-only tools (lib/agents/reed/tools.ts)
 * and the upcoming-meeting detail page (app/admin/meetings/upcoming/[eventId]).
 * Everything runs on the SESSION client passed in, so RLS scopes every row to the
 * viewer — the same rule the rest of the meetings surface follows. Every query
 * ALSO carries an explicit org_id fence so a future caller on the service-role
 * client (which bypasses RLS) can't silently widen these reads. The pure
 * shaping helpers (summarizeGiving / toAgendaEntities / shapeInteraction) carry the
 * logic worth unit-testing; the load* functions are thin I/O over them.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── pure shaping ────────────────────────────────────────────────────────────

export type GivingSummary = {
  lifetime_total: number;
  gift_count: number;
  first_gift_date: string | null;
  last_gift_date: string | null;
  largest_gift: number;
};

/** Lifetime giving rollup from raw gift rows. Pure — unit-tested. */
export function summarizeGiving(gifts: Array<{ amount: number; gift_date: string }>): GivingSummary {
  const amounts = gifts.map((g) => Number(g.amount));
  const dates = gifts.map((g) => g.gift_date).filter(Boolean).sort();
  return {
    lifetime_total: round2(amounts.reduce((s, a) => s + a, 0)),
    gift_count: gifts.length,
    first_gift_date: dates[0] ?? null,
    last_gift_date: dates[dates.length - 1] ?? null,
    largest_gift: round2(amounts.reduce((m, a) => (a > m ? a : m), 0)),
  };
}

export type AgendaEntity = {
  type: "constituent" | "partner";
  id: string;
  name: string;
  prior_touchpoints: number;
  is_first_meeting: boolean;
};

/**
 * Map matched attendees to agenda entities, attaching the prior-touchpoint count
 * that distinguishes a first meeting from a follow-up. Pure — unit-tested.
 */
export function toAgendaEntities(
  matched: MatchedEntity[],
  consCount: Map<string, number>,
  partCount: Map<string, number>,
): AgendaEntity[] {
  return matched.map((m) => {
    const prior = (m.type === "constituent" ? consCount.get(m.id) : partCount.get(m.id)) ?? 0;
    return { type: m.type, id: m.id, name: m.name, prior_touchpoints: prior, is_first_meeting: prior === 0 };
  });
}

export type ShapedInteraction = {
  kind: string;
  occurred_at: string;
  direction: string | null;
  subject: string | null;
  preview: string | null;
  is_private: boolean;
};

/**
 * Shape one interaction row for prep, redacting private bodies — surface that a
 * private interaction happened, never its content. Pure — unit-tested.
 */
export function shapeInteraction(it: {
  kind: string;
  occurred_at: string;
  direction?: string | null;
  subject?: string | null;
  body_preview?: string | null;
  notes?: string | null;
  is_private?: boolean | null;
}): ShapedInteraction {
  const isPrivate = Boolean(it.is_private);
  return {
    kind: it.kind,
    occurred_at: it.occurred_at,
    direction: it.direction ?? null,
    subject: isPrivate ? "(private)" : it.subject ?? null,
    preview: isPrivate ? null : (it.body_preview ?? it.notes ?? null)?.slice(0, 280) ?? null,
    is_private: isPrivate,
  };
}

// ── I/O (RLS-scoped session client) ─────────────────────────────────────────

export type ConstituentDossier = {
  id: string;
  profile: {
    name: string;
    type: string;
    emails: string[];
    tags: string[];
    location: string | null;
    do_not_contact: boolean;
    notes: string | null;
  };
  giving: GivingSummary;
  recurring_plans: Array<{ amount: number; frequency: string; status: string }>;
  recent_interactions: ShapedInteraction[];
  open_opportunities: Array<{
    name: string | null;
    stage: string;
    next_step: string | null;
    next_step_due: string | null;
    ask_amount: number | null;
    expected_close: string | null;
  }>;
};

export async function loadConstituentDossier(
  sb: SupabaseClient,
  orgId: string,
  id: string,
  historyLimit = 15,
): Promise<ConstituentDossier | null> {
  const limit = Math.min(40, Math.max(1, Math.trunc(historyLimit)));
  const [cRes, giftsRes, plansRes, interRes, oppsRes] = await Promise.all([
    sb.from("constituents").select("id, type, first_name, last_name, org_name, emails, tags, city, state, do_not_contact, notes").eq("org_id", orgId).eq("id", id).maybeSingle(),
    sb.from("gifts").select("amount, gift_date").eq("org_id", orgId).eq("constituent_id", id).order("gift_date", { ascending: false }).limit(1000),
    sb.from("recurring_plans").select("amount, frequency, status").eq("org_id", orgId).eq("constituent_id", id).eq("status", "active"),
    sb.from("interactions").select("kind, occurred_at, direction, subject, body_preview, notes, is_private").eq("org_id", orgId).eq("constituent_id", id).order("occurred_at", { ascending: false }).limit(limit),
    sb.from("opportunities").select("name, stage, next_step, next_step_due, ask_amount, expected_close").eq("org_id", orgId).eq("constituent_id", id).neq("stage", "lost").order("next_step_due", { ascending: true, nullsFirst: false }).limit(20),
  ]);
  if (!cRes.data) return null;

  const c = cRes.data as {
    id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null;
    emails: string[] | null; tags: string[] | null; city: string | null; state: string | null;
    do_not_contact: boolean; notes: string | null;
  };
  const gifts = ((giftsRes.data ?? []) as Array<{ amount: number; gift_date: string }>).map((g) => ({ amount: Number(g.amount), gift_date: g.gift_date }));

  return {
    id: c.id,
    profile: {
      name: constituentName(c),
      type: c.type,
      emails: c.emails ?? [],
      tags: c.tags ?? [],
      location: [c.city, c.state].filter(Boolean).join(", ") || null,
      do_not_contact: c.do_not_contact,
      notes: c.notes ?? null,
    },
    giving: summarizeGiving(gifts),
    recurring_plans: (plansRes.data ?? []).map((p) => ({
      amount: Number((p as { amount: number }).amount),
      frequency: (p as { frequency: string }).frequency,
      status: (p as { status: string }).status,
    })),
    recent_interactions: ((interRes.data ?? []) as Array<Parameters<typeof shapeInteraction>[0]>).map(shapeInteraction),
    open_opportunities: ((oppsRes.data ?? []) as Array<{
      name: string | null; stage: string; next_step: string | null; next_step_due: string | null; ask_amount: number | null; expected_close: string | null;
    }>).map((o) => ({
      name: o.name,
      stage: o.stage,
      next_step: o.next_step,
      next_step_due: o.next_step_due,
      ask_amount: o.ask_amount == null ? null : Number(o.ask_amount),
      expected_close: o.expected_close,
    })),
  };
}

export type PartnerDossier = {
  id: string;
  profile: {
    name: string;
    kind: string | null;
    status: string | null;
    champion: string | null;
    champion_email: string | null;
    program_type: string | null;
    teen_count: string | null;
    mou_status: string | null;
    mou_start: string | null;
    mou_end: string | null;
    referral: string | null;
    notes: string | null;
    last_touch_at: string | null;
  };
  recent_interactions: Array<{ kind: string; occurred_at: string; preview: string | null; logged_by: string | null }>;
};

export async function loadPartnerDossier(
  sb: SupabaseClient,
  orgId: string,
  id: string,
  historyLimit = 15,
): Promise<PartnerDossier | null> {
  const limit = Math.min(40, Math.max(1, Math.trunc(historyLimit)));
  const [pRes, interRes] = await Promise.all([
    sb.from("partners").select("name, kind, status, champion_name, champion_email, champion_role, teen_count, program_type, mou_status, mou_start, mou_end, referral, notes, last_touch_at").eq("org_id", orgId).eq("id", id).maybeSingle(),
    sb.from("partner_interactions").select("kind, occurred_at, notes, logged_by").eq("org_id", orgId).eq("partner_id", id).order("occurred_at", { ascending: false }).limit(limit),
  ]);
  if (!pRes.data) return null;
  const p = pRes.data as Record<string, unknown>;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);

  return {
    id,
    profile: {
      name: str("name") ?? "Partner",
      kind: str("kind"),
      status: str("status"),
      champion: [str("champion_name"), str("champion_role")].filter(Boolean).join(" — ") || null,
      champion_email: str("champion_email"),
      program_type: str("program_type"),
      teen_count: str("teen_count"),
      mou_status: str("mou_status"),
      mou_start: str("mou_start"),
      mou_end: str("mou_end"),
      referral: str("referral"),
      notes: str("notes"),
      last_touch_at: str("last_touch_at"),
    },
    recent_interactions: ((interRes.data ?? []) as Array<{ kind: string; occurred_at: string; notes: string | null; logged_by: string | null }>).map((it) => ({
      kind: it.kind,
      occurred_at: it.occurred_at,
      preview: it.notes?.slice(0, 280) ?? null,
      logged_by: it.logged_by,
    })),
  };
}

export type MeetingBrief = {
  event_id: string;
  title: string | null;
  start: string;
  attendee_emails: string[];
  entities: AgendaEntity[];
};

/** Who an upcoming meeting is with + the first-vs-follow-up signal per entity. */
export async function loadMeetingBrief(
  sb: SupabaseClient,
  orgId: string,
  eventId: string,
): Promise<MeetingBrief | null> {
  const { data: ev } = await sb
    .from("calendar_events")
    .select("id, title, start_time, attendees")
    .eq("org_id", orgId)
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return null;

  const e = ev as { title: string | null; start_time: string; attendees: Array<{ email?: string | null }> | null };
  const domain = await orgEmailDomain(sb, orgId);
  const emails = externalEmails(e.attendees ?? null, domain);
  const matched = await matchAttendees(sb, orgId, emails);

  const nowIso = new Date().toISOString();
  const consIds = matched.filter((m) => m.type === "constituent").map((m) => m.id);
  const partIds = matched.filter((m) => m.type === "partner").map((m) => m.id);
  const consCount = new Map<string, number>();
  const partCount = new Map<string, number>();
  if (consIds.length) {
    const { data } = await sb.from("interactions").select("constituent_id").eq("org_id", orgId).in("constituent_id", consIds).lte("occurred_at", nowIso);
    for (const r of (data ?? []) as Array<{ constituent_id: string }>) consCount.set(r.constituent_id, (consCount.get(r.constituent_id) ?? 0) + 1);
  }
  if (partIds.length) {
    const { data } = await sb.from("partner_interactions").select("partner_id").eq("org_id", orgId).in("partner_id", partIds).lte("occurred_at", nowIso);
    for (const r of (data ?? []) as Array<{ partner_id: string }>) partCount.set(r.partner_id, (partCount.get(r.partner_id) ?? 0) + 1);
  }

  return {
    event_id: eventId,
    title: e.title,
    start: e.start_time,
    attendee_emails: emails,
    entities: toAgendaEntities(matched, consCount, partCount),
  };
}

export type SavedAgenda = { agenda: string; generatedAt: string };

/**
 * The latest agenda Reed produced for this meeting — read straight from the
 * meeting-agenda thread it persisted (no separate store). RLS-scoped to the viewer.
 */
export async function loadLatestMeetingAgenda(
  sb: SupabaseClient,
  eventId: string,
): Promise<SavedAgenda | null> {
  const { data: threads } = await sb
    .from("reed_threads")
    .select("id, created_at")
    .eq("surface", "meeting_agenda")
    .eq("context_ref->>event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1);
  const thread = (threads ?? [])[0] as { id: string } | undefined;
  if (!thread) return null;

  const { data: msgs } = await sb
    .from("reed_messages")
    .select("content, created_at")
    .eq("thread_id", thread.id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1);
  const msg = (msgs ?? [])[0] as { content: string; created_at: string } | undefined;
  if (!msg || !msg.content.trim()) return null;
  return { agenda: msg.content, generatedAt: msg.created_at };
}
