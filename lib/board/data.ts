import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Board portal reads.
 *
 * Everything here goes through the USER-SCOPED client (lib/supabase/server),
 * never the service-role one. That is not a style preference: RLS is what
 * keeps a director's private notes out of the CEO's hands, and the
 * service-role client bypasses RLS entirely. A read added here with
 * getSupabaseAdmin() would silently defeat the one rule the whole project is
 * built around.
 */

export type Meeting = {
  id: string;
  title: string;
  fiscal_label: string | null;
  meeting_type: string;
  meeting_date: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  zoom_url: string | null;
  zoom_room: string | null;
  status: "upcoming" | "live" | "closed";
  quorum_required: number;
  minutes_status: string;
};

export type AgendaItem = {
  id: string;
  position: number;
  starts_at_label: string | null;
  title: string;
  description: string | null;
  owner: string | null;
  duration_minutes: number | null;
  item_type: "information" | "discussion" | "decision" | "demonstration";
  status: "upcoming" | "current" | "done";
  brief: Brief | null;
};

export type Brief = {
  decision?: string;
  recommends?: string;
  why?: string;
  tradeoff?: string;
  motion?: string;
  /** The home screen's main-question card, authored per meeting rather than
   *  derived from `decision`. A yes/no question about a finished document
   *  invites assent; when the decision is genuinely open, the Chair writes
   *  the question the board is actually there to answer. */
  question?: string;
  subtitle?: string;
  /** "What we'll work through" — the shape of the discussion, not a vote. */
  considerations?: { label: string; note: string }[];
};

export type Resolution = {
  id: string;
  motion_text: string;
  moved_by: string | null;
  seconded_by: string | null;
  votes_for: number | null;
  votes_against: number | null;
  abstentions: string[];
  passed: boolean | null;
  notes: string | null;
  meeting_id: string;
};

export type FollowUp = {
  id: string;
  description: string;
  owner: string | null;
  due_date: string | null;
  status: "done" | "in_progress" | "not_pursued" | "overdue";
  completed_at: string | null;
  note: string | null;
};

export type PrepItem = {
  id: string;
  position: number;
  label: string;
  sub_label: string | null;
  href: string | null;
  minutes_est: number | null;
  completed_at: string | null;
};

export type Attendance = {
  board_member_id: string;
  rsvp: "yes" | "no" | "unsure" | null;
  is_staff: boolean;
  name: string;
};

export type MeetingDoc = {
  id: string;
  title: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  doc_type: string | null;
};

export type MinutesRecord = {
  id: string;
  body: MinutesBody;
  called_to_order_at: string | null;
  adjourned_at: string | null;
  quorum_met: boolean | null;
  approved_at: string | null;
  signed_pdf_path: string | null;
  signed_by: string | null;
  signed_at: string | null;
};

export type MinutesSection =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | {
      type: "decision";
      motion: string;
      moved_by?: string;
      seconded_by?: string;
      for?: number;
      against?: number;
      abstained?: string[];
      outcome?: string;
      note?: string;
    };

export type MinutesBody = {
  sections?: MinutesSection[];
  present?: string[];
  absent?: string[];
  staff_present?: string[];
};

const MEETING_COLS =
  "id, title, fiscal_label, meeting_type, meeting_date, starts_at, ends_at, location, zoom_url, zoom_room, status, quorum_required, minutes_status";

/** The meeting a director lands on: the one in progress, else the next one
 *  scheduled, else the most recent. Never an empty home screen. */
export async function getCurrentMeeting(orgId: string): Promise<Meeting | null> {
  const supabase = createServerSupabase();

  const { data: live } = await supabase
    .from("board_meetings")
    .select(MEETING_COLS)
    .eq("org_id", orgId)
    .eq("status", "live")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (live) return live as Meeting;

  const { data: next } = await supabase
    .from("board_meetings")
    .select(MEETING_COLS)
    .eq("org_id", orgId)
    .eq("status", "upcoming")
    .gte("meeting_date", new Date().toISOString().slice(0, 10))
    .order("meeting_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (next) return next as Meeting;

  const { data: last } = await supabase
    .from("board_meetings")
    .select(MEETING_COLS)
    .eq("org_id", orgId)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (last as Meeting) ?? null;
}

export async function getMeeting(orgId: string, id: string): Promise<Meeting | null> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("board_meetings")
    .select(MEETING_COLS)
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as Meeting) ?? null;
}

export async function getAllMeetings(orgId: string): Promise<Meeting[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("board_meetings")
    .select(MEETING_COLS)
    .eq("org_id", orgId)
    .order("meeting_date", { ascending: false })
    .limit(200);
  return (data ?? []) as Meeting[];
}

