/**
 * Types for the Funder Research Agent.
 *
 * BriefContent matches the JSON shape the system prompt asks the agent to
 * produce. Fields are required at the top level (all 9 sections present);
 * sub-fields use sensible nullability so an honest "thin public footprint"
 * brief can still validate.
 */

// ── BriefContent (= fr_prospect_briefs.content) ───────────────────────────

export type RecentGrant = {
  recipient: string;
  amount: string | null;
  purpose: string | null;
  year: string | number | null;
};

export type Person = {
  name: string;
  title: string | null;
  professional_background: string | null;
  connection_to_youth_education_bayarea: string | null;
};

export type ReadyStory = {
  title: string;
  narrative_2_3_sentences: string;
  punchline_the_so_what: string;
  when_to_use_it: string;
};

export type MutualConnection = {
  name: string;
  how_connected: string;
  source: string;
  recent_touch_if_any: string | null;
};

export type BriefContent = {
  snapshot: string;
  what_they_care_about: {
    mission_statement: string | null;
    funding_priorities: string[];
    recent_grants: RecentGrant[];
    public_statements: string | null;
    what_they_dont_fund: string | null;
  };
  how_we_fit: {
    framing_note: string;
    matching_priorities: string[];
    our_matching_stories: string[];
    honest_gaps: string[];
  };
  people: {
    primary_contact: Person | null;
    board_members: Person[];
    staff_of_note: Person[];
  };
  giving_profile: {
    annual_giving: string | null;
    grant_size_range: string | null;
    decision_cadence: string | null;
    application_process: string | null;
  };
  mutual_connections: MutualConnection[];
  meeting_playbook: {
    open_questions: string[];
    ready_stories: ReadyStory[];
    one_thing_to_learn: string;
    suggested_next_ask: string;
  };
  source_notes_and_gaps: {
    sources: string[];
    gaps: string[];
  };
  raw_research_notes: string;
};

// ── ResearchContext (input to the agent) ──────────────────────────────────

export type ProspectType = "individual" | "foundation" | "corporate" | "unknown";

// Slim shapes pulled from the HubSpot mirror tables. We don't import from
// the existing fundraising/prospects component dir to keep the agent
// library self-contained and avoid coupling agent code to UI types.

export type ContextContact = {
  hubspot_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  lifecycle_stage: string | null;
  lead_status: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
  created_in_hubspot_at: string | null;
};

export type ContextCompany = {
  hubspot_id: string;
  name: string | null;
  domain: string | null;
  industry: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
};

export type ContextDeal = {
  hubspot_id: string;
  name: string | null;
  amount: number | null;
  stage: string | null;
  pipeline: string | null;
  close_date: string | null;
  last_activity_at: string | null;
};

export type ContextEngagement = {
  hubspot_id: string;
  engagement_type: string | null;
  subject: string | null;
  body_preview: string | null;
  occurred_at: string | null;
};

export type InternalConnection = {
  name: string;
  email: string | null;
  company: string | null;
  /** Why we surfaced this connection — e.g., "Same company in HubSpot"
   * or "Mentioned in email on 2026-04-12". */
  relationship_note: string;
};

export type ResearchContext = {
  hubspot_contact_id: string;
  contact: ContextContact;
  company: ContextCompany | null;
  deals: ContextDeal[];
  recent_engagements: ContextEngagement[];
  internal_connections: InternalConnection[];
  prospect_type: ProspectType;
};

// ── ResearchResult (output of the agent call) ─────────────────────────────

export type ResearchResult = {
  brief: BriefContent;
  model_used: string;
  tokens_input: number;
  tokens_output: number;
  duration_ms: number;
  web_search_count: number;
};
