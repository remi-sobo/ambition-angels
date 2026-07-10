-- Metric Catalog — Phase 1: schema (specs: BloomOS V3 #3).
--
-- metric_definitions is the org's catalog: one row per metric — key, name,
-- department, unit, direction, cadence, uuid owner, source kind, target.
-- metric_snapshots is the single history table: manual entry and automated
-- capture write the same shape. Freshness is DERIVED at read time (latest
-- snapshot vs cadence) — no stored staleness flag to drift.
--
-- Definitions are ORG-SCOPED (open decision B): a tenant's metrics, targets,
-- owners, and cadences are their data. What a source_key MEANS is global code
-- (lib/admin/metrics/resolvers.ts) — the tiers-in-data principle, no tenant
-- conditionals in resolver code.
--
-- metric_key adopts the vocabulary ALREADY IN USE by plan_kpis.metric_key and
-- the PLAN_METRICS registry (Phase 0 recon: all 25 live rows carry keys like
-- 'cash_runway_months', 'dollars_raised_fy26', 'active_teens') — the catalog
-- defines those keys, it does not invent parallel ones.
--
-- org_id from session on both tables, NO column default. This spec ultimately
-- deletes one instance of the AA-default trap (kpi_settings, Phase 5).

create table if not exists public.metric_definitions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  metric_key    text not null,                    -- stable slug, e.g. 'cash_runway_months'
  name          text not null,
  description   text,
  department    text,                             -- 'finance','fundraising','program','ops','strategy'
  unit          text,                             -- 'months','usd','count','pct','boolean'
  direction     text not null default 'up'
    check (direction in ('up','down')),           -- which way is good
  cadence       text not null default 'monthly'
    check (cadence in ('daily','weekly','monthly','quarterly')),
  source_kind   text not null default 'manual'
    check (source_kind in ('manual','computed')),
  source_key    text,                             -- names a code resolver when computed
  target        numeric,
  baseline      numeric,
  baseline_date date,
  owner_id      uuid references public.profiles(user_id), -- uuid from day one
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, metric_key)
);

drop trigger if exists metric_definitions_set_updated_at on public.metric_definitions;
create trigger metric_definitions_set_updated_at
  before update on public.metric_definitions
  for each row execute function public.set_updated_at();

-- One history, one shape. Append-only in practice: corrections are new
-- snapshots with a note; delete is metrics.admin only. The unique constraint
-- is the cron double-write guard — computed capture upserts on it.
create table if not exists public.metric_snapshots (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  metric_id   uuid not null references public.metric_definitions(id) on delete cascade,
  captured_on date not null,
  value       numeric not null,
  captured_by uuid references public.profiles(user_id), -- null for cron/computed
  note        text,
  created_at  timestamptz not null default now(),
  unique (metric_id, captured_on)
);

create index if not exists metric_snapshots_latest_idx
  on public.metric_snapshots (org_id, metric_id, captured_on desc);
create index if not exists metric_definitions_org_idx
  on public.metric_definitions (org_id, active);

alter table public.metric_definitions enable row level security;
alter table public.metric_snapshots   enable row level security;

drop policy if exists "read metric_definitions" on public.metric_definitions;
create policy "read metric_definitions" on public.metric_definitions
  for select to authenticated
  using ( (select private.has_permission(org_id, 'metrics.read')) );

drop policy if exists "write metric_definitions" on public.metric_definitions;
create policy "write metric_definitions" on public.metric_definitions
  for insert to authenticated
  with check ( (select private.has_permission(org_id, 'metrics.write')) );

drop policy if exists "update metric_definitions" on public.metric_definitions;
create policy "update metric_definitions" on public.metric_definitions
  for update to authenticated
  using ( (select private.has_permission(org_id, 'metrics.write')) )
  with check ( (select private.has_permission(org_id, 'metrics.write')) );

drop policy if exists "delete metric_definitions" on public.metric_definitions;
create policy "delete metric_definitions" on public.metric_definitions
  for delete to authenticated
  using ( (select private.has_permission(org_id, 'metrics.admin')) );

drop policy if exists "read metric_snapshots" on public.metric_snapshots;
create policy "read metric_snapshots" on public.metric_snapshots
  for select to authenticated
  using ( (select private.has_permission(org_id, 'metrics.read')) );

drop policy if exists "write metric_snapshots" on public.metric_snapshots;
create policy "write metric_snapshots" on public.metric_snapshots
  for insert to authenticated
  with check ( (select private.has_permission(org_id, 'metrics.write')) );

-- Corrections preferred over deletes; delete stays admin-only.
drop policy if exists "delete metric_snapshots" on public.metric_snapshots;
create policy "delete metric_snapshots" on public.metric_snapshots
  for delete to authenticated
  using ( (select private.has_permission(org_id, 'metrics.admin')) );

-- Register in the spine so tasks/comments can be about a metric and the
-- resolver can label + link one. module 'metrics' matches the permission
-- prefix, same convention as every other registry row.
insert into public.entity_types (entity_type, display_name, module, route_pattern, icon)
values ('metric', 'Metric', 'metrics', '/admin/kpis', 'bar-chart')
on conflict (entity_type) do nothing;

-- Permission seeds. board_viewer READS (open decision D, approved): the
-- scorecard and board pack they already consume read through the catalog.
insert into public.role_permissions (role, permission) values
  ('owner',        'metrics.read'),
  ('owner',        'metrics.write'),
  ('owner',        'metrics.admin'),
  ('admin',        'metrics.read'),
  ('admin',        'metrics.write'),
  ('admin',        'metrics.admin'),
  ('staff',        'metrics.read'),
  ('staff',        'metrics.write'),
  ('finance',      'metrics.read'),
  ('finance',      'metrics.write'),
  ('board_viewer', 'metrics.read')
on conflict do nothing;