export async function getAgenda(meetingId: string): Promise<AgendaItem[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("agenda_items")
    .select(
      "id, position, starts_at_label, title, description, owner, duration_minutes, item_type, status, brief",
    )
    .eq("meeting_id", meetingId)
    .order("position");
  return (data ?? []) as AgendaItem[];
}

/** Resolutions across every meeting — the Decisions register. */
export async function getResolutions(orgId: string, meetingId?: string): Promise<Resolution[]> {
  const supabase = createServerSupabase();
  let q = supabase
    .from("resolutions")
    .select(
      "id, motion_text, moved_by, seconded_by, votes_for, votes_against, abstentions, passed, notes, meeting_id",
    )
    .eq("org_id", orgId);
  if (meetingId) q = q.eq("meeting_id", meetingId);
  const { data } = await q.limit(500);
  return (data ?? []) as Resolution[];
}

export async function getFollowUps(meetingId: string): Promise<FollowUp[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("follow_ups")
    .select("id, description, owner, due_date, status, completed_at, note")
    .eq("meeting_id", meetingId)
    .order("status")
    .order("due_date");
  return (data ?? []) as FollowUp[];
}

/** This director's prep only. RLS restricts the rows to hers; the query is
 *  scoped as well so the intent is legible at the call site. */
export async function getPrepItems(meetingId: string, memberId: string): Promise<PrepItem[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("prep_items")
    .select("id, position, label, sub_label, href, minutes_est, completed_at")
    .eq("meeting_id", meetingId)
    .eq("board_member_id", memberId)
    .order("position");
  return (data ?? []) as PrepItem[];
}

/** Attendance is deliberately NOT private: quorum is the board's business. */
export async function getAttendance(meetingId: string): Promise<Attendance[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("meeting_attendance")
    .select("board_member_id, rsvp, is_staff, board_members(name)")
    .eq("meeting_id", meetingId);
  type Row = {
    board_member_id: string;
    rsvp: Attendance["rsvp"];
    is_staff: boolean;
    board_members: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => {
    const m = r.board_members;
    return {
      board_member_id: r.board_member_id,
      rsvp: r.rsvp,
      is_staff: r.is_staff,
      name: (Array.isArray(m) ? m[0]?.name : m?.name) ?? "",
    };
  });
}

/**
 * Materials for a meeting, through the existing documents system.
 *
 * documents_schema.sql already carves out exactly this read: an org-visible
 * document linked to a board_meeting is readable by board.read holders. The
 * spec proposed a separate meeting_documents table; using this instead keeps
 * one file cabinet, and Shannon uploads in /admin/documents as she does now.
 */
export async function getMeetingDocuments(meetingId: string): Promise<MeetingDoc[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("document_links")
    .select("documents(id, title, filename, mime, size_bytes, doc_type, status)")
    .eq("entity_type", "board_meeting")
    .eq("entity_id", meetingId);
  type Row = { documents: MeetingDoc & { status?: string } | null };
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.documents)
    .filter((d): d is MeetingDoc & { status?: string } => !!d && d.status !== "archived")
    .map(({ id, title, filename, mime, size_bytes, doc_type }) => ({
      id,
      title: title || filename,
      filename,
      mime,
      size_bytes,
      doc_type,
    }));
}

export async function getMinutes(meetingId: string): Promise<MinutesRecord | null> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("minutes")
    .select(
      "id, body, called_to_order_at, adjourned_at, quorum_met, approved_at, signed_pdf_path, signed_by, signed_at",
    )
    .eq("meeting_id", meetingId)
    .maybeSingle();
  return (data as MinutesRecord) ?? null;
}

/** This director's own notes for a meeting, keyed by agenda item id.
 *  RLS makes this return nothing for anyone else, board_admin included. */
export async function getMyNotes(
  meetingId: string,
  memberId: string,
): Promise<Record<string, string>> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("member_notes")
    .select("agenda_item_id, body")
    .eq("meeting_id", meetingId)
    .eq("board_member_id", memberId);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { agenda_item_id: string | null; body: string }[]) {
    if (r.agenda_item_id) out[r.agenda_item_id] = r.body;
  }
  return out;
}

export type Question = {
  id: string;
  body: string;
  answer_body: string | null;
  answered_at: string | null;
  created_at: string;
};

/** The asker's own questions. board_admin sees all of them in /admin. */
export async function getMyQuestions(meetingId: string, memberId: string): Promise<Question[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("member_questions")
    .select("id, body, answer_body, answered_at, created_at")
    .eq("meeting_id", meetingId)
    .eq("board_member_id", memberId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Question[];
}
