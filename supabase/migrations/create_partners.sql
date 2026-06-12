-- BloomOS Ring 3: schools & nonprofit partners (modules/02-program.md
-- "Schools"). The partner CRM: status pipeline (prospect → anchor),
-- champion contact, MOU/data-agreement tracking with end dates, and a
-- last-touch field for cadence health. Inbound signups from the public
-- /program-partners form are imported as prospects (idempotent).

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  -- Optional link to the organization constituent (shared party record —
  -- a school can also be a funder).
  constituent_id uuid references constituents(id) on delete set null,
  name text not null,
  kind text not null default 'school' check (kind in
    ('school','district','nonprofit','company','other')),
  status text not null default 'prospect' check (status in
    ('prospect','outreach','pilot','active','anchor','lapsed')),
  champion_name text,
  champion_email text,
  champion_role text,
  teen_count text,
  program_type text,
  mou_status text not null default 'none' check (mou_status in
    ('none','drafting','sent','signed')),
  mou_start date,
  mou_end date,
  data_agreement_signed date,
  referral text,
  notes text,
  last_touch_at date,
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partners_org_idx on partners (org_id);
create index if not exists partners_status_idx on partners (status);
create unique index if not exists partners_external_idx
  on partners (external_source, external_id)
  where external_id is not null;

do $$
declare
  aa uuid;
  t text := 'partners';
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
      using ( (select private.has_permission(org_id, 'program.read')) )
    $p$, 'members read ' || t, t);
  execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
  execute format($p$
    create policy %I on public.%I
      for all to authenticated
      using ( (select private.has_permission(org_id, 'program.write')) )
      with check ( (select private.has_permission(org_id, 'program.write')) )
    $p$, 'members write ' || t, t);
end $$;

-- ── Import inbound signups as prospects (idempotent; re-runnable) ────────
-- Guarded: program_partners only exists where the public signup form has
-- run (it's missing in production — the form's insert path needs fixing,
-- tracked separately).

do $$
begin
  if to_regclass('public.program_partners') is null then
    raise notice 'program_partners not present — skipping import';
    return;
  end if;
  insert into partners (
  name, kind, status, champion_name, champion_email, teen_count,
  program_type, referral, external_source, external_id, last_touch_at
)
select
  p.org_name,
  'nonprofit',
  'prospect',
  trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
  lower(p.email),
  p.teen_count,
  p.program_type,
  p.referral,
  'program_partners', p.id::text,
  (p.created_at at time zone 'utc')::date
from program_partners p
where coalesce(p.org_name,'') <> ''
  on conflict (external_source, external_id) where external_id is not null
  do nothing;
end $$;
