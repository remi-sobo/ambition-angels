-- Metric Catalog — Phase 2: plan_kpis backfill (specs: BloomOS V3 #3).
--
-- Links the live strategy scorecard into the catalog: every plan_kpis row
-- gets a metric_definitions entry (same metric_key — the key vocabulary was
-- already in use, Phase 0 recon) and a metric_id pointer; plan_kpi_snapshots
-- history is copied into metric_snapshots. REVERSIBLE: plan_kpis keeps every
-- column and plan_kpi_snapshots is left untouched (open decision C, approved:
-- link and swap reads, don't strip).
--
-- Owner promotion is best-effort text → uuid via profiles.display_name
-- (case-insensitive). Phase 0 recon mapped the live values: 'Remi' and
-- 'Shannon' match profiles; 'Demetric' has NO profile and stays null —
-- flagged by the NOTICE below for manual assignment on the hub.
--
-- Also seeds the two v1 computed metrics that have no plan_kpis row
-- (monthly_burn, gifts_this_month), scoped per org that already has a plan —
-- data-driven, no hardcoded org id.

alter table public.plan_kpis
  add column if not exists metric_id uuid references public.metric_definitions(id);

-- 1) A definition per live plan_kpis row. Unit vocabulary normalized
-- ('$' → 'usd', 'percent' → 'pct'); department derived from the key family.
insert into public.metric_definitions
  (org_id, metric_key, name, department, unit, direction, cadence, source_kind, source_key,
   target, baseline, baseline_date, owner_id, active)
select
  k.org_id,
  k.metric_key,
  k.title,
  case
    when k.metric_key like 'cash_%'                                   then 'finance'
    when k.metric_key like 'dollars_%' or k.metric_key like 'floor_source_%'
      or k.metric_key like 'corporate_%' or k.metric_key like 'grants_%'
      or k.metric_key like 'aig_%' or k.metric_key like 'weighted_%'
      or k.metric_key like 'donor_%'                                  then 'fundraising'
    when k.metric_key like '%teen%' or k.metric_key like 'parents_%'
      or k.metric_key like 'partners_%' or k.metric_key like 'coach_%'
      or k.metric_key like 'careers_%' or k.metric_key like 'fos_%'
      or k.metric_key like 'pilot_%' or k.metric_key like 'deeply_%'  then 'program'
    else 'ops'
  end,
  case k.unit when '$' then 'usd' when 'percent' then 'pct' else k.unit end,
  'up',
  case when k.cadence in ('daily','weekly','monthly','quarterly') then k.cadence else 'monthly' end,
  case k.source when 'auto' then 'computed' else 'manual' end,
  case when k.source = 'auto' then k.metric_key end,
  k.target,
  k.baseline,
  k.baseline_date,
  p.user_id,
  true
from public.plan_kpis k
left join public.profiles p on lower(p.display_name) = lower(k.owner)
where k.metric_key is not null
on conflict (org_id, metric_key) do nothing;

-- Flag text owners that found no profile (manual assignment on the hub).
do $$
declare unmatched text;
begin
  select string_agg(distinct k.owner, ', ') into unmatched
  from public.plan_kpis k
  left join public.profiles p on lower(p.display_name) = lower(k.owner)
  where k.owner is not null and p.user_id is null;
  if unmatched is not null then
    raise notice 'metrics backfill: plan_kpis owners with no matching profile (left null): %', unmatched;
  end if;
end $$;

-- 2) Point each plan_kpis row at its definition.
update public.plan_kpis k
set metric_id = d.id
from public.metric_definitions d
where k.metric_id is null
  and k.metric_key is not null
  and d.org_id = k.org_id
  and d.metric_key = k.metric_key;

-- 3) History: copy plan_kpi_snapshots into the one snapshot table.
insert into public.metric_snapshots (org_id, metric_id, captured_on, value)
select s.org_id, k.metric_id, s.captured_on, s.value
from public.plan_kpi_snapshots s
join public.plan_kpis k on k.id = s.kpi_id
where k.metric_id is not null
on conflict (metric_id, captured_on) do nothing;

-- 4) Seed each KPI's current value as a snapshot dated to its last update, so
-- the hub has a value and a freshness age on day one.
insert into public.metric_snapshots (org_id, metric_id, captured_on, value)
select k.org_id, k.metric_id, coalesce(k.last_updated_at::date, current_date), k.current
from public.plan_kpis k
where k.metric_id is not null and k.current is not null
on conflict (metric_id, captured_on) do nothing;

-- 5) The two v1 computed metrics with no plan_kpis row, per org with a plan.
insert into public.metric_definitions
  (org_id, metric_key, name, description, department, unit, direction, cadence, source_kind, source_key)
select o.org_id, v.metric_key, v.name, v.description, v.department, v.unit, v.direction, v.cadence, 'computed', v.metric_key
from (select distinct org_id from public.plan_kpis) o
cross join (values
  ('monthly_burn', 'Monthly burn', 'Trailing 3-active-month average monthly expense, from the canonical finance snapshot.', 'finance', 'usd', 'down', 'weekly'),
  ('gifts_this_month', 'Gifts this month', 'Count of gifts received month-to-date.', 'fundraising', 'count', 'up', 'daily')
) as v(metric_key, name, description, department, unit, direction, cadence)
on conflict (org_id, metric_key) do nothing;
