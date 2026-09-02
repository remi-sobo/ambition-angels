-- BloomOS Fundraising: the Fundraising Plan (specs/fundraising-plan.md).
--
-- A plan year's goal decomposed into named strategies ("major gifts $120k,
-- monthly $30k, grants $25k…"). The strategies hold only what a human decides
-- — name, goal, owner, notes. Committed and pipeline figures are NEVER stored
-- here: they roll up live from the spine via nullable `plan_strategy_id`
-- links on opportunities, grants, and campaigns, so the plan can't drift into
-- a second source of truth.
--
-- `fr_plan_gift_levels` is the gift-range table under a strategy: gift size ×
-- how many needed. Identified/committed counts per level are computed at read
-- time from real opportunities (lib/fundraising/plan.ts), never stored.
--
-- Conventions match create_asks_log.sql: set_updated_at trigger on the mutable
-- table, per-domain fundraising RLS, and — per the tenant-default ratchet — NO
-- hardcoded org_id default; callers set org_id explicitly from context.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists fr_plan_strategies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  -- Calendar year the strategy raises for, matching the pipeline board's
  -- expected_close scoping (lib/fundraising/pipeline-year.ts). A fiscal-year
  -- offset is a later, additive org setting.
  plan_year int not null check (plan_year between 2000 and 2100),
  name text not null,
  goal numeric(12,2) not null default 0 check (goal >= 0),
  owner text,
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fr_plan_strategies_org_year_idx
  on fr_plan_strategies (org_id, plan_year, sort);
create unique index if not exists fr_plan_strategies_org_year_name_idx
  on fr_plan_strategies (org_id, plan_year, lower(name));

create table if not exists fr_plan_gift_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  strategy_id uuid not null references fr_plan_strategies(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  count_needed int not null check (count_needed >= 1),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists fr_plan_gift_levels_strategy_idx
  on fr_plan_gift_levels (strategy_id, sort);

-- Spine links: an object files under at most one strategy. `on delete set
-- null` so deleting a strategy releases its objects rather than orphaning or
-- cascading into real records.
alter table opportunities add column if not exists
  plan_strategy_id uuid references fr_plan_strategies(id) on delete set null;
alter table grants add column if not exists
  plan_strategy_id uuid references fr_plan_strategies(id) on delete set null;
alter table campaigns add column if not exists
  plan_strategy_id uuid references fr_plan_strategies(id) on delete set null;
create index if not exists opportunities_plan_strategy_idx
  on opportunities (plan_strategy_id) where plan_strategy_id is not null;
create index if not exists grants_plan_strategy_idx
  on grants (plan_strategy_id) where plan_strategy_id is not null;
create index if not exists campaigns_plan_strategy_idx
  on campaigns (plan_strategy_id) where plan_strategy_id is not null;

-- set_updated_at trigger (fr_plan_strategies only — gift levels are replaced
-- wholesale) and per-domain fundraising RLS. Deliberately no org_id default.
do $$
declare
  t text;
begin
  execute 'drop trigger if exists fr_plan_strategies_set_updated_at on fr_plan_strategies';
  execute 'create trigger fr_plan_strategies_set_updated_at before update on fr_plan_strategies for each row execute function set_updated_at()';

  foreach t in array array['fr_plan_strategies','fr_plan_gift_levels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using ( (select private.has_permission(org_id, 'fundraising.read')) )
      $p$, 'members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for all to authenticated
        using ( (select private.has_permission(org_id, 'fundraising.write')) )
        with check ( (select private.has_permission(org_id, 'fundraising.write')) )
      $p$, 'members write ' || t, t);
  end loop;
end $$;
