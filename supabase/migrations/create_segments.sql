-- BloomOS Ring 2: saved donor segments (modules/03-fundraising.md "Segments").
-- A segment is a named filter definition; the CSV export route and the
-- donors UI interpret it. Fundraising-domain RLS, same pattern as siblings.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists segments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  -- { q, type, source, tag, min_total, since } — interpreted by
  -- /api/admin/donors/export and the donors UI.
  definition jsonb not null default '{}',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists segments_org_idx on segments (org_id);

do $$
declare
  aa uuid;
  t text := 'segments';
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
