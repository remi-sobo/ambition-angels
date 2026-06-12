-- BloomOS Ring 4: KPI scorecard + strategic plan (modules/07-governance.md).
-- KPI values are COMPUTED from the spine by lib/kpis.ts (the code-defined
-- metric registry); these tables hold only targets/owners, weekly value
-- snapshots (for trends), and the plan structure.
--
-- Access: scorecard/plan are readable by every role that can see reports
-- (including board_viewer); writes are org-management actions.

create table if not exists kpi_settings (
  org_id uuid not null references orgs(id),
  metric_key text not null,
  target numeric(14,2),
  owner text,
  active boolean not null default true,
  primary key (org_id, metric_key)
);

create table if not exists kpi_snapshots (
  org_id uuid not null references orgs(id),
  metric_key text not null,
  captured_on date not null,
  value numeric(14,2) not null,
  primary key (org_id, metric_key, captured_on)
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists plan_goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  title text not null,
  description text,
  target_date date,
  status text not null default 'on_track' check (status in
    ('on_track','at_risk','behind','done')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_initiatives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  goal_id uuid not null references plan_goals(id) on delete cascade,
  title text not null,
  owner text,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_initiatives_goal_idx on plan_initiatives (goal_id);

do $$
declare
  aa uuid;
  t text;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  foreach t in array array['kpi_settings','kpi_snapshots','plan_goals','plan_initiatives'] loop
    execute format('alter table %I alter column org_id set default %L', t, aa);
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
  end loop;

  foreach t in array array['plan_goals','plan_initiatives'] loop
    execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
