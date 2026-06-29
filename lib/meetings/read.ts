import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";
import { externalEmails, matchAttendees, orgEmailDomain } from "./match";
import {
  loadConstituentDossier,
  loadLatestMeetingAgenda,
  loadMeetingBrief,
  loadPartnerDossier,
  type ConstituentDossier,
  type MeetingBrief,
  type PartnerDossier,
  type SavedAgenda,
} from "./dossier";
import type {
  MatchedEntity,
  MeetingRecord,
  MeetingSuggestedTask,
} from "./types";

/**
 * Read side of the meetings surface. Goes through the SESSION client so RLS
 * scopes every row to the viewer (owner-or-grantee, within org) — the same
 * delegation-aware path the Agenda layer uses. No service-role here.
 */

export type MeetingListItem = { record: MeetingRecord; matched: MatchedEntity[] };
export type UpcomingMeeting = {
  eventId: string;
  title: string | null;
  start: string;
  matched: MatchedEntity[];
};

type Attendee = { email?: string | null };

// Matched entities for a set of meeting records, read back from the timelines
// the matcher already wrote (so the list reflects what's actually on profiles).
async function matchedByRecord(
  sb: ReturnType<typeof createServerSupabase>,
  recordIds: string[]
): Promise<Map<string, MatchedEntity[]>> {
  const out = new Map<string, MatchedEntity[]>();
  if (recordIds.length === 0) return out;

  const { data: inters } = await sb
    .from("interactions")
    .select("external_id, constituent_id, matched_email")
    .eq("external_source", "meeting")
    .in("external_id", recordIds);
  const { data: pInters } = await sb
    .from("partner_interactions")
    .select("external_id, partner_id")
    .eq("external_source", "meeting")
    .in("external_id", recordIds);

  const consRows = (inters ?? []) as Array<{ external_id: string; constituent_id: string; matched_email: string | null }>;
  const partRows = (pInters ?? []) as Array<{ external_id: string; partner_id: string }>;

  const consIds = Array.from(new Set(consRows.map((r) => r.constituent_id)));
  const partIds = Array.from(new Set(partRows.map((r) => r.partner_id)));

  const consName = new Map<string, string>();
  if (consIds.length) {
    const { data } = await sb
      .from("constituents")
      .select("id, type, first_name, last_name, org_name")
      .in("id", consIds);
    for (const c of (data ?? []) as Array<{ id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null }>) {
      consName.set(c.id, constituentName(c));
    }
  }
  const partName = new Map<string, string>();
  if (partIds.length) {
    const { data } = await sb.from("partners").select("id, name").in("id", partIds);
    for (const p of (data ?? []) as Array<{ id: string; name: string | null }>) {
      partName.set(p.id, p.name ?? "Partner");
    }
  }

  for (const r of consRows) {
    const list = out.get(r.external_id) ?? [];
    list.push({
      type: "constituent",
      id: r.constituent_id,
      name: consName.get(r.constituent_id) ?? "Donor",
      matchedEmail: r.matched_email,
    });
    out.set(r.external_id, list);
  }
  for (const r of partRows) {
    const list = out.get(r.external_id) ?? [];
    list.push({ type: "partner", id: r.partner_id, name: partName.get(r.partner_id) ?? "Partner", matchedEmail: null });
    out.set(r.external_id, list);
  }
  return out;
}

