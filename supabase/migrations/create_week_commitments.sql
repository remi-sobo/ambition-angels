-- Weekly Plan v2: week_commitments (applied to production on 2026-10-29,
-- ledger version 20261029170313, without a committed file).
--
-- Recovered verbatim from supabase_migrations.schema_migrations so the
-- migration folder can rebuild production again and the ledger CI check
-- passes. Do not edit the statements; change the table in a new migration.

create table if not exists public.week_commitments (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id),
  session_id        uuid not null references public.rhythm_sessions(id) on delete cascade,
  user_id           uuid not null references auth.users(id),
  week_of           date not null,
  task_id           uuid references public.ops_tasks(id) on delete set null,
  task_title        text not null,
  decision          text not null check (decision in ('commit', 'defer', 'drop', 'delegate')),
  reason            text,
  placement         text check (placement in ('day', 'block', 'prep', 'floating', 'delegated', 'unscheduled')),
  planned_day       date,
  work_block_id     uuid references public.work_blocks(id) on delete set null,
  prep_for_event_id uuid references public.calendar_events(id) on delete set null,
  estimated_minutes integer check (estimated_minutes between 1 and 960),
  source            text not null default 'backlog' check (source in ('proposed', 'carryover', 'backlog')),
  score_reasons     jsonb not null default '[]'::jsonb,
  outcome           text check (outcome in ('done', 'partial', 'missed', 'deferred', 'dropped')),
  outcome_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint week_commitments_placement_iff_commit
    check ((decision = 'commit') = (placement is not null)),
  constraint week_commitments_session_task_key unique (session_id, task_id)
);

comment on table public.week_commitments is
  'Weekly Plan v2: frozen per-task record of a Monday Plan commit (decision, placement, estimate snapshot), hung off the monday_plan rhythm_sessions row. Friday Close records outcome. planned_week on ops_tasks stays the live state.';

create index if not exists week_commitments_org_user_week_idx
  on public.week_commitments (org_id, user_id, week_of);
create index if not exists week_commitments_task_idx
  on public.week_commitments (task_id);

drop trigger if exists week_commitments_set_updated_at on public.week_commitments;
create trigger week_commitments_set_updated_at
  before update on public.week_commitments
  for each row execute function public.set_updated_at();

alter table public.week_commitments enable row level security;

drop policy if exists "ops readers read week_commitments" on public.week_commitments;
create policy "ops readers read week_commitments"
  on public.week_commitments for select
  using (
    (select private.has_permission(week_commitments.org_id, 'ops.read'))
    and (
      week_commitments.user_id = (select auth.uid())
      or exists (
        select 1 from public.agenda_delegations d
        where d.org_id = week_commitments.org_id
          and d.grantee_user_id = (select auth.uid())
          and d.grantor_user_id = week_commitments.user_id)
      or (select private.manages_user(week_commitments.user_id, week_commitments.org_id))
    )
  );

drop policy if exists "owner writes week_commitments" on public.week_commitments;
create policy "owner writes week_commitments"
  on public.week_commitments for all
  using (
    (select private.has_permission(week_commitments.org_id, 'ops.write'))
    and week_commitments.user_id = (select auth.uid())
  )
  with check (
    (select private.has_permission(week_commitments.org_id, 'ops.write'))
    and week_commitments.user_id = (select auth.uid())
  );
