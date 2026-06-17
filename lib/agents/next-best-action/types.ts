// Next-best-action agent (Phase 2) — types shared by the agent, the route, and
// the UI. The agent ranks moves-pipeline opportunities and proposes the single
// best next action for each, grounded strictly in the facts we pass it.

// What the route feeds the agent per opportunity. Every field is a real,
// computed value from the spine — the agent must not invent anything beyond it.
export type NbaCandidate = {
  opportunity_id: string;
  constituent_name: string;
  stage: string;
  days_in_stage: number | null;
  ask_amount: number | null;
  expected_close: string | null;
  current_next_step: string | null;
  next_step_due: string | null;
  overdue: boolean;
  lifetime_giving: number;
  gift_count: number;
  last_gift_date: string | null;
  last_touch_kind: string | null;
  last_touch_date: string | null;
  days_since_touch: number | null;
  recent_inbound_email: boolean;
  capacity_rating: number | null;
};

export type NbaChannel = "email" | "call" | "meeting" | "note" | "other";

// What the agent returns via the submit_recommendations tool.
export type NbaRecommendation = {
  opportunity_id: string;
  priority: number; // 1 = highest
  action: string; // imperative, what to do
  rationale: string; // one line, grounded in the candidate's facts
  channel: NbaChannel;
  suggested_due_in_days: number; // 0–30; route turns this into a date
};

// What the route returns to the UI: the recommendation enriched with the
// display fields the cards need, the resolved due date, and the persisted row
// id (so Apply/Dismiss can record the disposition).
export type NbaCardRecommendation = NbaRecommendation & {
  id: string; // fr_nba_suggestions row id
  constituent_id: string | null;
  constituent_name: string;
  stage: string;
  ask_amount: number | null;
  next_step_due: string; // ISO date the Apply action writes
};

// Follow-through: how many suggested moves were applied vs. dismissed.
export type NbaStats = { applied: number; dismissed: number };
