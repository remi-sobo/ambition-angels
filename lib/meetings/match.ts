import type { SupabaseClient } from "@supabase/supabase-js";
import { constituentName } from "@/lib/fundraising/display";
import type { MatchedEntity } from "./types";

/**
 * Meeting attendee matcher (Phase 3) — extends the Gmail matcher pattern to
 * meetings, org-scoped, and adds the partner side the Gmail version never had.
 *
 * A calendar_event's external attendees are matched against constituents AND
 * partners; each match fans out to the existing timeline tables (interactions /
 * partner_interactions) keyed on the meeting record, so the donor/partner profile
 * gets the meeting. Idempotent on (external_source='meeting', external_id=record).
 *
 * The org_id filter is not optional: without it tenant A's meeting could match
 * tenant B's donor.
 */

type Attendee = { email?: string | null; displayName?: string | null };

export async function orgEmailDomain(sb: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await sb.from("orgs").select("settings").eq("id", orgId).maybeSingle();
  const d = (data?.settings as Record<string, unknown> | null)?.email_domain as string | undefined;
  return (d ?? "ambitionangels.org").toLowerCase();
}

/** External (non-org-domain) attendee emails, lowercased + deduped. */
export function externalEmails(attendees: Attendee[] | null, domain: string): string[] {
  const out = new Set<string>();
  for (const a of attendees ?? []) {
    const e = a?.email?.toLowerCase().trim();
    if (e && !e.endsWith("@" + domain)) out.add(e);
  }
  return Array.from(out);
}

/**
 * Match external emails to constituents and partners, all within `orgId`.
 * Constituents rank ahead of partners for primary selection (a donor outweighs
 * a cold partner contact, per §10.3).
 */
export async function matchAttendees(
  sb: SupabaseClient,
  orgId: string,
  emails: string[]
): Promise<MatchedEntity[]> {
  if (emails.length === 0) return [];
  const matched: MatchedEntity[] = [];

  // Constituents: emails is a text[]; overlap is the same match the Gmail sync uses.
  const { data: cons } = await sb
    .from("constituents")
    .select("id, type, first_name, last_name, org_name, emails")
    .eq("org_id", orgId)
    .overlaps("emails", emails);
  for (const c of (cons ?? []) as Array<{
    id: string;
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    emails: string[] | null;
  }>) {
    const me = (c.emails ?? []).find((e) => emails.includes(e.toLowerCase())) ?? null;
    matched.push({ type: "constituent", id: c.id, name: constituentName(c), matchedEmail: me });
  }

  // Partners: contact email, champion_email, or domain (Gmail only hit constituents).
  const { data: contacts } = await sb
    .from("partner_contacts")
    .select("partner_id, email")
    .eq("org_id", orgId)
    .in("email", emails);
  const { data: partners } = await sb
    .from("partners")
    .select("id, name, champion_email, domain")
    .eq("org_id", orgId);

  const emailDomains = new Set(emails.map((e) => e.split("@")[1]).filter(Boolean));
  const partnerHit = new Map<string, string | null>(); // partner_id → matched email
  for (const ct of (contacts ?? []) as Array<{ partner_id: string | null; email: string | null }>) {
    if (ct.partner_id) partnerHit.set(ct.partner_id, ct.email ?? null);
  }
  const partnerName = new Map<string, string>();
  for (const p of (partners ?? []) as Array<{
    id: string;
    name: string | null;
    champion_email: string | null;
    domain: string | null;
  }>) {
    partnerName.set(p.id, p.name ?? "Partner");
    const champ = p.champion_email?.toLowerCase();
    const dom = p.domain?.toLowerCase();
    if (champ && emails.includes(champ)) {
      partnerHit.set(p.id, champ);
    } else if (dom && emailDomains.has(dom) && !partnerHit.has(p.id)) {
      partnerHit.set(p.id, emails.find((e) => e.endsWith("@" + dom)) ?? null);
    }
  }
  for (const [pid, me] of Array.from(partnerHit.entries())) {
    matched.push({ type: "partner", id: pid, name: partnerName.get(pid) ?? "Partner", matchedEmail: me });
  }

  return matched;
}

/** The primary match for suggested-task linking: highest-value (donor over partner). */
export function primaryMatch(matched: MatchedEntity[]): MatchedEntity | null {
  return matched.find((m) => m.type === "constituent") ?? matched[0] ?? null;
}

