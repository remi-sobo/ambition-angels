-- Background research runs: a durable status record so a funder-research run
-- survives the user navigating away, and the UI can reflect
-- queued/running/completed/failed.
--
-- Reuses the fundraising.* permission keys (research is fundraising data) —
-- no new keys. Server writes go through the service role (background task),
-- so the write policy is a backstop for any client-side path.

create table if not exists public.research_runs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs on delete cascade,
  prospect_id  uuid not null references public.fr_prospects on delete cascade,
  status       text not null default 'running'
               check (status in ('queued','running','completed','failed')),
  started_by   uuid references auth.users on delete set null,
  brief_id     uuid,                  -- fr_prospect_briefs.id on success
  error        text,                  -- failure reason
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- latest run per prospect (the status endpoint reads newest-first)
create index if not exists research_runs_prospect_idx
  on public.research_runs (prospect_id, created_at desc);

alter table public.research_runs enable row level security;

create policy "members read research_runs"
  on public.research_runs for select to authenticated
  using ((select private.has_permission(org_id, 'fundraising.read')));

create policy "members write research_runs"
  on public.research_runs for all to authenticated
  using ((select private.has_permission(org_id, 'fundraising.write')))
  with check ((select private.has_permission(org_id, 'fundraising.write')));

-- ── rollback ──────────────────────────────────────────────
-- drop table public.research_runs cascade;
