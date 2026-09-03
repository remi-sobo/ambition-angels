-- Legacy program-partner signup intake — committed migration for a table the
-- code references but production never had.
--
-- History: the public /program-partners form originally inserted into
-- `program_partners`, but the table was only ever created by hand in early
-- environments and never existed in the production project, so the form
-- silently failed. The form was rerouted onto the BloomOS partner spine
-- (app/api/program-partner-signup → `partners`), which is where signups land
-- today. Two code paths still reference this table:
--   - /api/admin/programs (the /admin/legacy dashboard's "Programs" section)
--     reads it and soft-fails to an empty payload on undefined_table;
--   - create_partners.sql carries a guarded, idempotent import from it.
-- Creating the table (empty) closes the code↔schema gap so those paths read a
-- real table instead of trapping a 42P01. Nothing writes here anymore; new
-- signups belong on `partners`.
--
-- Conventions per the tenant-default ratchet: org_id NOT NULL with NO
-- hardcoded default (any writer sets it explicitly from context), and RLS
-- enabled in this same migration with private.has_permission policies on the
-- program domain, matching `partners`. The legacy admin read uses the
-- service-role client, which bypasses RLS; the policies are the floor for any
-- session-client access. No views are created here.

create table if not exists public.program_partners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  first_name text not null,
  last_name text not null,
  org_name text not null,
  email text not null,
  program_type text not null,
  teen_count text,
  referral text,
  created_at timestamptz not null default now()
);
create index if not exists program_partners_org_created_idx
  on public.program_partners (org_id, created_at desc);

do $$
declare
  t text := 'program_partners';
begin
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
