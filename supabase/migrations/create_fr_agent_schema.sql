-- Migration: fundraising agent schema (PR 9)
--
-- Five tables backing the agent-driven research / drafting / outreach
-- stack. Schema only — no application code touches these tables yet.
--
--   fr_prospect_briefs        — agent research briefs on HubSpot prospects
--   fr_email_drafts           — agent (or human) drafted outreach emails
--   fr_touches                — manually-logged outreach not yet in HubSpot
--   fr_agent_activity_log     — append-only trace of every agent action
--   fr_funding_opportunities  — outbound-discovered foundations, pre-HubSpot
--
-- Cross-table relationships (FK with ON DELETE SET NULL throughout —
-- deleting a brief or draft shouldn't nuke linked records):
--   fr_email_drafts.brief_id        → fr_prospect_briefs.id
--   fr_touches.linked_draft_id      → fr_email_drafts.id
--   fr_touches.linked_brief_id      → fr_prospect_briefs.id
--
-- No FK from hubspot_contact_id to hs_contacts.hubspot_id. By design:
-- briefs / drafts / touches need to survive a HubSpot sync hiccup that
-- temporarily drops a contact from the mirror.
--
-- Reuses the set_updated_at() trigger function defined in
-- create_ops_projects_and_tasks.sql (PR Ops-1). This migration assumes
-- that function already exists; it does not redefine it. fr_agent_activity_log
-- is append-only conceptually and has no updated_at column, so it does
-- not attach a trigger.
--
-- Idempotent end-to-end:
--   - CREATE TABLE / CREATE INDEX use IF NOT EXISTS
--   - triggers use DROP IF EXISTS + CREATE
--
-- RLS: not enabled (project convention).

-- ── fr_prospect_briefs ─────────────────────────────────────────────────────
-- Agent-generated 9-section research briefs on existing HubSpot prospects.
-- The application layer enforces the section shape inside `content`; the
-- schema treats it as free-form jsonb so we can iterate on the template
-- without ALTER migrations. Expected top-level keys today:
--   snapshot                 (string, 2-3 lines)
--   what_they_care_about     (object: mission_statement, funding_priorities,
--                                     recent_grants[], public_statements,
--                                     what_they_dont_fund)
--   how_we_fit               (object: matching_priorities[], our_matching_stories[],
--                                     honest_gaps[])
--   people                   (object: primary_contact, board_members[],
--                                     internal_connections[])
--   giving_profile           (object: annual_giving, grant_size_range,
--                                     decision_cadence, application_process)
--   mutual_connections       (array of objects)
--   meeting_playbook         (object: open_questions[], ready_stories[],
--                                     one_thing_to_learn, suggested_next_ask)
--   source_notes_and_gaps    (object: sources[], gaps[])
--   raw_research_notes       (string, markdown — hidden by default in UI)
create table if not exists fr_prospect_briefs (
  id                  uuid primary key default gen_random_uuid(),
  hubspot_contact_id  text not null,
  content             jsonb not null,
  template_version    text not null default 'v1',
  status              text not null default 'draft'
                        check (status in ('draft', 'final', 'archived')),
  generated_at        timestamptz not null default now(),
  notes               text,
  created_by          text
                        check (created_by is null or created_by in ('remi', 'shannon', 'agent')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists fr_prospect_briefs_hubspot_contact_id_idx
  on fr_prospect_briefs (hubspot_contact_id);
create index if not exists fr_prospect_briefs_status_idx
  on fr_prospect_briefs (status);
create index if not exists fr_prospect_briefs_generated_at_idx
  on fr_prospect_briefs (generated_at desc);

drop trigger if exists fr_prospect_briefs_set_updated_at on fr_prospect_briefs;
create trigger fr_prospect_briefs_set_updated_at
  before update on fr_prospect_briefs
  for each row execute function set_updated_at();

-- ── fr_email_drafts ────────────────────────────────────────────────────────
-- Agent (or human) drafted outreach emails. brief_id links to a brief when
-- the draft was derived from one; ON DELETE SET NULL keeps the draft alive
-- if the brief is later deleted. gmail_draft_id stays NULL until the Gmail
-- integration (PR 12) writes the draft to the user's Gmail and stores the
-- returned ID — at that point the UI can open the draft directly in Gmail.
create table if not exists fr_email_drafts (
  id                  uuid primary key default gen_random_uuid(),
  hubspot_contact_id  text not null,
  brief_id            uuid references fr_prospect_briefs(id) on delete set null,
  template_used       text not null
                        check (template_used in (
                          'individual_major', 'corporate', 'foundation',
                          'follow_up', 'manual'
                        )),
  subject             text not null,
  body                text not null,
  gmail_draft_id      text,
  status              text not null default 'drafted'
                        check (status in (
                          'drafted', 'reviewed', 'sent', 'replied', 'rejected'
                        )),
  sent_at             timestamptz,
  replied_at          timestamptz,
  notes               text,
  created_by          text not null
                        check (created_by in ('remi', 'shannon', 'agent')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists fr_email_drafts_hubspot_contact_id_idx
  on fr_email_drafts (hubspot_contact_id);
create index if not exists fr_email_drafts_status_idx
  on fr_email_drafts (status);
create index if not exists fr_email_drafts_brief_id_idx
  on fr_email_drafts (brief_id);
create index if not exists fr_email_drafts_sent_at_idx
  on fr_email_drafts (sent_at desc);

drop trigger if exists fr_email_drafts_set_updated_at on fr_email_drafts;
create trigger fr_email_drafts_set_updated_at
  before update on fr_email_drafts
  for each row execute function set_updated_at();

-- ── fr_touches ─────────────────────────────────────────────────────────────
-- Outreach we initiated that may not yet appear in HubSpot's engagement
-- mirror — a just-finished meeting, a text, a call logged outside HubSpot.
-- Eventually these reconcile against hs_engagements but we don't depend on
-- that. linked_draft_id / linked_brief_id close the loop when an agent
-- email send is logged here.
create table if not exists fr_touches (
  id                  uuid primary key default gen_random_uuid(),
  hubspot_contact_id  text not null,
  touch_type          text not null
                        check (touch_type in (
                          'email_sent', 'email_received', 'meeting', 'call',
                          'text', 'note', 'event', 'other'
                        )),
  occurred_at         timestamptz not null,
  subject             text,
  body_or_notes       text,
  linked_draft_id     uuid references fr_email_drafts(id) on delete set null,
  linked_brief_id     uuid references fr_prospect_briefs(id) on delete set null,
  created_by          text not null
                        check (created_by in ('remi', 'shannon', 'agent')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists fr_touches_hubspot_contact_id_idx
  on fr_touches (hubspot_contact_id);
create index if not exists fr_touches_occurred_at_idx
  on fr_touches (occurred_at desc);
create index if not exists fr_touches_touch_type_idx
  on fr_touches (touch_type);

drop trigger if exists fr_touches_set_updated_at on fr_touches;
create trigger fr_touches_set_updated_at
  before update on fr_touches
  for each row execute function set_updated_at();

-- ── fr_agent_activity_log ──────────────────────────────────────────────────
-- Append-only trace of every agent action: who triggered it, what ran,
-- which row got created/updated, cost (tokens + duration), outcome.
-- No updated_at column / no trigger; the application layer should never
-- update these rows (insert-only). target_id + target_type form a polymorphic
-- pointer at whichever row this action produced (or NULL for actions like
-- inbox scans and funder searches that don't have a single target).
create table if not exists fr_agent_activity_log (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  created_by          text not null
                        check (created_by in ('remi', 'shannon', 'agent')),
  triggered_by        text not null
                        check (triggered_by in ('remi', 'shannon', 'system')),
  action_type         text not null
                        check (action_type in (
                          'research_brief', 'draft_email', 'follow_up_draft',
                          'inbox_scan', 'funder_search', 'chat_response', 'other'
                        )),
  hubspot_contact_id  text,
  target_id           uuid,
  target_type         text
                        check (target_type is null or target_type in (
                          'brief', 'draft', 'touch', 'opportunity'
                        )),
  prompt_summary      text,
  model_used          text,
  tokens_input        integer,
  tokens_output       integer,
  duration_ms         integer,
  status              text not null
                        check (status in ('success', 'partial', 'failed')),
  error_message       text,
  metadata            jsonb not null default '{}'::jsonb
);

create index if not exists fr_agent_activity_log_hubspot_contact_id_idx
  on fr_agent_activity_log (hubspot_contact_id);
create index if not exists fr_agent_activity_log_action_type_idx
  on fr_agent_activity_log (action_type);
create index if not exists fr_agent_activity_log_created_at_idx
  on fr_agent_activity_log (created_at desc);
create index if not exists fr_agent_activity_log_status_idx
  on fr_agent_activity_log (status);

-- ── fr_funding_opportunities ───────────────────────────────────────────────
-- Outbound-discovered foundations the funder-finder workflow (PR 15) surfaces.
-- These are NOT yet in HubSpot — they're triaged here first. Once a row
-- reaches triage_status = 'promoted_to_hubspot', promoted_to_hubspot_id
-- carries the HubSpot contact ID we created. created_by is restricted to
-- 'remi' or 'shannon' because rows here represent curated outbound choices
-- (the agent may surface candidates but a human enters the row).
create table if not exists fr_funding_opportunities (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  domain                   text,
  ein                      text,
  summary                  text,
  match_score              smallint check (match_score between 0 and 100),
  score_factors            jsonb not null default '{}'::jsonb,
  discovered_via           text not null
                             check (discovered_via in (
                               '990_scrape', 'foundation_directory',
                               'web_search', 'manual'
                             )),
  discovered_at            timestamptz not null default now(),
  triage_status            text not null default 'new'
                             check (triage_status in (
                               'new', 'researching', 'qualified',
                               'rejected', 'promoted_to_hubspot'
                             )),
  promoted_to_hubspot_id   text,
  notes                    text,
  created_by               text not null
                             check (created_by in ('remi', 'shannon')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists fr_funding_opportunities_triage_status_idx
  on fr_funding_opportunities (triage_status);
create index if not exists fr_funding_opportunities_match_score_idx
  on fr_funding_opportunities (match_score desc);
create index if not exists fr_funding_opportunities_discovered_at_idx
  on fr_funding_opportunities (discovered_at desc);
create index if not exists fr_funding_opportunities_domain_idx
  on fr_funding_opportunities (domain);

drop trigger if exists fr_funding_opportunities_set_updated_at on fr_funding_opportunities;
create trigger fr_funding_opportunities_set_updated_at
  before update on fr_funding_opportunities
  for each row execute function set_updated_at();
