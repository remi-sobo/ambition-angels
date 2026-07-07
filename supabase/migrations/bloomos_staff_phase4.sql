-- BloomOS Staff — Phase 4 (specs/bloomos-staff.md). Extensibility & polish.
-- Additive; safe to apply before the code deploys.
--
-- The only schema this phase needs is org_terminology: a tiny per-tenant label
-- map so an org can rename "Staff" to "Team" / "People" / "Crew" without a code
-- change (spec open-decision #8). department and employment_type already exist on
-- staff (Phase 1) — this phase surfaces and edits them in the app; pending-invite
-- ghost nodes read the existing invitations table. No new columns there.

create table if not exists public.org_terminology (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  term_key   text not null,                 -- e.g. 'staff'
  label      text not null,                 -- e.g. 'Team'
  updated_at timestamptz not null default now(),
  primary key (org_id, term_key)
);

drop trigger if exists org_terminology_set_updated_at on public.org_terminology;
create trigger org_terminology_set_updated_at
  before update on public.org_terminology
  for each row execute function public.set_updated_at();

alter table public.org_terminology enable row level security;

-- read: any org member (the nav needs the label for everyone). staff.read is held
-- by every role, so it doubles as "is a member here".
drop policy if exists "read org_terminology" on public.org_terminology;
create policy "read org_terminology" on public.org_terminology
  for select to authenticated
  using ( (select private.has_permission(org_id, 'staff.read')) );

-- write: staff.manage (an org admin renames the module).
drop policy if exists "manage org_terminology" on public.org_terminology;
create policy "manage org_terminology" on public.org_terminology
  for all to authenticated
  using ( (select private.has_permission(org_id, 'staff.manage')) )
  with check ( (select private.has_permission(org_id, 'staff.manage')) );
