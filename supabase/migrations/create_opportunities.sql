-- BloomOS Ring 2: Major Gifts opportunities pipeline.
-- Schema per docs/bloomos/05-data-model.md §3 "Opportunity (Major Gift Ask)";
-- product behavior per modules/03-fundraising.md "Major Gifts". Stages are
-- the canonical moves-management loop (Identification → Qualification →
-- Cultivation → Solicitation → Stewardship); 'lost' exits the loop, and a
-- stewarded donor re-enters by getting a fresh opportunity.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  constituent_id uuid not null references constituents(id) on delete cascade,
  -- Optional label ("FY27 leadership ask"); UI falls back to the
  -- constituent's name.
  name text,
  stage text not null default 'identify' check (stage in
    ('identify','qualify','cultivate','solicit','steward','lost')),
  ask_amount numeric(12,2) check (ask_amount is null or ask_amount >= 0),
  expected_close date,
  -- Subjective close likelihood, used for weighted pipeline value
  -- (ask × probability) across the open stages.
  probability int check (probability is null or (probability between 0 and 100)),
  capacity_rating int check (capacity_rating is null or (capacity_rating between 1 and 5)),
  affinity_rating int check (affinity_rating is null or (affinity_rating between 1 and 5)),
  owner text,
  next_step text,
  next_step_due date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists opportunities_org_idx on opportunities (org_id);
create index if not exists opportunities_stage_idx on opportunities (stage);
create index if not exists opportunities_constituent_idx on opportunities (constituent_id);
create index if not exists opportunities_next_step_idx on opportunities (next_step_due)
  where stage not in ('steward','lost');

-- updated_at trigger, resident org default, fundraising-domain RLS — same
-- patterns as create_fundraising_core.sql / create_grants.sql.
do $$
declare
  aa uuid;
  t text := 'opportunities';
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
  execute format(
    'create trigger %I before update on %I for each row execute function set_updated_at()',
    t || '_set_updated_at', t);

  execute format('alter table %I alter column org_id set default %L', t, aa);

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
end $$;
