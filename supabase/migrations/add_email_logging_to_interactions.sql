-- Phase 1C.a — email logging on the spine.
--
-- Extend `interactions` so a Gmail message lands in the same timeline as every
-- other touch (kind='email' already exists). Idempotency reuses the existing
-- interactions_external_idx unique index on (external_source, external_id,
-- constituent_id) — a Gmail message id is the external_id, external_source
-- 'gmail'. Plus a small chunked job table for the all-history backfill, mirror
-- of hs_sync_jobs.

alter table interactions add column if not exists direction text
  check (direction in ('inbound','outbound'));      -- null for non-email kinds
alter table interactions add column if not exists subject text;
alter table interactions add column if not exists thread_id text;        -- Gmail thread id
alter table interactions add column if not exists body_preview text;     -- HTML-stripped snippet
alter table interactions add column if not exists is_private boolean not null default false;
alter table interactions add column if not exists matched_email text;    -- which address matched (audit)

create index if not exists interactions_thread_idx on interactions (thread_id)
  where thread_id is not null;

-- Chunked Gmail sync job. The route advances one chunk per call (page of
-- messages or a wall-time budget) and the client/cron polls until done.
-- mode 'backfill' walks all history via page_token; once exhausted it flips to
-- 'incremental', which thereafter pulls only messages newer than the
-- last_internal_date watermark (Gmail internalDate, epoch ms).
create table if not exists gmail_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id),
  mailbox text not null default 'remi@ambitionangels.org',
  mode text not null default 'backfill' check (mode in ('backfill','incremental')),
  status text not null default 'running' check (status in ('running','completed','failed','partial')),
  page_token text,
  last_internal_date bigint not null default 0,
  counts jsonb not null default '{"scanned":0,"logged":0,"skipped":0}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists gmail_sync_jobs_status_idx on gmail_sync_jobs (status, started_at desc);
