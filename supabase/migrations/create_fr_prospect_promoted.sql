-- fr_prospect_promoted — a record of bench prospects promoted into the pipeline
-- (sibling of fr_prospect_disqualified), keyed by HubSpot contact id.
--
-- Source-of-truth capture: originally created ad-hoc in production, outside the
-- migration system. Reconstructed here (verified against the live schema
-- 2026-06-25) so the repo reproduces the database and the RLS leak test can
-- build it. PRE-hardening state — org_id nullable, RLS off.
-- rls_reed_phase1_four_tables.sql then backfills org_id and enables RLS with
-- fundraising policies.
--
-- Idempotent: create-if-not-exists, so applying against the existing production
-- database (where the table already exists) is a no-op.

create table if not exists public.fr_prospect_promoted (
  hubspot_id     text primary key,
  org_id         uuid,
  constituent_id uuid,
  opportunity_id uuid,
  promoted_at    timestamptz not null default now(),
  promoted_by    text
);
