-- BloomOS Fundraising: Gift Tables (specs/fundraising-gift-tables.md, v3).
--
-- A gift table is a fundraising window's pyramid — level sizes × how many
-- gifts are needed — plus the part that makes it worth building: the real
-- names placed at each level, the warm path to each of them, and the money
-- that has actually been traced to the table.
--
-- Four tables:
--   fr_gift_tables            the window, target, multiplier, coverage basis
--   fr_gift_table_levels      gift size × gifts needed × prospects per gift
--   fr_gift_table_placements  household-first names at a level, with scores
--   fr_gift_table_credits     explicit attribution of money to this table
--
-- NOTHING is stored that can be computed. Table goal, table shape, credited
-- value, names per level, gaps, work groups, and the verdict are all derived
-- at read time in lib/fundraising/gift-table.ts. Only what a human decides is
-- persisted — the same discipline as fundraising_plan.sql.
--
-- Conventions match fundraising_plan.sql: set_updated_at trigger on the
-- mutable tables with its search_path re-pinned, per-domain fundraising RLS,
-- and — per the tenant-default ratchet — NO hardcoded org_id default.
--
-- Idempotent. Apply via the Supabase dashboard.
--
-- ── Why triggers and not just RLS ─────────────────────────────────────────
-- RLS decides which rows a caller may see and write. It cannot tell that a
-- placement's org_id says one tenant while its constituent_id points at
-- another's record. The org-match triggers below make that impossible at the
-- database, for every write path including service-role ones. They are
-- SECURITY DEFINER on purpose: the check must be a real comparison of org
-- ids, not an accident of what the caller could see.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
-- `create or replace` wipes the function's SET clause, so re-pin the
-- search_path that pin_function_search_path.sql put on the production copy
-- (Supabase lint 0011); without this line, applying this file would silently
-- un-harden every set_updated_at trigger in the database.
alter function public.set_updated_at() set search_path = public, extensions, pg_temp;

-- ── The pledged flag ─────────────────────────────────────────────────────
-- "Pledged" is a per-org stage decision, not a key. AA, EPA YL, YGB and
-- SafeSpace all happen to run a stage keyed 'pledged' at stage_type = open,
-- but nothing tenant-neutral distinguishes it from any other open ask. This
-- flag is that distinction. Default false: a stage is an ordinary open stage
-- until a human says otherwise. seed_pledged_stage_flag.MANUAL.sql sets it.
alter table public.pipeline_stages
  add column if not exists counts_as_pledged boolean not null default false;

comment on column public.pipeline_stages.counts_as_pledged is
  'True when an OPEN stage means the donor has committed but the money has not landed (specs/fundraising-gift-tables.md). Gift tables read this instead of hardcoding a ''pledged'' key. Meaningless on won/lost/on_hold stages.';

-- ── fr_gift_tables ───────────────────────────────────────────────────────