type MeetingLite = {
  id: string;
  org_id: string;
  title: string | null;
  occurred_at: string;
  summary: string | null;
};

/** Fan a matched meeting out to the constituent and partner timelines. Idempotent. */
export async function fanOutTimeline(
  sb: SupabaseClient,
  meeting: MeetingLite,
  matched: MatchedEntity[]
): Promise<void> {
  const constituents = matched.filter((m) => m.type === "constituent");
  const partners = matched.filter((m) => m.type === "partner");

  if (constituents.length) {
    const rows = constituents.map((c) => ({
      org_id: meeting.org_id,
      constituent_id: c.id,
      kind: "meeting",
      direction: null,
      subject: meeting.title,
      thread_id: null,
      body_preview: meeting.summary,
      occurred_at: meeting.occurred_at,
      matched_email: c.matchedEmail,
      logged_by: "meeting",
      external_source: "meeting",
      external_id: meeting.id,
      // is_private derived (not defaulted open): a calendar meeting is on the
      // shared timeline; sensitive transcript text is never written here.
      is_private: false,
      shannon_present: false,
    }));
    await sb
      .from("interactions")
      .upsert(rows, { onConflict: "external_source,external_id,constituent_id", ignoreDuplicates: true });
  }

  if (partners.length) {
    const rows = partners.map((p) => ({
      org_id: meeting.org_id,
      partner_id: p.id,
      kind: "meeting",
      notes: meeting.title,
      occurred_at: meeting.occurred_at,
      logged_by: "meeting",
      external_source: "meeting",
      external_id: meeting.id,
    }));
    await sb
      .from("partner_interactions")
      .upsert(rows, {
        onConflict: "org_id,external_source,external_id,partner_id",
        ignoreDuplicates: true,
      });
  }
}

/**
 * Ensure a meeting_record exists for every past external calendar event the
 * owner has, then match attendees and fan out. Service-role; org-scoped
 * explicitly. Idempotent: safe to re-run (the records and timeline upserts dedupe).
 */
export async function ensureMeetingRecordsForOwner(
  sb: SupabaseClient,
  orgId: string,
  ownerUserId: string,
  now: Date
): Promise<{ created: number; matched: number }> {
  const domain = await orgEmailDomain(sb, orgId);

  const { data: events } = await sb
    .from("calendar_events")
    .select("id, title, start_time, attendees, is_external, status, google_event_id")
    .eq("org_id", orgId)
    .eq("owner_user_id", ownerUserId)
    .eq("is_external", true)
    .lt("start_time", now.toISOString())
    .neq("status", "cancelled")
    .order("start_time", { ascending: false })
    .limit(200);
  if (!events?.length) return { created: 0, matched: 0 };

  const eventRows = events as Array<{
    id: string;
    title: string | null;
    start_time: string;
    attendees: Attendee[] | null;
  }>;
  const eventIds = eventRows.map((e) => e.id);
  const { data: existing } = await sb
    .from("meeting_records")
    .select("id, calendar_event_id")
    .eq("org_id", orgId)
    .eq("source", "calendar")
    .in("calendar_event_id", eventIds);
  const haveRecord = new Map<string, string>();
  for (const r of (existing ?? []) as Array<{ id: string; calendar_event_id: string | null }>) {
    if (r.calendar_event_id) haveRecord.set(r.calendar_event_id, r.id);
  }

  let created = 0;
  let matched = 0;
  for (const ev of eventRows) {
    let recordId = haveRecord.get(ev.id);
    if (!recordId) {
      const { data: rec, error } = await sb
        .from("meeting_records")
        .insert({
          org_id: orgId,
          owner_user_id: ownerUserId,
          calendar_event_id: ev.id,
          title: ev.title,
          occurred_at: ev.start_time,
          source: "calendar",
          external_source: "calendar",
          external_id: ev.id,
        })
        .select("id")
        .single();
      if (error || !rec) continue; // unique-index race or bad row → skip, not fatal
      recordId = (rec as { id: string }).id;
      created += 1;
    }
    const emails = externalEmails(ev.attendees, domain);
    const ents = await matchAttendees(sb, orgId, emails);
    if (ents.length) {
      await fanOutTimeline(
        sb,
        { id: recordId, org_id: orgId, title: ev.title, occurred_at: ev.start_time, summary: null },
        ents
      );
      matched += 1;
    }
  }

  return { created, matched };
}
