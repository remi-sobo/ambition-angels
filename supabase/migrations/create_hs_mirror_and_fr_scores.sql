-- Migration: HubSpot mirror tables (hs_*) and internal prospect scoring (fr_*)
--
-- Schema only. PR 4 of the admin OS — no application code consumes these
-- tables yet. The hs_* tables will be populated by a future sync job that
-- mirrors HubSpot objects (contacts, companies, deals, engagements). The
-- fr_prospect_scores table is hand-edited via the admin UI and is keyed to
-- a HubSpot contact ID without a foreign key, so a prospect can be scored
-- before the next sync runs.
--
-- Idempotency: every CREATE TABLE / CREATE INDEX uses IF NOT EXISTS. Safe
-- to re-run end-to-end without error.
--
-- RLS: not enabled, matching the rest of the project's convention.
--
-- updated_at: column carries a default of now() but no trigger. The
-- migrations folder has no existing trigger pattern; the future sync job
-- and admin write paths bump the column explicitly. A trigger can be added
-- in a later migration if we want it.

-- ── hs_contacts ─────────────────────────────────────────────────────────────
create table if not exists hs_contacts (
  hubspot_id            text primary key,
  email                 text,
  first_name            text,
  last_name             text,
  phone                 text,
  company               text,
  lifecycle_stage       text,
  lead_status           text,
  owner_id              text,
  last_activity_at      timestamptz,
  created_in_hubspot_at timestamptz,
  synced_at             timestamptz not null default now(),
  raw_json              jsonb       not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists hs_contacts_email_idx            on hs_contacts (email);
create index if not exists hs_contacts_owner_id_idx         on hs_contacts (owner_id);
create index if not exists hs_contacts_lifecycle_stage_idx  on hs_contacts (lifecycle_stage);
create index if not exists hs_contacts_last_activity_at_idx on hs_contacts (last_activity_at);

-- ── hs_companies ────────────────────────────────────────────────────────────
create table if not exists hs_companies (
  hubspot_id            text primary key,
  name                  text,
  domain                text,
  industry              text,
  owner_id              text,
  last_activity_at      timestamptz,
  created_in_hubspot_at timestamptz,
  synced_at             timestamptz not null default now(),
  raw_json              jsonb       not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists hs_companies_domain_idx   on hs_companies (domain);
create index if not exists hs_companies_owner_id_idx on hs_companies (owner_id);

-- ── hs_deals ────────────────────────────────────────────────────────────────
create table if not exists hs_deals (
  hubspot_id            text primary key,
  name                  text,
  amount                numeric(12,2),
  stage                 text,
  pipeline              text,
  close_date            date,
  owner_id              text,
  primary_contact_id    text,
  primary_company_id    text,
  last_activity_at      timestamptz,
  created_in_hubspot_at timestamptz,
  synced_at             timestamptz not null default now(),
  raw_json              jsonb       not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists hs_deals_stage_idx              on hs_deals (stage);
create index if not exists hs_deals_pipeline_idx           on hs_deals (pipeline);
create index if not exists hs_deals_owner_id_idx           on hs_deals (owner_id);
create index if not exists hs_deals_primary_contact_id_idx on hs_deals (primary_contact_id);
create index if not exists hs_deals_close_date_idx         on hs_deals (close_date);

-- ── hs_engagements ──────────────────────────────────────────────────────────
-- One row per HubSpot engagement (email, call, meeting, note, task).
-- engagement_type values: 'email' | 'call' | 'meeting' | 'note' | 'task'.
-- The body field can be large; body_preview holds the first 500 chars and
-- the application is responsible for the truncation. The full body stays
-- in raw_json so we can promote more of it to typed columns later without
-- re-syncing.
create table if not exists hs_engagements (
  hubspot_id      text primary key,
  engagement_type text,
  subject         text,
  body_preview    text,
  occurred_at     timestamptz,
  owner_id        text,
  contact_ids     text[]      not null default array[]::text[],
  company_ids     text[]      not null default array[]::text[],
  deal_ids        text[]      not null default array[]::text[],
  synced_at       timestamptz not null default now(),
  raw_json        jsonb       not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists hs_engagements_engagement_type_idx on hs_engagements (engagement_type);
create index if not exists hs_engagements_occurred_at_idx     on hs_engagements (occurred_at);
create index if not exists hs_engagements_owner_id_idx        on hs_engagements (owner_id);
create index if not exists hs_engagements_contact_ids_gin     on hs_engagements using gin (contact_ids);

-- ── fr_prospect_scores ──────────────────────────────────────────────────────
-- Internal 7-dimension scoring per HubSpot contact. Hand-edited via the
-- admin UI. No FK to hs_contacts so a prospect can be scored before the
-- next HubSpot sync runs.
--
-- score_energy_suck is intentionally inverted in feel — high values mean
-- the prospect is a drain, not a win. The schema treats all seven scores
-- equally and sums them into score_total below. The application layer is
-- responsible for surfacing score_total adjusted for the inversion (e.g.
-- subtracting energy_suck instead of adding it) when displaying a single
-- "fitness" number to the user. We picked plain sum here so the column
-- stays a deterministic, no-judgment aggregate at the database level.
create table if not exists fr_prospect_scores (
  id                       uuid primary key default gen_random_uuid(),
  hubspot_contact_id       text not null unique,
  score_capacity           smallint check (score_capacity           between 0 and 10),
  score_likelihood         smallint check (score_likelihood         between 0 and 10),
  score_alignment          smallint check (score_alignment          between 0 and 10),
  score_relationship       smallint check (score_relationship       between 0 and 10),
  score_strategic_leverage smallint check (score_strategic_leverage between 0 and 10),
  score_stage_fit          smallint check (score_stage_fit          between 0 and 10),
  score_energy_suck        smallint check (score_energy_suck        between 0 and 10),
  score_total              smallint generated always as (
      coalesce(score_capacity,           0)
    + coalesce(score_likelihood,         0)
    + coalesce(score_alignment,          0)
    + coalesce(score_relationship,       0)
    + coalesce(score_strategic_leverage, 0)
    + coalesce(score_stage_fit,          0)
    + coalesce(score_energy_suck,        0)
  ) stored,
  notes                    text,
  scored_by                text check (scored_by is null or scored_by in ('remi', 'shannon')),
  scored_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists fr_prospect_scores_score_total_idx on fr_prospect_scores (score_total desc);