create table if not exists fr_gift_tables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  -- The window is explicit dates, never a plan_year: AA runs Sept 14 to
  -- Dec 31, EPA YL runs a fiscal year, SafeSpace runs three years.
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft'
    check (status in ('draft','active','closed','archived')),
  -- What the window must raise, before slippage.
  target numeric(14,2) not null default 0 check (target >= 0),
  -- Asks that don't close, gifts that come in under, timing that slips.
  multiplier numeric(6,3) not null default 1.0 check (multiplier > 0),
  -- Round the goal to this multiple. EPA rounds to 1000 ($238,108.80 becomes
  -- $238,000); AA and SafeSpace leave it null and take the exact product.
  goal_round_to integer check (goal_round_to is null or goal_round_to > 0),
  -- What a level's amount means when it is counted. A $25,000/year level on
  -- a 3-year term is $25,000 on an annual table and $75,000 on a full-term
  -- one — the same row, two honest numbers, never merged.
  coverage_basis text not null default 'window'
    check (coverage_basis in ('window','annual','full_term')),
  default_term_years int not null default 1
    check (default_term_years between 1 and 20),
  -- Monthly giving is modeled, not pledged. Anything derived from this
  -- carries an "estimated" badge in the UI.
  monthly_modeled_years int not null default 1
    check (monthly_modeled_years between 1 and 20),
  -- Qualified prospects per closed gift. Major-gift standard is 4 at the top
  -- of the table, 3 in the middle, 1 at the appeal base.
  ratio_major numeric(5,2) not null default 4 check (ratio_major > 0),
  ratio_mid numeric(5,2) not null default 3 check (ratio_mid > 0),
  ratio_base numeric(5,2) not null default 1 check (ratio_base > 0),
  -- Level amount at or above which ratio_major applies. Null = the table's
  -- levels carry their own prospects_per_gift and no band is inferred.
  major_threshold numeric(14,2)
    check (major_threshold is null or major_threshold > 0),
  -- Why this target, and why this multiplier. A gift table that can't say
  -- why it's built on $350,000 is a spreadsheet.
  target_rationale text,
  multiplier_rationale text,
  notes text,
  strategy_id uuid references fr_plan_strategies(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  closed_at timestamptz,
  -- Plan vs actual, frozen at close: goal, shape, credited by level, names by
  -- level, conversion by level, gaps. Written once by the close action.
  closed_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fr_gift_tables_window_check check (ends_on >= starts_on)
);
create index if not exists fr_gift_tables_org_status_idx
  on fr_gift_tables (org_id, status, starts_on desc);
create index if not exists fr_gift_tables_campaign_idx
  on fr_gift_tables (campaign_id) where campaign_id is not null;
create index if not exists fr_gift_tables_strategy_idx
  on fr_gift_tables (strategy_id) where strategy_id is not null;

-- ── fr_gift_table_levels ─────────────────────────────────────────────────

create table if not exists fr_gift_table_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  gift_table_id uuid not null references fr_gift_tables(id) on delete cascade,
  label text not null,
  -- ALWAYS native to the cadence: $25,000 one-time, $25,000 per year, $500
  -- per month. The UI derives annualized and full-term values; it never
  -- stores them, because a stored derivation is a number that goes stale.
  amount numeric(14,2) not null check (amount > 0),
  cadence text not null default 'one_time'
    check (cadence in ('one_time','annual','monthly')),
  -- Annual levels only; null falls back to the table's default_term_years.
  term_years int check (term_years is null or term_years between 1 and 20),
  gifts_needed int not null check (gifts_needed >= 1),
  prospects_per_gift int not null default 1 check (prospects_per_gift >= 1),
  -- What this level buys, in the case's own words ("One school year, start
  -- to finish"). It is what the ask is made with.
  purpose text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fr_gift_table_levels_table_idx
  on fr_gift_table_levels (gift_table_id, sort);

-- ── fr_gift_table_placements ─────────────────────────────────────────────