export async function listMeetings(now: Date): Promise<{
  past: MeetingListItem[];
  upcoming: UpcomingMeeting[];
}> {
  const sb = createServerSupabase();
  const ctx = await getOrgContext();
  if (!ctx) return { past: [], upcoming: [] };

  const { data: records } = await sb
    .from("meeting_records")
    .select("*")
    .lte("occurred_at", now.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(50);
  const past = (records ?? []) as MeetingRecord[];
  const matched = await matchedByRecord(sb, past.map((r) => r.id));

  // Upcoming external events straight off the calendar mirror (RLS-scoped).
  const { data: events } = await sb
    .from("calendar_events")
    .select("id, title, start_time, attendees, is_external, status")
    .eq("is_external", true)
    .gte("start_time", now.toISOString())
    .neq("status", "cancelled")
    .order("start_time", { ascending: true })
    .limit(25);
  const domain = await orgEmailDomain(sb, ctx.orgId);
  const upcoming: UpcomingMeeting[] = [];
  for (const ev of (events ?? []) as Array<{ id: string; title: string | null; start_time: string; attendees: Attendee[] | null }>) {
    const emails = externalEmails(ev.attendees, domain);
    const ents = await matchAttendees(sb, ctx.orgId, emails);
    upcoming.push({ eventId: ev.id, title: ev.title, start: ev.start_time, matched: ents });
  }

  return {
    past: past.map((record) => ({ record, matched: matched.get(record.id) ?? [] })),
    upcoming,
  };
}

export type MeetingDetail = {
  record: MeetingRecord;
  matched: MatchedEntity[];
  suggestions: MeetingSuggestedTask[];
  linkedTasks: Array<{ id: string; title: string; status: string }>;
  /** The agenda Reed drafted while this was still upcoming, if any — prep next to recap. */
  agenda: SavedAgenda | null;
};

export async function getMeetingDetail(id: string): Promise<MeetingDetail | null> {
  const sb = createServerSupabase();
  const ctx = await getOrgContext();
  if (!ctx) return null;

  const { data: record } = await sb.from("meeting_records").select("*").eq("id", id).maybeSingle();
  if (!record) return null;
  const rec = record as MeetingRecord;

  // Matched entities: recompute from the linked event's attendees when present
  // (covers events not yet fanned out); otherwise from the timeline rows.
  let matched: MatchedEntity[] = [];
  if (rec.calendar_event_id) {
    const { data: ev } = await sb
      .from("calendar_events")
      .select("attendees")
      .eq("id", rec.calendar_event_id)
      .maybeSingle();
    const domain = await orgEmailDomain(sb, ctx.orgId);
    const emails = externalEmails((ev as { attendees: Attendee[] | null } | null)?.attendees ?? null, domain);
    matched = await matchAttendees(sb, ctx.orgId, emails);
  } else {
    matched = (await matchedByRecord(sb, [rec.id])).get(rec.id) ?? [];
  }

  const { data: sugg } = await sb
    .from("meeting_suggested_tasks")
    .select("*")
    .eq("meeting_record_id", id)
    .order("created_at", { ascending: true });
  const { data: tasks } = await sb
    .from("ops_tasks")
    .select("id, title, status")
    .eq("meeting_record_id", id);

  // The agenda Reed drafted while this meeting was still upcoming lives on the
  // same calendar event, so prep and recap sit together on the record.
  const agenda = rec.calendar_event_id ? await loadLatestMeetingAgenda(sb, rec.calendar_event_id) : null;

  return {
    record: rec,
    matched,
    suggestions: (sugg ?? []) as MeetingSuggestedTask[],
    linkedTasks: (tasks ?? []) as Array<{ id: string; title: string; status: string }>,
    agenda,
  };
}

export type UpcomingMeetingDetail = {
  brief: MeetingBrief;
  constituents: ConstituentDossier[];
  partners: PartnerDossier[];
  agenda: SavedAgenda | null;
};

/**
 * Detail view for an UPCOMING calendar meeting: who it's with (the brief), each
 * matched donor/partner's dossier rendered inline, and the latest agenda Reed
 * produced for it. All session-client / RLS-scoped — a viewer without
 * fundraising/program read simply gets fewer dossiers, never another org's data.
 */
export async function getUpcomingMeetingDetail(eventId: string): Promise<UpcomingMeetingDetail | null> {
  const sb = createServerSupabase();
  const ctx = await getOrgContext();
  if (!ctx) return null;

  const brief = await loadMeetingBrief(sb, ctx.orgId, eventId);
  if (!brief) return null;

  const consIds = brief.entities.filter((e) => e.type === "constituent").map((e) => e.id);
  const partIds = brief.entities.filter((e) => e.type === "partner").map((e) => e.id);
  const [cons, parts, agenda] = await Promise.all([
    Promise.all(consIds.map((id) => loadConstituentDossier(sb, id))),
    Promise.all(partIds.map((id) => loadPartnerDossier(sb, id))),
    loadLatestMeetingAgenda(sb, eventId),
  ]);

  return {
    brief,
    constituents: cons.filter((d): d is ConstituentDossier => d !== null),
    partners: parts.filter((d): d is PartnerDossier => d !== null),
    agenda,
  };
}
