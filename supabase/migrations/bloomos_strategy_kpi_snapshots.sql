-- BloomOS Strategy — KPI value history for growth tracking (scorecard).
-- One row per KPI per day it's measured; the scorecard reads the recent series
-- to draw sparklines and "+X since last month". Written by the metric refresh
-- (auto KPIs) and by manual value edits. Additive, safe.
-- RLS mirrors the plan_* pattern (read = reports.read, write = org.manage),
-- minus the org_id default.

create table if not exists plan_kpi_snapshots (
  org_id uuid not null references orgs(id),
  kpi_id uuid not null references plan_kpis(id) on delete cascade,
  captured_on date not null,
  value numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key (kpi_id, captured_on)
);
create index if not exists plan_kpi_snapshots_idx on plan_kpi_snapshots (org_id, kpi_id, captured_on);

do $$
begin
  execute 'alter table public.plan_kpi_snapshots enable row level security';

  drop policy if exists "members read plan_kpi_snapshots" on public.plan_kpi_snapshots;
  create policy "members read plan_kpi_snapshots" on public.plan_kpi_snapshots
    for select to authenticated
    using ( (select private.has_permission(org_id, 'reports.read')) );

  drop policy if exists "managers write plan_kpi_snapshots" on public.plan_kpi_snapshots;
  create policy "managers write plan_kpi_snapshots" on public.plan_kpi_snapshots
    for all to authenticated
    using ( (select private.has_permission(org_id, 'org.manage')) )
    with check ( (select private.has_permission(org_id, 'org.manage')) );
end $$;