create table if not exists fr_gift_table_placements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  gift_table_id uuid not null references fr_gift_tables(id) on delete cascade,
  -- RESTRICT, not cascade: a level with names on it cannot be deleted out
  -- from under them. The levels editor updates rows in place and removes
  -- only empty levels — a wholesale delete-and-reinsert would orphan every
  -- placement on the table, silently.
  level_id uuid not null references fr_gift_table_levels(id) on delete restrict,
  -- RESTRICT for the same reason, and one more: the constituent merge route
  -- hard-deletes the duplicate record. Without this, a merge would take the
  -- placement — and the scores, the warm path, the why-note — with it. With
  -- it, a merge that forgets placements fails loudly instead.
  constituent_id uuid not null references constituents(id) on delete restrict,
  -- Set by trigger from the constituent, NEVER from the request body.
  household_id uuid references households(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  target_amount numeric(14,2) check (target_amount is null or target_amount >= 0),
  -- Per-placement overrides of the level's cadence and term (a donor who
  -- will give $25,000 once where the level is $25,000 a year for three).
  cadence text check (cadence is null or cadence in ('one_time','annual','monthly')),
  term_years int check (term_years is null or term_years between 1 and 20),
  -- Four factors, scored separately and NEVER averaged into one number.
  -- Capacity and affinity can be suggested from giving history; connection
  -- and readiness only a human knows.
  capacity_score smallint check (capacity_score is null or capacity_score between 1 and 5),
  affinity_score smallint check (affinity_score is null or affinity_score between 1 and 5),
  connection_score smallint check (connection_score is null or connection_score between 1 and 5),
  readiness_score smallint check (readiness_score is null or readiness_score between 1 and 5),
  -- "Susan knows her well and will make the intro." A connection score of 4
  -- is a number; this is the thing somebody can act on Monday.
  warm_path text,
  why_note text,
  -- Manual status for an unlinked placement. Once opportunity_id is set the
  -- status is DERIVED from the opportunity's stage at read time and this
  -- column stops being displayed (lib/fundraising/gift-table.ts).
  status text not null default 'prospect'
    check (status in ('prospect','cultivating','ready','declined','removed')),
  next_step text,
  next_step_due date,
  -- Assignee-slug convention (lib/admin/assignees.ts): the lowercased first
  -- token of a member's display name. Same shape as ops_tasks.assigned_to.
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fr_gift_table_placements_table_level_idx
  on fr_gift_table_placements (gift_table_id, level_id);
create index if not exists fr_gift_table_placements_constituent_idx
  on fr_gift_table_placements (constituent_id);
create index if not exists fr_gift_table_placements_household_idx
  on fr_gift_table_placements (household_id) where household_id is not null;
create index if not exists fr_gift_table_placements_opportunity_idx
  on fr_gift_table_placements (opportunity_id) where opportunity_id is not null;
-- The Move card and the /admin/fundraising/today queue.
create index if not exists fr_gift_table_placements_next_step_idx
  on fr_gift_table_placements (org_id, next_step_due)
  where next_step_due is not null and status not in ('declined','removed');

-- Household-first, enforced here rather than deduped at render. Two partial
-- indexes, because "one per household" and "one per person" apply to
-- different rows: a householded constituent is guarded by the household, an
-- unhouseholded one by themselves. A removed placement releases its slot.
create unique index if not exists fr_gift_table_placements_household_uniq
  on fr_gift_table_placements (gift_table_id, household_id)
  where household_id is not null and status <> 'removed';
create unique index if not exists fr_gift_table_placements_constituent_uniq
  on fr_gift_table_placements (gift_table_id, constituent_id)
  where household_id is null and status <> 'removed';

-- ── fr_gift_table_credits ────────────────────────────────────────────────

create table if not exists fr_gift_table_credits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  gift_table_id uuid not null references fr_gift_tables(id) on delete cascade,
  -- No FK: source_id points into one of four tables by source_type. The
  -- org-match trigger below resolves and validates it on every write, which
  -- is the check an FK would have given us and a tenant check besides.
  source_type text not null
    check (source_type in ('gift','pledge','recurring_plan','grant')),
  source_id uuid not null,
  placement_id uuid references fr_gift_table_placements(id) on delete set null,
  attributed_by text,
  note text,
  created_at timestamptz not null default now()
);
-- One credit per source per table. A source may be credited to two tables
-- with overlapping windows (a year-end push nested inside an annual table);
-- the UI shows an overlap warning on both rather than forbidding it.
create unique index if not exists fr_gift_table_credits_source_uniq
  on fr_gift_table_credits (gift_table_id, source_type, source_id);
create index if not exists fr_gift_table_credits_lookup_idx
  on fr_gift_table_credits (org_id, source_type, source_id);
create index if not exists fr_gift_table_credits_placement_idx
  on fr_gift_table_credits (placement_id) where placement_id is not null;

-- ── Guards ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER with an empty search_path (the owner_uuid_promotion.sql
-- pattern): every referenced object is schema-qualified, and the check sees
-- real rows rather than RLS-filtered ones, so a cross-tenant id produces a
-- precise "belongs to another org" error instead of a confusing "not found".

