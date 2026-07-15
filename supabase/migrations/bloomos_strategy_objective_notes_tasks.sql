-- BloomOS Strategy — objective notes & tasks (Monthly OGSM review).
-- Operators need to hang working context off an objective during the monthly
-- review: freeform notes and discrete follow-up tasks assignable to a team
-- member. Both are children of plan_objectives and die with their objective
-- (ON DELETE CASCADE) — unlike goals, which deliberately survive unparented.
--
-- Assignees follow the house convention for plan rows: free text holding a
-- person's display name, picked in the UI from the active `staff` roster
-- (owner_uuid_promotion.sql documents text-as-write-interface as the current
-- pattern; uuid promotion is a later, cross-table cleanup).
--
-- Mirrors the RLS / trigger pattern of bloomos_strategy_phase1a.sql exactly:
-- NO hardcoded org_id default (routes set it from session context); reads for
-- anyone with reports.read, writes gated on org.manage.

-- NOTES — permanent, timestamped commentary on an objective.
create table if not exists plan_objective_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  objective_id uuid not null references plan_objectives(id) on delete cascade,
  body text not null,
  author text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_objective_notes_objective_idx
  on plan_objective_notes (objective_id);

-- TASKS — follow-ups attached to an objective, assignable, checkable.
create table if not exists plan_objective_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  objective_id uuid not null references plan_objectives(id) on delete cascade,
  title text not null,
  assignee text,
  status text not null default 'todo' check (status in ('todo','done')),
  due_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_objective_tasks_objective_idx
  on plan_objective_tasks (objective_id);

-- RLS + updated_at triggers, same shape as the other strategy tables.
do $$
declare
  t text;
begin
  foreach t in array array['plan_objective_notes','plan_objective_tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using ( (select private.has_permission(org_id, 'reports.read')) )
      $p$, 'members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'managers write ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for all to authenticated
        using ( (select private.has_permission(org_id, 'org.manage')) )
        with check ( (select private.has_permission(org_id, 'org.manage')) )
      $p$, 'managers write ' || t, t);

    execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
