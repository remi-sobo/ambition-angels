-- BloomOS Fundraising: per-grant contacts — the people attached to a grant
-- pursuit, CRM-deal style. A grant already links its funder ORGANIZATION
-- (grants.funder_id → constituents); this join table adds the PEOPLE — the
-- intro source, the program officer, the finance/reporting contact — each a
-- person constituent (shared, deduped record) tagged with a role, at most one
-- marked primary per grant. Additive only: no existing column changes.

-- set_updated_at() already exists (create_grants.sql). Re-assert harmlessly.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists grant_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  grant_id uuid not null references grants(id) on delete cascade,
  -- The person. RESTRICT, not cascade: unlinking from the grant is fine, but
  -- deleting a constituent who is still attached to a grant must be explicit.
  constituent_id uuid not null references constituents(id) on delete restrict,
  -- Free text; the UI seeds a suggested set: intro_source, program_officer,
  -- primary, finance_reporting, other.
  role text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grant_contacts_grant_idx on grant_contacts (grant_id);
create index if not exists grant_contacts_constituent_idx on grant_contacts (constituent_id);
create index if not exists grant_contacts_org_idx on grant_contacts (org_id);
-- At most one primary contact per grant (races resolve here, not in app code).
create unique index if not exists grant_contacts_one_primary_idx
  on grant_contacts (grant_id) where is_primary;
-- A person is attached to a grant at most once.
create unique index if not exists grant_contacts_grant_constituent_idx
  on grant_contacts (grant_id, constituent_id);

-- updated_at trigger + fundraising-domain RLS — same policy shape as
-- create_grants.sql. Deliberately NO org_id column default: the resident-org
-- default is the trap the tenant-default ratchet
-- (supabase/tests/tenant-default-ratchet.sql) forbids on new tables — every
-- writer stamps org_id explicitly.
do $$
declare
  t text;
begin
  foreach t in array array['grant_contacts'] loop
    execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_set_updated_at', t);

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
