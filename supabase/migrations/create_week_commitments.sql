-- Weekly Plan v2, PR 3: week_commitments (specs: Weekly Plan v2 Spec).
--
-- The frozen record of what a Monday Plan committed. ops_tasks.planned_week
-- stays the live working state; these rows are what Friday Close compares
-- reality against. One row per task decided during a Monday Plan, hung off
-- that week's monday_plan rhythm_sessions row (the plan header: the
-- (org, user, kind, week_of) upsert keeps its id stable across re-commits,
-- so re-committing replaces rows under the same session).
--
-- Decision: commit | defer | drop | delegate. Placement is set exactly when
-- the decision is commit (checked). task_title and estimated_minutes are
-- snapshots so the record survives later edits; task_id goes null if the task
-- is deleted. outcome/outcome_at are written by Friday Close (PR 4).
--
-- org_id has NO default on purpose (the house org_id trap): the commit route
-- sets it from the session context.
--
-- RLS mirrors work_blocks: read with ops.read when it's your row, a calendar
-- delegated to you, or a direct report's (private.manages_user); write with
-- ops.write and only your own rows. Managers look, never touch.
--
-- Additive and idempotent. Applied by hand under the ledger name
-- create_week_commitments. Requires add_estimated_minutes_to_ops_tasks first.
-- Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

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

-- ── rollback ──────────────────────────────────────────────
-- drop table if exists public.week_commitments;
