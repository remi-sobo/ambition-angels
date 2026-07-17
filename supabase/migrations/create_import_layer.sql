-- Import layer (spec #5, E1): staging schema + provenance ledger.
--
-- Ships DORMANT: no UI or writer exists yet. E2 adds the pure parse/validate
-- engine, E3 the wizard + commit path. Three tables:
--
--   imports       — one upload/run (later: one connector sync run).
--   import_rows   — staged rows: raw payload, normalized values, per-row
--                   status/verdict/error. Commit is re-entrant per row.
--   external_refs — the uniform provenance ledger (org, entity, source,
--                   external id). Unique, so re-importing the same source
--                   rows is idempotent. New machinery writes it uniformly;
--                   existing per-table external_id columns stay as-is.
--
-- Post-fence shape: org_id NOT NULL with NO default everywhere (the
-- tenant-default ratchet forbids new defaults). RLS is keyed to the TARGET
-- entity's module — a participant import is program data, a constituent
-- import is fundraising data — via private.has_permission, matching the
-- policies on the entities the import writes.

create table if not exists public.imports (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  entity_type text not null check (entity_type in ('student','constituent')),
  source      text not null default 'csv',   -- 'csv' now; 'hubspot' at E6
  filename    text,
  status      text not null default 'mapping' check (status in
                ('mapping','staged','committing','done','failed')),
  mapping     jsonb not null default '{}',   -- column → field key (spine or custom)
  counts      jsonb not null default '{}',   -- {total, valid, invalid, created, skipped}
  created_by  uuid,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists imports_org_idx
  on public.imports (org_id, created_at desc);

create table if not exists public.import_rows (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id),
  import_id         uuid not null references public.imports(id) on delete cascade,
  row_num           int not null,
  raw               jsonb not null,          -- the source row as parsed (PII — nulled on completion, spec §10.3)
  normalized        jsonb,                   -- mapped + coerced field values
  status            text not null default 'pending' check (status in
                      ('pending','valid','invalid','committed','skipped')),
  verdict           text check (verdict in ('create','skip')),
  matched_entity_id uuid,
  created_entity_id uuid,
  error             text
);
create unique index if not exists import_rows_run_idx
  on public.import_rows (import_id, row_num);

create table if not exists public.external_refs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  entity_type text not null,
  entity_id   uuid not null,
  source      text not null,
  external_id text not null,                 -- csv: '<import_id>:<row_num>'
  created_at  timestamptz not null default now()
);
create unique index if not exists external_refs_source_idx
  on public.external_refs (org_id, entity_type, source, external_id);
create index if not exists external_refs_entity_idx
  on public.external_refs (entity_type, entity_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Permission key follows the target entity's module: student → program.*,
-- constituent → fundraising.*. New entity types must extend perm_for_entity
-- when they gain an import target (defaulting closed would brick nothing —
-- an unknown type simply maps to a permission nobody holds).

create or replace function private.import_perm(entity_type text, verb text)
returns text
language sql immutable
set search_path = ''
as $$
  select case entity_type
    when 'constituent' then 'fundraising.' || verb
    else 'program.' || verb
  end
$$;

alter table public.imports enable row level security;

drop policy if exists "members read imports" on public.imports;
create policy "members read imports" on public.imports
  for select to authenticated
  using ( (select private.has_permission(org_id, private.import_perm(entity_type, 'read'))) );

drop policy if exists "members write imports" on public.imports;
create policy "members write imports" on public.imports
  for all to authenticated
  using ( (select private.has_permission(org_id, private.import_perm(entity_type, 'write'))) )
  with check ( (select private.has_permission(org_id, private.import_perm(entity_type, 'write'))) );

alter table public.import_rows enable row level security;

-- Rows inherit their run's entity_type; the org must match the parent so a
-- row can never be attached cross-tenant.
drop policy if exists "members read import_rows" on public.import_rows;
create policy "members read import_rows" on public.import_rows
  for select to authenticated
  using ( exists (
    select 1 from public.imports i
    where i.id = import_rows.import_id
      and i.org_id = import_rows.org_id
      and private.has_permission(i.org_id, private.import_perm(i.entity_type, 'read'))
  ) );

drop policy if exists "members write import_rows" on public.import_rows;
create policy "members write import_rows" on public.import_rows
  for all to authenticated
  using ( exists (
    select 1 from public.imports i
    where i.id = import_rows.import_id
      and i.org_id = import_rows.org_id
      and private.has_permission(i.org_id, private.import_perm(i.entity_type, 'write'))
  ) )
  with check ( exists (
    select 1 from public.imports i
    where i.id = import_rows.import_id
      and i.org_id = import_rows.org_id
      and private.has_permission(i.org_id, private.import_perm(i.entity_type, 'write'))
  ) );

alter table public.external_refs enable row level security;

drop policy if exists "members read external_refs" on public.external_refs;
create policy "members read external_refs" on public.external_refs
  for select to authenticated
  using ( (select private.has_permission(org_id, private.import_perm(entity_type, 'read'))) );

drop policy if exists "members write external_refs" on public.external_refs;
create policy "members write external_refs" on public.external_refs
  for all to authenticated
  using ( (select private.has_permission(org_id, private.import_perm(entity_type, 'write'))) )
  with check ( (select private.has_permission(org_id, private.import_perm(entity_type, 'write'))) );
