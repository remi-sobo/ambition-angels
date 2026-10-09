/**
 * Shared Capture types (specs/bloomos-capture.md, C2). Pure: no imports that
 * touch the server stack, so the span / prompt / validate modules stay
 * unit-testable.
 */

export type CandidateKind = "constituent" | "partner" | "prospect";

/** One row the match RPC returned (or the context entity injected), with the
 *  short ref the model cites. Never a student. */
export type Candidate = {
  /** Stable short ref the model cites, c1, c2, ... */
  ref: string;
  kind: CandidateKind;
  id: string;
  name: string;
  orgName: string | null;
  /** Disambiguator shown on the card: "person · last touch Sep 12", "school · Oakland". */
  meta: string | null;
  /** Best trigram similarity across the spans that produced it, 0..1. */
  sim: number;
  /** The spoken spans this candidate answered. */
  spans: string[];
  /** True when this is the entity the capture started from (entity-page Record). */
  context: boolean;
};

export type StaffMember = {
  /** Short ref the model cites for assignees, s1, s2, ... */
  ref: string;
  name: string;
  /** ops_tasks.assigned_to handle (first display-name token, lowercased). */
  handle: string;
  /** profiles.user_id, for ops_tasks.assigned_to_id. */
  userId: string;
};

export type ContextEntity = {
  type: "constituent" | "partner";
  id: string;
  name: string;
  orgName: string | null;
  meta: string | null;
};

export type CaptureDest = "interaction" | "task" | "thought" | "message_draft";
export const CAPTURE_DESTS: readonly CaptureDest[] = ["interaction", "task", "thought", "message_draft"];

export type InteractionKind = "call" | "meeting" | "note" | "event";
export const INTERACTION_KINDS: readonly InteractionKind[] = ["call", "meeting", "note", "event"];

export type DraftChannel = "email" | "text";
export const DRAFT_CHANNELS: readonly DraftChannel[] = ["email", "text"];

export type CardStatus = "proposed" | "held";

/** A matched record as stored in capture_cards.match_candidates. */
export type MatchCandidateRow = {
  kind: CandidateKind;
  id: string;
  name: string;
  org_name: string | null;
  meta: string | null;
  sim: number;
};

/** What the validator emits, one per capture_cards row to insert. */
export type ValidatedCard = {
  position: number;
  dest: CaptureDest;
  status: CardStatus;
  entity_type: "constituent" | "partner" | null;
  entity_id: string | null;
  heard_name: string | null;
  match_confidence: number | null;
  match_candidates: MatchCandidateRow[];
  payload: Record<string, unknown>;
};

export type DroppedCard = { index: number; reason: string };

export type ParseResult = {
  cards: ValidatedCard[];
  youthSkipped: number;
  dropped: DroppedCard[];
};