create or replace function public.fr_gift_table_levels_org_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  parent_org uuid;
begin
  select t.org_id into parent_org
  from public.fr_gift_tables t where t.id = new.gift_table_id;
  if parent_org is null then
    raise exception 'gift table % does not exist', new.gift_table_id;
  end if;
  if parent_org <> new.org_id then
    raise exception 'level org_id % does not match gift table %''s org_id %',
      new.org_id, new.gift_table_id, parent_org;
  end if;
  return new;
end;
$$;

create or replace function public.fr_gift_table_placements_org_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  parent_org uuid;
  level_org uuid;
  level_table uuid;
  con_org uuid;
  opp_org uuid;
begin
  select t.org_id into parent_org
  from public.fr_gift_tables t where t.id = new.gift_table_id;
  if parent_org is null then
    raise exception 'gift table % does not exist', new.gift_table_id;
  end if;
  if parent_org <> new.org_id then
    raise exception 'placement org_id % does not match gift table %''s org_id %',
      new.org_id, new.gift_table_id, parent_org;
  end if;

  select l.org_id, l.gift_table_id into level_org, level_table
  from public.fr_gift_table_levels l where l.id = new.level_id;
  if level_org is null then
    raise exception 'gift table level % does not exist', new.level_id;
  end if;
  if level_table <> new.gift_table_id then
    raise exception 'level % belongs to gift table %, not %',
      new.level_id, level_table, new.gift_table_id;
  end if;

  select c.org_id into con_org
  from public.constituents c where c.id = new.constituent_id;
  if con_org is null then
    raise exception 'constituent % does not exist', new.constituent_id;
  end if;
  if con_org <> new.org_id then
    raise exception 'constituent % belongs to another org', new.constituent_id;
  end if;

  if new.opportunity_id is not null then
    select o.org_id into opp_org
    from public.opportunities o where o.id = new.opportunity_id;
    if opp_org is null then
      raise exception 'opportunity % does not exist', new.opportunity_id;
    end if;
    if opp_org <> new.org_id then
      raise exception 'opportunity % belongs to another org', new.opportunity_id;
    end if;
  end if;

  return new;
end;
$$;

-- Household is DERIVED, always, from the constituent's current household.
-- A request body that supplies household_id is ignored: the whole point of
-- household-first placement is that the grouping can't be talked out of.
create or replace function public.fr_gift_table_placements_set_household()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  select c.household_id into new.household_id
  from public.constituents c where c.id = new.constituent_id;
  return new;
end;
$$;

create or replace function public.fr_gift_table_credits_org_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  parent_org uuid;
  source_org uuid;
  placement_table uuid;
begin
  select t.org_id into parent_org
  from public.fr_gift_tables t where t.id = new.gift_table_id;
  if parent_org is null then
    raise exception 'gift table % does not exist', new.gift_table_id;
  end if;
  if parent_org <> new.org_id then
    raise exception 'credit org_id % does not match gift table %''s org_id %',
      new.org_id, new.gift_table_id, parent_org;
  end if;

  -- Resolve source_id in the table its source_type names. This is the check
  -- a foreign key would give us, plus the tenant check it would not.
  if new.source_type = 'gift' then
    select g.org_id into source_org from public.gifts g where g.id = new.source_id;
  elsif new.source_type = 'pledge' then
    select p.org_id into source_org from public.pledges p where p.id = new.source_id;
  elsif new.source_type = 'recurring_plan' then
    select r.org_id into source_org from public.recurring_plans r where r.id = new.source_id;
  elsif new.source_type = 'grant' then
    select gr.org_id into source_org from public.grants gr where gr.id = new.source_id;
  end if;
  if source_org is null then
    raise exception '% % does not exist', new.source_type, new.source_id;
  end if;
  if source_org <> new.org_id then
    raise exception '% % belongs to another org', new.source_type, new.source_id;
  end if;

  if new.placement_id is not null then
    select pl.gift_table_id into placement_table
    from public.fr_gift_table_placements pl where pl.id = new.placement_id;
    if placement_table is null then
      raise exception 'placement % does not exist', new.placement_id;
    end if;
    if placement_table <> new.gift_table_id then
      raise exception 'placement % is on gift table %, not %',
        new.placement_id, placement_table, new.gift_table_id;
    end if;
  end if;

  return new;
