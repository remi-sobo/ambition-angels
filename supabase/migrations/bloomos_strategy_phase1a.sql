-- BloomOS Strategy, Phase 1a (specs/bloomos-strategy.md, Appendix B).
-- Additive only — safe to apply BEFORE the Phase 1 code deploys. It creates the
-- three missing strategy tables and extends the two existing ones with new
-- nullable columns. Nothing here changes a column default or a check constraint,
-- so the live /admin/strategic-plan page and its six routes keep working
-- unchanged between this migration and the code deploy.
--
-- Apply Phase 1b (bloomos_strategy_phase1b.sql) only WITH the code PR — it drops
-- the org_id defaults and tightens the initiative status check, which the old
-- routes still rely on.
--
-- Mirrors the RLS / trigger pattern in create_kpis_and_plan.sql exactly, with
-- one deliberate difference: NO hardcoded org_id default (the org_id-default
-- trap). New tables get org_id from session context in the routes.
--
-- Access: strategy is readable by every role that can see reports (incl.
-- board_viewer); writes are org-management actions.

-- FOUNDATION — mission / vision / values / behaviors. One row per org.
create table if not exists plan_foundation (
  org_id uuid not null references orgs(id),
  mission text,
  vision text,
  values jsonb not null default '[]',
  behaviors jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

-- OBJECTIVES — the standing departments/categories. Health-scale status.
create table if not exists plan_objectives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  title text not null,
  three_year_statement text,
  owner text,
  status text not null default 'on_track' check (status in
    ('not_started','on_track','at_risk','behind','done')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- KPIS / MEASURES — attach to a goal OR an objective (at least one). Targets and
-- current values live here; the auto-metric registry (Phase 3) fills `current`
-- for source='auto' rows. Health-scale status.
create table if not exists plan_kpis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  goal_id uuid references plan_goals(id) on delete cascade,
  objective_id uuid references plan_objectives(id) on delete cascade,
  title text not null,
  unit text,
  target numeric(14,2),
  current numeric(14,2),
  owner text,
  cadence text,
  source text not null default 'manual' check (source in ('auto','manual')),
  metric_key text,
  status text not null default 'not_started' check (status in
    ('not_started','on_track','at_risk','behind','done')),
  last_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_kpis_attach_chk check (goal_id is not null or objective_id is not null)
);
create index if not exists plan_kpis_goal_idx on plan_kpis (goal_id);
create index if not exists plan_kpis_objective_idx on plan_kpis (objective_id);

-- EXTEND existing tables (new columns are nullable, so old rows/routes are fine).
alter table plan_goals add column if not exists objective_id uuid references plan_objectives(id) on delete set null;
alter table plan_goals add column if not exists owner text;
create index if not exists plan_goals_objective_idx on plan_goals (objective_id);

alter table plan_initiatives add column if not exists description text;

-- RLS + updated_at triggers for the three NEW tables. Same shape as
-- create_kpis_and_plan.sql, minus the org_id default.
do $$
declare
  t text;
begin
  foreach t in array array['plan_foundation','plan_objectives','plan_kpis'] loop
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
