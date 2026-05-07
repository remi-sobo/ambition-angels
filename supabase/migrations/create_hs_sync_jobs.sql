-- Migration: hs_sync_jobs — durable state for the HubSpot read-only sync.
--
-- One row per sync invocation. The /api/admin/hubspot/sync route advances
-- a job by one chunk per call (a chunk is up to ~250 records or ~30s wall
-- time, whichever comes first), so the client polls until status leaves
-- 'running'. The cursors and counts columns hold per-step resume state.
--
-- Idempotent. RLS not enabled (project convention).

create table if not exists hs_sync_jobs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running'
                  check (status in ('running', 'completed', 'failed', 'partial')),
  triggered_by  text
                  check (triggered_by is null or triggered_by in ('remi', 'shannon')),
  current_step  text
                  check (current_step is null or current_step in
                    ('contacts', 'companies', 'deals', 'engagements')),
  -- per-step resume cursors. For contacts/companies/deals: the HubSpot
  -- 'after' string. For engagements: a "<subtype>:<after>" string where
  -- subtype iterates emails → calls → meetings → notes → tasks; null when
  -- the step is complete or hasn't started.
  cursors       jsonb not null default
                  '{"contacts": null, "companies": null, "deals": null, "engagements": null}'::jsonb,
  counts        jsonb not null default
                  '{"contacts": 0, "companies": 0, "deals": 0, "engagements": 0}'::jsonb,
  errors        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists hs_sync_jobs_started_at_idx on hs_sync_jobs (started_at desc);
create index if not exists hs_sync_jobs_status_idx     on hs_sync_jobs (status);
