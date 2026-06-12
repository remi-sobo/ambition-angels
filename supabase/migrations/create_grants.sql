-- BloomOS Ring 2: grants pipeline + requirements calendar.
-- Schema per docs/bloomos/05-data-model.md §3; product behavior per
-- modules/03-fundraising.md "Grants". The requirements table IS the
-- calendar: every deadline a funder ever gave us lives here, never in
-- someone's head.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  -- Funder is an organization constituent (shared record with its people).
  funder_id uuid references constituents(id) on delete set null,
  name text not null,
  stage text not null default 'prospect' check (stage in
    ('prospect','qualified','loi','proposal','submitted','awarded','declined','active','closed')),
  amount_requested numeric(12,2),
  amount_awarded numeric(12,2),
  restrictions text,
  -- Restricted awards link to the restricted fund they feed (Finance).
  fund_id uuid references funds(id) on delete set null,
  period_start date,
  period_end date,
  -- Free-form until the Program module lands real program records (Ring 3).
  program text,
  owner text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grants_org_id_idx on grants (org_id);
create index if not exists grants_stage_idx on grants (stage);
create index if not exists grants_funder_idx on grants (funder_id);

create table if not exists grant_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  grant_id uuid not null references grants(id) on delete cascade,
  kind text not null check (kind in
    ('loi','application','interim_report','final_report','financial_report','other')),
  label text,
  due_date date not null,
  status text not null default 'upcoming' check (status in
    ('upcoming','in_progress','submitted','waived')),
  submitted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grant_requirements_grant_idx on grant_requirements (grant_id);
create index if not exists grant_requirements_due_idx on grant_requirements (due_date)
  where status in ('upcoming','in_progress');

-- updated_at triggers, resident org default, fundraising-domain RLS —
-- same patterns as create_fundraising_core.sql.
do $$
declare
  aa uuid;
  t text;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  foreach t in array array['grants','grant_requirements'] loop
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
  end loop;
end $$;
