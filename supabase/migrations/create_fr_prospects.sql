-- fr_prospects — the fundraising "bench" of prospects.
--
-- Source-of-truth capture: this table was originally created ad-hoc in
-- production, outside the migration system. Reconstructed here (verified against
-- the live schema 2026-06-25) so the repo fully reproduces the database and the
-- RLS leak test can build it. This reflects the table's PRE-hardening state —
-- RLS off and org_id defaulting to AA's uuid (the historical "default trap").
-- rls_reed_phase1_four_tables.sql then drops that default and enables RLS.
--
-- Idempotent: create-if-not-exists, so applying against the existing production
-- database (where the table already exists, already hardened) is a no-op.

create table if not exists public.fr_prospects (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null default '17c75da8-082d-4c8f-b00b-a4100fb2eb22'::uuid,
  hubspot_contact_id text unique,
  type               text not null default 'individual'
                       check (type in ('individual', 'foundation', 'corporate', 'unknown')),
  source             text not null default 'manual'
                       check (source in ('manual', 'hubspot', 'research')),
  name               text not null,
  email              text,
  org_name           text,
  status             text not null default 'active'
                       check (status in ('active', 'promoted', 'disqualified')),
  strategy_note      text,
  constituent_id     uuid,
  opportunity_id     uuid,
  notes              text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists fr_prospects_status_idx on public.fr_prospects (status);
