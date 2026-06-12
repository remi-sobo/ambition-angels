-- BloomOS Ring 4: board governance (modules/07-governance.md "Board").
-- The lifecycle pieces the affordable portals all skip: terms with expiry,
-- annual COI disclosures (Form 990 Part VI Q12), board-giving status (via
-- the constituent link to real gifts), and meetings with quorum-checked
-- attendance and approve-then-freeze minutes.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists board_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  -- Link to the party record: giving status reads real gifts through it.
  constituent_id uuid references constituents(id) on delete set null,
  name text not null,
  email text,
  officer_role text not null default 'member' check (officer_role in
    ('chair','vice_chair','secretary','treasurer','member')),
  term_start date,
  term_end date,
  term_number int not null default 1,
  coi_signed_at date,                -- latest annual conflict-of-interest disclosure
  status text not null default 'active' check (status in ('active','emeritus','past')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists board_members_org_idx on board_members (org_id);

create table if not exists board_meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  meeting_date date not null,
  title text not null default 'Board meeting',
  -- [{ title, kind: 'normal'|'consent', notes }]
  agenda jsonb not null default '[]',
  -- [{ member_id, present }]
  attendance jsonb not null default '[]',
  quorum_met boolean,
  minutes text,
  minutes_status text not null default 'draft' check (minutes_status in ('draft','approved')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists board_meetings_org_idx on board_meetings (org_id);
create index if not exists board_meetings_date_idx on board_meetings (meeting_date desc);

do $$
declare
  aa uuid;
  t text;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  foreach t in array array['board_members','board_meetings'] loop
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
        using ( (select private.has_permission(org_id, 'board.read')) )
      $p$, 'members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for all to authenticated
        using ( (select private.has_permission(org_id, 'board.write')) )
        with check ( (select private.has_permission(org_id, 'board.write')) )
      $p$, 'members write ' || t, t);
  end loop;
end $$;
