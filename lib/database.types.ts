/**
 * Hand-maintained types for the /meet schema. Kept narrow on purpose — only
 * the tables /meet touches are declared here, mirrored from
 * supabase/migrations/create_meet_schema.sql. If you change the SQL, change
 * this file in the same commit.
 *
 * Other tables in the database (donations, quiz_submissions, etc.) are
 * accessed elsewhere without generated types and are deliberately out of
 * scope here.
 */

export type BookingStatus =
  | "confirmed"
  | "cancelled"
  | "no_show"
  | "completed";

export interface MeetingType {
  id: string;
  slug: string;
  name: string;
  duration_minutes: number;
  description: string | null;
  prep_notes: string | null;
  who_its_for: string | null;
  color: string | null;
  icon_name: string | null;
  buffer_minutes: number;
  min_notice_hours: number;
  max_advance_days: number;
  available_days: number[];           // ISO weekdays, 1=Mon..7=Sun
  available_start_time: string;       // 'HH:MM:SS' in host timezone
  available_end_time: string;
  daily_limit: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  meeting_type_id: string;

  start_time: string;                 // ISO 8601 UTC
  end_time: string;
  attendee_timezone: string;

  attendee_name: string;
  attendee_email: string;
  attendee_company: string | null;
  attendee_role: string | null;
  attendee_message: string | null;

  google_event_id: string | null;
  google_meet_url: string | null;

  cancel_token: string;
  status: BookingStatus;
  cancelled_at: string | null;
  cancellation_reason: string | null;

  reminder_sent_24h: boolean;
  reminder_sent_1h: boolean;

  created_at: string;
  updated_at: string;
}

export interface Blackout {
  id: string;
  start_date: string;                 // 'YYYY-MM-DD'
  end_date: string;
  reason: string | null;
  meeting_type_ids: string[] | null;
  created_at: string;
}

export type BookingInsert = Omit<
  Booking,
  "id" | "cancel_token" | "status" | "cancelled_at" | "cancellation_reason"
    | "reminder_sent_24h" | "reminder_sent_1h" | "created_at" | "updated_at"
> & {
  cancel_token?: string;
  status?: BookingStatus;
};