end;
$$;

-- ── Triggers, RLS ────────────────────────────────────────────────────────
-- BEFORE triggers fire in name order, so `_org_guard` runs before
-- `_set_household`: validate the constituent, then derive from it.

do $$
declare
  t text;
begin
  execute 'drop trigger if exists fr_gift_tables_set_updated_at on fr_gift_tables';
  execute 'create trigger fr_gift_tables_set_updated_at before update on fr_gift_tables for each row execute function set_updated_at()';
  execute 'drop trigger if exists fr_gift_table_levels_set_updated_at on fr_gift_table_levels';
  execute 'create trigger fr_gift_table_levels_set_updated_at before update on fr_gift_table_levels for each row execute function set_updated_at()';
  execute 'drop trigger if exists fr_gift_table_placements_set_updated_at on fr_gift_table_placements';
  execute 'create trigger fr_gift_table_placements_set_updated_at before update on fr_gift_table_placements for each row execute function set_updated_at()';

  execute 'drop trigger if exists fr_gift_table_levels_org_guard on fr_gift_table_levels';
  execute 'create trigger fr_gift_table_levels_org_guard before insert or update on fr_gift_table_levels for each row execute function public.fr_gift_table_levels_org_guard()';
  execute 'drop trigger if exists fr_gift_table_placements_org_guard on fr_gift_table_placements';
  execute 'create trigger fr_gift_table_placements_org_guard before insert or update on fr_gift_table_placements for each row execute function public.fr_gift_table_placements_org_guard()';
  execute 'drop trigger if exists fr_gift_table_placements_set_household on fr_gift_table_placements';
  execute 'create trigger fr_gift_table_placements_set_household before insert or update on fr_gift_table_placements for each row execute function public.fr_gift_table_placements_set_household()';
  execute 'drop trigger if exists fr_gift_table_credits_org_guard on fr_gift_table_credits';
  execute 'create trigger fr_gift_table_credits_org_guard before insert or update on fr_gift_table_credits for each row execute function public.fr_gift_table_credits_org_guard()';

  foreach t in array array[
    'fr_gift_tables','fr_gift_table_levels','fr_gift_table_placements','fr_gift_table_credits'
  ] loop
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

-- ── Verify ───────────────────────────────────────────────────────────────
--
-- select count(*) from information_schema.columns
--  where table_schema='public' and table_name='pipeline_stages'
--    and column_name='counts_as_pledged';
-- Expect: 1
--
-- select tablename, rowsecurity from pg_tables
--  where schemaname='public' and tablename like 'fr_gift_table%' order by 1;
-- Expect: 4 rows, rowsecurity true on all four.
--
-- select tablename, count(*) from pg_policies
--  where schemaname='public' and tablename like 'fr_gift_table%'
--  group by 1 order by 1;
-- Expect: 2 policies each (members read / members write).
--
-- select c.relname, count(*) from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--  where not t.tgisinternal and c.relname like 'fr_gift_table%'
--  group by 1 order by 1;
-- Expect: fr_gift_table_credits 1, fr_gift_table_levels 2,
--         fr_gift_table_placements 3, fr_gift_tables 1.
--
-- select indexname from pg_indexes
--  where schemaname='public' and tablename='fr_gift_table_placements'
--    and indexname like '%uniq' order by 1;
-- Expect: fr_gift_table_placements_constituent_uniq,
--         fr_gift_table_placements_household_uniq.
--
-- select adsrc.adrelid::regclass as tbl
--   from pg_attrdef adsrc
--   join pg_attribute a on a.attrelid = adsrc.adrelid and a.attnum = adsrc.adnum
--  where a.attname = 'org_id'
--    and adsrc.adrelid::regclass::text like 'fr_gift_table%';
-- Expect: 0 rows — no org_id default on any of the four (tenant ratchet).
