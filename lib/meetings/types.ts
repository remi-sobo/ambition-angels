/**
 * Shared types for the BloomOS meetings subsystem (Phase 3).
 *
 * A meeting_record is the durable spine (one row per real meeting), kept off the
 * calendar_events sync mirror so curated state survives a re-sync. Matched
 * entities (donors/partners) fan out to the existing timeline tables.
 */

export type FollowUpStatus =
  | "needs_follow_up"
  | "has_follow_up"
  | "none_needed"
  | "dismissed";

export type MeetingSource = "calendar" | "upload" | "manual";

export type MeetingRecord = {
  id: string;
  org_id: string;
  owner_user_id: string;
  calendar_event_id: string | null;
  title: string | null;
  occurred_at: string;
  source: MeetingSource;
  summary: string | null;
  transcript: string | null;
  store_transcript: boolean;
  follow_up_status: FollowUpStatus;
  external_source: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchedEntity = {
  type: "constituent" | "partner";
  id: string;
  name: string;
  matchedEmail: string | null;
};

export type SuggestedTaskStatus = "pending" | "accepted" | "dismissed";

export type MeetingSuggestedTask = {
  id: string;
  org_id: string;
  meeting_record_id: string;
  suggested_title: string;
  suggested_category: string | null;
  suggested_entity_type: "partner" | "constituent" | null;
  suggested_entity_id: string | null;
  status: SuggestedTaskStatus;
  created_at: string;
  updated_at: string;
};

export const FOLLOW_UP_LABEL: Record<FollowUpStatus, string> = {
  needs_follow_up: "Needs follow-up",
  has_follow_up: "Has follow-up",
  none_needed: "No follow-up needed",
  dismissed: "Dismissed",
};
