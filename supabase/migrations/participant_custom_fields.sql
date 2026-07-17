-- Participant spine (spec #4), D1: per-org custom-field registry + a values
-- column on students.
--
-- Ships DORMANT: no org has field defs yet, so the participant form renders
-- exactly as before until an org inserts a def row (D2 seeds AA's grade /
-- school / guardian_* / dob). The registry is org-scoped (unlike the global
-- entity_types registry) because the fields themselves are per-tenant.
--
-- Post-fence shape: org_id is NOT NULL with NO default — every write supplies
-- it (the tenant-default ratchet forbids a new default). Values live in a
-- JSONB column on the entity (join-free reads, GIN for containment filters);
-- the registry, not the JSON, is the source of truth for what fields exist,
-- and lib/admin/customFields.ts validates the JSON against it on every write.

create table if not exists public.custom_field_defs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  entity_type text not null,                 -- 'student' now; 'constituent'/'partner' later
  key         text not null,                 -- stable snake_case identifier, per (org, entity)
  label       text not null,                 -- tenant-facing
  field_type  text not null check (field_type in
                ('text','number','date','select','multiselect','boolean','phone','email')),
  options     jsonb,                          -- ['9','10','11','12'] for select/multiselect
  required    boolean not null default false,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists custom_field_defs_key_idx
  on public.custom_field_defs (org_id, entity_type, key);
create index if not exists custom_field_defs_org_entity_idx
  on public.custom_field_defs (org_id, entity_type) where archived = false;

-- Values on the entity. GIN index makes custom_fields @> '{"grade":"9"}' filterable.
alter table public.students add column if not exists custom_fields jsonb not null default '{}'::jsonb;
create index if not exists students_custom_fields_gin on public.students using gin (custom_fields);

drop trigger if exists custom_field_defs_set_updated_at on public.custom_field_defs;
create trigger custom_field_defs_set_updated_at
  before update on public.custom_field_defs
  for each row execute function set_updated_at();

-- RLS: same gates as the program module (create_students.sql) — read on
-- program.read, write on program.write, both org-scoped via private.has_permission.
alter table public.custom_field_defs enable row level security;

drop policy if exists "members read custom_field_defs" on public.custom_field_defs;
create policy "members read custom_field_defs" on public.custom_field_defs
  for select to authenticated
  using ( (select private.has_permission(org_id, 'program.read')) );

drop policy if exists "members write custom_field_defs" on public.custom_field_defs;
create policy "members write custom_field_defs" on public.custom_field_defs
  for all to authenticated
  using ( (select private.has_permission(org_id, 'program.write')) )
  with check ( (select private.has_permission(org_id, 'program.write')) );
