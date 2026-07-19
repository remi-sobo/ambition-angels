import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { parseTranscript } from "@/lib/meetings/reed";
import {
  externalEmails,
  matchAttendees,
  orgEmailDomain,
  primaryMatch,
} from "@/lib/meetings/match";
import { loadLatestMeetingAgenda } from "@/lib/meetings/dossier";

// POST /api/admin/meetings/[id]/transcript — ingest a pasted transcript, run Reed
// to produce a summary + 1–3 suggested follow-ups (staged, not live tasks). The
// raw transcript is persisted only when the user opts in (store_transcript);
// otherwise just the summary is kept (privacy decision §10.1).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }
  const storeTranscript = body?.store_transcript === true;

  const sb = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: rec } = await sb
    .from("meeting_records")
    .select("id, org_id, title, calendar_event_id")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const record = rec as { id: string; org_id: string; title: string | null; calendar_event_id: string | null };

  // Attendee context + the primary entity to link suggested tasks to, plus the
  // prep agenda (if Reed drafted one) so the recap becomes a prep-vs-actual debrief.
  let attendeeNames: string[] = [];
  let primaryType: "constituent" | "partner" | null = null;
  let primaryId: string | null = null;
  let agendaText: string | null = null;
  if (record.calendar_event_id) {
    const { data: ev } = await sb
      .from("calendar_events")
      .select("attendees")
      .eq("org_id", ctx.orgId)
      .eq("id", record.calendar_event_id)
      .maybeSingle();
    const attendees = ((ev as { attendees: Array<{ email?: string | null; displayName?: string | null }> | null } | null)?.attendees) ?? [];
    attendeeNames = attendees.map((a) => a.displayName || a.email || "").filter(Boolean);
    const domain = await orgEmailDomain(sb, ctx.orgId);
    const primary = primaryMatch(await matchAttendees(sb, ctx.orgId, externalEmails(attendees, domain)));
    primaryType = primary?.type ?? null;
    primaryId = primary?.id ?? null;
    // calendar_event_id is a global uuid PK and the record is org-scoped above,
    // so the agenda thread for this event necessarily belongs to this org.
    agendaText = (await loadLatestMeetingAgenda(sb, record.calendar_event_id))?.agenda ?? null;
  }

  let result;
  try {
    result = await parseTranscript({ title: record.title, transcript, attendees: attendeeNames, agenda: agendaText });
  } catch (e) {
    console.error("[meetings/:id/transcript] Reed failed:", e);
    return NextResponse.json({ error: "Transcript parsing failed" }, { status: 502 });
  }

  await sb
    .from("meeting_records")
    .update({
      summary: result.summary || null,
      transcript: storeTranscript ? transcript : null,
      store_transcript: storeTranscript,
      updated_at: new Date().toISOString(),
    })
    .eq("id", record.id)
    .eq("org_id", ctx.orgId);

  // Replace any prior pending suggestions for a clean re-parse.
  await sb
    .from("meeting_suggested_tasks")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("meeting_record_id", record.id)
    .eq("status", "pending");
  if (result.suggestions.length) {
    const rows = result.suggestions.map((s) => ({
      org_id: ctx.orgId,
      meeting_record_id: record.id,
      suggested_title: s.title,
      suggested_category: s.category,
      suggested_entity_type: primaryType,
      suggested_entity_id: primaryId,
      status: "pending",
    }));
    await sb.from("meeting_suggested_tasks").insert(rows);
  }

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    suggestionCount: result.suggestions.length,
  });
}
