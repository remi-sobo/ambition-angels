-- fin_reconciliation_items — the finance "reconcile inbox" of proposed ledger
-- entries (commitments/flags) awaiting a human accept/dismiss.
--
-- Source-of-truth capture: originally created ad-hoc in production, outside the
-- migration system. Reconstructed here (verified against the live schema
-- 2026-06-25) so the repo reproduces the database and the RLS leak test can
-- build it. This reflects the PRE-hardening state — no org_id column and RLS
-- off. rls_reed_phase1_four_tables.sql then adds org_id (NOT NULL, from session)
-- and enables RLS with finance policies.
--
-- Idempotent: create-if-not-exists, so applying against the existing production
-- database (where the table already exists with org_id) is a no-op.

create table if not exists public.fin_reconciliation_items (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('commitment', 'flag')),
  source      text not null check (source in ('hubspot', 'gmail', 'stripe', 'manual')),
  source_ref  text,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  title       text not null,
  detail      text,
  amount      numeric(12, 2),
  payload     jsonb not null default '{}'::jsonb,
  evidence_url text,
  confidence  text check (confidence in ('high', 'medium', 'low')),
  created_by  text default 'agent',
  created_at  timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  applied_id  uuid
);
create unique index if not exists fin_recon_source_ref_pending
  on public.fin_reconciliation_items (source, source_ref)
  where (status = 'pending' and source_ref is not null);
create index if not exists fin_recon_status_idx
  on public.fin_reconciliation_items (status, created_at desc);
