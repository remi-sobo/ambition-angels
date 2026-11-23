-- V4 Stage F: one import wizard with undo (specs/bloomos-v4-product-readiness.md
-- §11 "Imports: one wizard with column mapping, validation, duplicate check,
-- preview and undo").
--
-- Additive and nullable only. NOT applied by the code change; apply with
-- Remi's yes.
--
-- 1. imports gains the 'gift' target (donor + gift rows, replacing the older
--    /admin/fundraising/import wizard) and an 'undone' status, plus who undid
--    it and when.
-- 2. constituents, gifts and students gain a nullable import_id: the batch
--    that created the row. Undo deletes only rows carrying that batch id, in
--    the batch's own org. Rows created any other way keep import_id null, and
--    every existing row is null (no back-fill).
-- 3. private.import_perm maps 'gift' to fundraising.*, so the imports /
--    import_rows / external_refs RLS for a gift import is fundraising's.
--
-- Idempotent: drop-and-add of the two check constraints, `add column if not
-- exists`, `create index if not exists`, `create or replace function`.

alter table public.imports drop constraint if exists imports_entity_type_check;
alter table public.imports add constraint imports_entity_type_check
  check (entity_type in ('student', 'constituent', 'gift'));

alter table public.imports drop constraint if exists imports_status_check;
alter table public.imports add constraint imports_status_check
  check (status in ('mapping', 'staged', 'committing', 'done', 'failed', 'undone'));

alter table public.imports add column if not exists undone_at timestamptz;
alter table public.imports add column if not exists undone_by uuid;

alter table public.constituents add column if not exists import_id uuid references public.imports(id) on delete set null;
alter table public.gifts        add column if not exists import_id uuid references public.imports(id) on delete set null;
alter table public.students     add column if not exists import_id uuid references public.imports(id) on delete set null;

create index if not exists constituents_import_idx on public.constituents (org_id, import_id) where import_id is not null;
create index if not exists gifts_import_idx        on public.gifts (org_id, import_id) where import_id is not null;
create index if not exists students_import_idx     on public.students (org_id, import_id) where import_id is not null;

create or replace function private.import_perm(entity_type text, verb text)
returns text
language sql immutable
set search_path = ''
as $$
  select case entity_type
    when 'constituent' then 'fundraising.' || verb
    when 'gift' then 'fundraising.' || verb
    else 'program.' || verb
  end
$$;
