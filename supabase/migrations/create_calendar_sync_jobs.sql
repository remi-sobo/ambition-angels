-- BloomOS Agenda Phase 2: calendar sync state + upsert-index fix.
-- See specs/bloomos-agenda.md §6-7. Service-path only (the sync job runs as
-- service-role); the Today view reads recency from calendar_events.synced_at.

-- (a) calendar_events upsert needs a NON-partial unique index on
-- (owner_user_id, google_event_id) so PostgREST ON CONFLICT can target it. The
-- Phase 1 partial index (where google_event_id is not null) can't be an ON
-- CONFLICT target. NULLs stay distinct, so booking rows (null google_event_id)
-- remain unconstrained.
drop index if exists calendar_events_owner_gevent_uniq;
create unique index if not exists calendar_events_owner_gevent_uniq
  on calendar_events (owner_user_id, google_event_id);

-- (b) per-user calendar sync run log (service-path only); mirrors gmail_sync_jobs.
create table if not exists calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id),
  owner_user_id uuid not null references auth.users(id),
  status text not null default 'running' check (status in ('running','completed','failed','partial')),
  window_start timestamptz,
  window_end timestamptz,
  counts jsonb not null default '{"fetched":0,"upserted":0,"deleted":0}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists calendar_sync_jobs_owner_idx on calendar_sync_jobs (owner_user_id, started_at desc);
alter table calendar_sync_jobs enable row level security;
-- No policies on purpose: deny-all for authenticated/anon (service-role only), like connections.
